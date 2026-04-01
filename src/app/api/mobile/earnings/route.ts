// ── GET /api/mobile/earnings ───────────────────────────────────
// Returns earnings summary for the authenticated agent.
// Query params: ?period=month|quarter|year (default: month)

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { orgId, isAdmin, agentId } = ctx;
    const period =
      req.nextUrl.searchParams.get("period") || "month";

    // Calculate date range based on period
    const now = new Date();
    let rangeStart: Date;

    switch (period) {
      case "quarter":
        rangeStart = new Date(
          now.getFullYear(),
          Math.floor(now.getMonth() / 3) * 3,
          1
        );
        break;
      case "year":
        rangeStart = new Date(now.getFullYear(), 0, 1);
        break;
      default: // month
        rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Agent scope: non-admins only see their own data
    const agentFilter = isAdmin ? {} : { agentId: agentId || undefined };

    // Run all queries in parallel
    const [
      totalEarnings,
      pendingPayouts,
      closedDeals,
      activeListings,
      recentPayments,
      previousPeriodEarnings,
    ] = await Promise.all([
      // Total earnings this period
      prisma.payment.aggregate({
        where: {
          orgId,
          paymentDate: { gte: rangeStart },
          ...agentFilter,
        },
        _sum: { amount: true },
      }),

      // Pending payouts
      prisma.transactionAgent.aggregate({
        where: {
          transaction: {
            orgId,
            commissionReceivedAt: { not: null },
          },
          ...(agentId ? { agentId } : {}),
          payoutStatus: "pending",
        },
        _sum: { payoutAmount: true },
      }),

      // Deals closed this period
      prisma.transaction.count({
        where: {
          orgId,
          closedAt: { gte: rangeStart },
          ...agentFilter,
        },
      }),

      // Active listings
      prisma.bmsListing.count({
        where: {
          orgId,
          status: {
            in: ["available", "showing", "application", "approved"],
          },
          ...agentFilter,
        },
      }),

      // Recent payment activity (last 5)
      prisma.payment.findMany({
        where: { orgId, ...agentFilter },
        orderBy: { paymentDate: "desc" },
        take: 5,
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          paymentMethod: true,
          invoice: {
            select: {
              invoiceNumber: true,
              transaction: {
                select: { propertyAddress: true },
              },
            },
          },
        },
      }),

      // Previous period earnings (for trend comparison)
      (() => {
        let prevStart: Date;
        let prevEnd: Date;
        switch (period) {
          case "quarter": {
            const qStart = Math.floor(now.getMonth() / 3) * 3;
            prevStart = new Date(now.getFullYear(), qStart - 3, 1);
            prevEnd = new Date(now.getFullYear(), qStart, 1);
            break;
          }
          case "year":
            prevStart = new Date(now.getFullYear() - 1, 0, 1);
            prevEnd = new Date(now.getFullYear(), 0, 1);
            break;
          default:
            prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            prevEnd = rangeStart;
        }
        return prisma.payment.aggregate({
          where: {
            orgId,
            paymentDate: { gte: prevStart, lt: prevEnd },
            ...agentFilter,
          },
          _sum: { amount: true },
        });
      })(),
    ]);

    const currentAmount = Number(totalEarnings._sum.amount) || 0;
    const previousAmount = Number(previousPeriodEarnings._sum.amount) || 0;
    const trend =
      previousAmount > 0
        ? ((currentAmount - previousAmount) / previousAmount) * 100
        : currentAmount > 0
          ? 100
          : 0;

    return NextResponse.json(
      serialize({
        period,
        totalEarnings: currentAmount,
        pendingPayouts: Number(pendingPayouts._sum.payoutAmount) || 0,
        closedDeals,
        activeListings,
        trend: Math.round(trend * 10) / 10,
        closeRate:
          closedDeals > 0 && activeListings > 0
            ? Math.round(
                (closedDeals / (closedDeals + activeListings)) * 100
              )
            : 0,
        recentPayments: recentPayments.map((p) => ({
          id: p.id,
          amount: Number(p.amount) || 0,
          date: p.paymentDate,
          method: p.paymentMethod,
          property:
            p.invoice?.transaction?.propertyAddress || "Unknown property",
          invoiceNumber: p.invoice?.invoiceNumber || null,
        })),
      })
    );
  } catch (error: unknown) {
    console.error("[mobile/earnings] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch earnings" },
      { status: 500 }
    );
  }
}
