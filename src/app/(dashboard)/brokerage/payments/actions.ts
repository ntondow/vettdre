"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { PaymentMethod, InvoiceStatus } from "@prisma/client";
import type { PaymentInput } from "@/lib/bms-types";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return { userId: user.id, orgId: user.orgId };
}

// ── Record Payment ───────────────────────────────────────────

export async function recordPayment(input: PaymentInput) {
  try {
    const { orgId } = await getCurrentOrg();

    // Verify invoice belongs to org
    const invoice = await prisma.invoice.findFirst({
      where: { id: input.invoiceId, orgId },
      select: {
        id: true,
        agentPayout: true,
        status: true,
        dealSubmissionId: true,
        agentId: true,
        payments: { select: { amount: true } },
      },
    });

    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    // Calculate total already paid
    const existingPaid = invoice.payments.reduce(
      (sum, p) => sum + Number(p.amount), 0
    );
    const newTotal = existingPaid + input.amount;
    const agentPayout = Number(invoice.agentPayout);

    if (newTotal > agentPayout * 1.005) {
      return {
        success: false,
        error: `Payment would exceed invoice total. Remaining balance: $${(agentPayout - existingPaid).toFixed(2)}`,
      };
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        orgId,
        invoiceId: input.invoiceId,
        agentId: input.agentId || invoice.agentId || null,
        amount: input.amount,
        paymentMethod: (input.paymentMethod as PaymentMethod) || "check",
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
        referenceNumber: input.referenceNumber || null,
        notes: input.notes || null,
      },
    });

    // Auto-update invoice status if fully paid
    const isFullyPaid = newTotal >= agentPayout * 0.995; // Allow small rounding tolerance
    if (isFullyPaid) {
      await prisma.invoice.update({
        where: { id: input.invoiceId, orgId },
        data: { status: "paid", paidDate: new Date() },
      });

      // Cascade to deal submission
      if (invoice.dealSubmissionId) {
        await prisma.dealSubmission.update({
          where: { id: invoice.dealSubmissionId, orgId },
          data: { status: "paid" },
        }).catch(() => {});
      }
    } else if (invoice.status === "draft") {
      // Move draft to sent when first payment comes in
      await prisma.invoice.update({
        where: { id: input.invoiceId, orgId },
        data: { status: "sent" },
      });
    }

    return JSON.parse(JSON.stringify({ success: true, payment, isFullyPaid }));
  } catch (error) {
    console.error("recordPayment error:", error);
    return { success: false, error: "Failed to record payment" };
  }
}

// ── Get Invoice Payments ─────────────────────────────────────

export async function getInvoicePayments(invoiceId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
      select: {
        id: true,
        invoiceNumber: true,
        agentPayout: true,
        status: true,
        payments: {
          include: {
            agent: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { paymentDate: "desc" },
        },
      },
    });

    if (!invoice) {
      return null;
    }

    const invoiceTotal = Number(invoice.agentPayout);
    const totalPaid = invoice.payments.reduce(
      (sum, p) => sum + Number(p.amount), 0
    );

    return JSON.parse(JSON.stringify({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceTotal,
      totalPaid,
      balance: invoiceTotal - totalPaid,
      isFullyPaid: totalPaid >= invoiceTotal * 0.995,
      payments: invoice.payments,
    }));
  } catch (error) {
    console.error("getInvoicePayments error:", error);
    return null;
  }
}

// ── Get Payment History ──────────────────────────────────────

export async function getPaymentHistory(filters?: {
  agentId?: string;
  startDate?: string;
  endDate?: string;
  method?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const { orgId } = await getCurrentOrg();
    const page = filters?.page || 1;
    const limit = filters?.limit || 25;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { orgId };

    if (filters?.agentId) {
      where.agentId = filters.agentId;
    }

    if (filters?.method && filters.method !== "all") {
      where.paymentMethod = filters.method;
    }

    if (filters?.startDate || filters?.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (filters.startDate) dateFilter.gte = new Date(filters.startDate);
      if (filters?.endDate) dateFilter.lte = new Date(filters.endDate);
      where.paymentDate = dateFilter;
    }

    const [payments, total, methodCounts] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              propertyAddress: true,
              agentName: true,
              agentPayout: true,
            },
          },
          agent: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { paymentDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.payment.count({ where }),
      prisma.payment.groupBy({
        by: ["paymentMethod"],
        where: { orgId },
        _count: { paymentMethod: true },
        _sum: { amount: true },
      }),
    ]);

    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const row of methodCounts) {
      byMethod[row.paymentMethod] = {
        count: row._count.paymentMethod,
        total: Number(row._sum.amount || 0),
      };
    }

    return JSON.parse(JSON.stringify({
      payments,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      byMethod,
    }));
  } catch (error) {
    console.error("getPaymentHistory error:", error);
    return { payments: [], total: 0, page: 1, totalPages: 0, byMethod: {} };
  }
}

// ── Delete Payment ───────────────────────────────────────────

export async function deletePayment(paymentId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, orgId },
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        invoice: {
          select: {
            id: true,
            agentPayout: true,
            status: true,
            dealSubmissionId: true,
            payments: { select: { id: true, amount: true } },
          },
        },
      },
    });

    if (!payment) {
      return { success: false, error: "Payment not found" };
    }

    // Delete the payment
    await prisma.payment.delete({
      where: { id: paymentId },
    });

    // Recalculate remaining total (excluding the deleted payment)
    const remainingPaid = payment.invoice.payments
      .filter(p => p.id !== paymentId)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const agentPayout = Number(payment.invoice.agentPayout);

    // Revert invoice status based on remaining payments
    if (remainingPaid <= 0) {
      // No payments left — revert to sent (or draft if it was never sent)
      await prisma.invoice.update({
        where: { id: payment.invoiceId, orgId },
        data: { status: "sent", paidDate: null },
      });

      // Revert deal submission from paid to invoiced
      if (payment.invoice.dealSubmissionId && payment.invoice.status === "paid") {
        await prisma.dealSubmission.update({
          where: { id: payment.invoice.dealSubmissionId, orgId },
          data: { status: "invoiced" },
        }).catch(() => {});
      }
    } else if (remainingPaid < agentPayout * 0.995 && payment.invoice.status === "paid") {
      // Was fully paid, now partially paid — revert to sent
      await prisma.invoice.update({
        where: { id: payment.invoiceId, orgId },
        data: { status: "sent", paidDate: null },
      });

      // Revert deal submission from paid to invoiced
      if (payment.invoice.dealSubmissionId) {
        await prisma.dealSubmission.update({
          where: { id: payment.invoice.dealSubmissionId, orgId },
          data: { status: "invoiced" },
        }).catch(() => {});
      }
    }

    return { success: true };
  } catch (error) {
    console.error("deletePayment error:", error);
    return { success: false, error: "Failed to delete payment" };
  }
}

// ── Get Payment Summary ──────────────────────────────────────

export async function getPaymentSummary(period?: { startDate?: string; endDate?: string }) {
  try {
    const { orgId } = await getCurrentOrg();

    const dateFilter: Record<string, unknown> = {};
    if (period?.startDate || period?.endDate) {
      const paymentDate: Record<string, Date> = {};
      if (period.startDate) paymentDate.gte = new Date(period.startDate);
      if (period?.endDate) paymentDate.lte = new Date(period.endDate);
      dateFilter.paymentDate = paymentDate;
    }

    const where = { orgId, ...dateFilter };

    const [payments, pendingInvoices, methodBreakdown, recentPayments] = await Promise.all([
      // Total paid
      prisma.payment.aggregate({
        where,
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Pending payouts (sent invoices not fully paid)
      prisma.invoice.aggregate({
        where: { orgId, status: { in: ["sent", "draft"] } },
        _sum: { agentPayout: true },
        _count: { id: true },
      }),
      // Breakdown by method
      prisma.payment.groupBy({
        by: ["paymentMethod"],
        where,
        _count: { paymentMethod: true },
        _sum: { amount: true },
      }),
      // Recent payments
      prisma.payment.findMany({
        where: { orgId },
        include: {
          invoice: {
            select: { invoiceNumber: true, propertyAddress: true, agentName: true },
          },
          agent: {
            select: { firstName: true, lastName: true },
          },
        },
        orderBy: { paymentDate: "desc" },
        take: 10,
      }),
    ]);

    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const row of methodBreakdown) {
      byMethod[row.paymentMethod] = {
        count: row._count.paymentMethod,
        total: Number(row._sum.amount || 0),
      };
    }

    return JSON.parse(JSON.stringify({
      totalPaid: Number(payments._sum.amount || 0),
      paymentCount: payments._count.id,
      totalPending: Number(pendingInvoices._sum.agentPayout || 0),
      pendingInvoiceCount: pendingInvoices._count.id,
      byMethod,
      recentPayments,
    }));
  } catch (error) {
    console.error("getPaymentSummary error:", error);
    return {
      totalPaid: 0,
      paymentCount: 0,
      totalPending: 0,
      pendingInvoiceCount: 0,
      byMethod: {},
      recentPayments: [],
    };
  }
}

// ── Export Payment History (CSV) ─────────────────────────────

export async function exportPaymentHistory(startDate: string, endDate: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const payments = await prisma.payment.findMany({
      where: {
        orgId,
        paymentDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      include: {
        invoice: {
          select: { invoiceNumber: true, propertyAddress: true, agentName: true },
        },
        agent: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { paymentDate: "asc" },
    });

    const headers = [
      "Date",
      "Invoice #",
      "Agent",
      "Agent Email",
      "Property",
      "Amount",
      "Method",
      "Reference #",
      "Notes",
    ];

    const rows = payments.map(p => [
      new Date(p.paymentDate).toLocaleDateString("en-US"),
      p.invoice.invoiceNumber,
      p.agent ? `${p.agent.firstName} ${p.agent.lastName}` : p.invoice.agentName,
      p.agent?.email || "",
      p.invoice.propertyAddress,
      Number(p.amount).toFixed(2),
      p.paymentMethod,
      p.referenceNumber || "",
      (p.notes || "").replace(/"/g, '""'),
    ]);

    const csv = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
    ].join("\n");

    return { success: true, csv };
  } catch (error) {
    console.error("exportPaymentHistory error:", error);
    return { success: false, csv: "" };
  }
}
