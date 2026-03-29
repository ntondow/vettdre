"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// ── Auth ──────────────────────────────────────────────────────

async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: { brokerAgent: { select: { id: true, brokerageRole: true, status: true } } },
  });
  if (!user) throw new Error("User not found");

  const isAdmin = user.role === "owner" || user.role === "admin" ||
    (!!user.brokerAgent && ["brokerage_admin", "broker", "manager"].includes(user.brokerAgent.brokerageRole));

  return {
    userId: user.id,
    orgId: user.orgId,
    fullName: user.fullName || "there",
    isAdmin,
    agentId: user.brokerAgent?.id || null,
  };
}

// ── Types ─────────────────────────────────────────────────────

export interface DashboardData {
  userName: string;
  isAdmin: boolean;
  overview: {
    totalRevenue: number;
    pendingPayouts: number;
    activeListings: number;
    activeTransactions: number;
    dealsClosedThisMonth: number;
    agentCount: number;
  };
  revenueByMonth: Array<{
    month: string;
    revenue: number;
    payouts: number;
    net: number;
  }>;
  pipeline: {
    listings: Record<string, number>;
    transactions: Record<string, number>;
    invoices: Record<string, number>;
  };
  recentActivity: Array<{
    type: "listing" | "transaction" | "invoice" | "submission" | "agent";
    title: string;
    subtitle?: string;
    timestamp: string;
    href: string;
    status?: string;
    statusColor?: string;
  }>;
  topAgents: Array<{
    name: string;
    deals: number;
    revenue: number;
    rank: number;
  }>;
  alerts: Array<{
    type: "overdue_invoice" | "stale_listing" | "expiring_compliance" | "pending_approval";
    title: string;
    count: number;
    href: string;
  }>;
  crm: {
    totalContacts: number;
    newContactsThisMonth: number;
    unreadMessages: number;
    upcomingEvents: number;
  };
}

// ── Main Query ────────────────────────────────────────────────

export async function getDashboardData(): Promise<DashboardData> {
  const ctx = await getAuthContext();
  const { orgId, isAdmin, agentId } = ctx;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Agent filter: if not admin, scope to their own agent ID
  const agentFilter = isAdmin ? {} : { agentId: agentId || undefined };
  const agentFilterTx = isAdmin ? {} : { agentId: agentId || undefined };

  // ── Parallel Queries ────────────────────────────────────────

  const [
    // Overview
    paymentsThisMonth,
    pendingPayoutsAgg,
    activeListingsCount,
    activeTransactionsCount,
    closedTransactions,
    activeAgentCount,
    // Pipeline
    listingsByStatus,
    transactionsByStage,
    invoicesByStatus,
    // Activity
    recentListings,
    recentTransactions,
    recentInvoices,
    recentSubmissions,
    recentAgents,
    // Alerts
    overdueInvoices,
    staleListings,
    expiringCompliance,
    pendingApprovals,
    // Top agents
    topAgentData,
    // CRM
    totalContacts,
    newContactsThisMonth,
    unreadMessages,
    upcomingEvents,
    // Revenue by month
    paymentsLast6,
  ] = await Promise.all([
    // --- Overview ---
    prisma.payment.aggregate({
      where: { orgId, paymentDate: { gte: startOfMonth }, ...agentFilter },
      _sum: { amount: true },
    }),
    prisma.transactionAgent.aggregate({
      where: {
        transaction: { orgId, commissionReceivedAt: { not: null }, ...agentFilterTx },
        payoutStatus: "pending",
      },
      _sum: { payoutAmount: true },
    }),
    prisma.bmsListing.count({
      where: { orgId, status: { in: ["available", "showing", "application", "approved"] }, ...agentFilter },
    }),
    prisma.transaction.count({
      where: { orgId, stage: { notIn: ["closed", "cancelled"] }, ...agentFilterTx },
    }),
    prisma.transaction.count({
      where: { orgId, closedAt: { gte: startOfMonth }, ...agentFilterTx },
    }),
    prisma.brokerAgent.count({
      where: { orgId, status: "active" },
    }),

    // --- Pipeline ---
    prisma.bmsListing.groupBy({
      by: ["status"],
      where: { orgId, ...agentFilter },
      _count: { id: true },
    }),
    prisma.transaction.groupBy({
      by: ["stage"],
      where: { orgId, ...agentFilterTx },
      _count: { id: true },
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { orgId, ...agentFilter },
      _count: { id: true },
    }),

    // --- Recent Activity ---
    prisma.bmsListing.findMany({
      where: { orgId, ...agentFilter },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, address: true, unit: true, status: true, updatedAt: true, agent: { select: { firstName: true, lastName: true } } },
    }),
    prisma.transaction.findMany({
      where: { orgId, ...agentFilterTx },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, propertyAddress: true, stage: true, updatedAt: true, agent: { select: { firstName: true, lastName: true } } },
    }),
    prisma.invoice.findMany({
      where: { orgId, ...agentFilter },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, invoiceNumber: true, status: true, totalCommission: true, updatedAt: true, agentName: true },
    }),
    prisma.dealSubmission.findMany({
      where: { orgId, ...agentFilter },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, propertyAddress: true, status: true, updatedAt: true, agent: { select: { firstName: true, lastName: true } } },
    }),
    isAdmin ? prisma.brokerAgent.findMany({
      where: { orgId },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { id: true, firstName: true, lastName: true, status: true, updatedAt: true },
    }) : Promise.resolve([]),

    // --- Alerts ---
    prisma.invoice.count({
      where: { orgId, status: "sent", dueDate: { lt: now }, ...agentFilter },
    }),
    prisma.bmsListing.count({
      where: { orgId, status: "available", createdAt: { lt: thirtyDaysAgo }, ...agentFilter },
    }),
    isAdmin ? prisma.complianceDocument.count({
      where: { orgId, expiryDate: { gte: now, lte: thirtyDaysFromNow } },
    }) : Promise.resolve(0),
    prisma.dealSubmission.count({
      where: { orgId, status: { in: ["submitted", "under_review"] }, ...agentFilter },
    }),

    // --- Top agents (admin only) ---
    isAdmin ? prisma.dealSubmission.groupBy({
      by: ["agentId"],
      where: { orgId, status: { in: ["approved", "invoiced", "paid"] }, createdAt: { gte: startOfMonth } },
      _count: { id: true },
      _sum: { totalCommission: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }) : Promise.resolve([]),

    // --- CRM ---
    prisma.contact.count({ where: { orgId } }),
    prisma.contact.count({ where: { orgId, createdAt: { gte: startOfMonth } } }),
    prisma.emailMessage.count({ where: { orgId, isRead: false, direction: "inbound" } }).catch(() => 0),
    prisma.calendarEvent.count({ where: { orgId, startAt: { gte: now, lte: sevenDaysFromNow } } }).catch(() => 0),

    // --- Revenue by month (last 6 months) ---
    prisma.payment.findMany({
      where: {
        orgId,
        paymentDate: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) },
        ...agentFilter,
      },
      select: { amount: true, paymentDate: true },
    }),
  ]);

  // ── Process Revenue by Month ────────────────────────────────

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const revenueByMonth: DashboardData["revenueByMonth"] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = monthNames[d.getMonth()];

    let revenue = 0;
    for (const p of paymentsLast6) {
      if (p.paymentDate) {
        const pd = new Date(p.paymentDate);
        const pk = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, "0")}`;
        if (pk === monthKey) revenue += Number(p.amount) || 0;
      }
    }

    // Estimate payouts as ~70% of revenue (actual payout data requires more complex join)
    const payouts = Math.round(revenue * 0.7);
    revenueByMonth.push({ month: label, revenue, payouts, net: revenue - payouts });
  }

  // ── Process Pipeline ────────────────────────────────────────

  const listings: Record<string, number> = {};
  for (const g of listingsByStatus) listings[g.status] = g._count.id;

  const transactions: Record<string, number> = {};
  for (const g of transactionsByStage) transactions[g.stage] = g._count.id;

  const invoices: Record<string, number> = {};
  for (const g of invoicesByStatus) invoices[g.status] = g._count.id;

  // ── Process Activity ────────────────────────────────────────

  const LISTING_STATUS_COLORS: Record<string, string> = {
    available: "bg-green-100 text-green-700",
    showing: "bg-blue-100 text-blue-700",
    application: "bg-amber-100 text-amber-700",
    approved: "bg-purple-100 text-purple-700",
    leased: "bg-emerald-100 text-emerald-700",
    off_market: "bg-slate-100 text-slate-500",
  };
  const TX_STAGE_COLORS: Record<string, string> = {
    submitted: "bg-slate-100 text-slate-800",
    approved: "bg-green-100 text-green-800",
    lease_signing: "bg-purple-100 text-purple-800",
    under_contract: "bg-indigo-100 text-indigo-800",
    closing: "bg-purple-100 text-purple-800",
    invoice_sent: "bg-cyan-100 text-cyan-800",
    payment_received: "bg-lime-100 text-lime-800",
    closed: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-red-100 text-red-800",
  };
  const INV_STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    sent: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    void: "bg-red-100 text-red-700",
  };
  const SUB_STATUS_COLORS: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-700",
    under_review: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    invoiced: "bg-purple-100 text-purple-700",
    paid: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
  };

  type Activity = DashboardData["recentActivity"][number];
  const allActivity: Activity[] = [];

  for (const l of recentListings) {
    const addr = l.unit ? `${l.address} ${l.unit}` : l.address;
    allActivity.push({
      type: "listing",
      title: `Listing: ${addr}`,
      subtitle: l.agent ? `${l.agent.firstName} ${l.agent.lastName}` : undefined,
      timestamp: l.updatedAt.toISOString(),
      href: "/brokerage/listings",
      status: l.status,
      statusColor: LISTING_STATUS_COLORS[l.status],
    });
  }
  for (const tx of recentTransactions) {
    allActivity.push({
      type: "transaction",
      title: `Txn: ${tx.propertyAddress}`,
      subtitle: tx.agent ? `${tx.agent.firstName} ${tx.agent.lastName}` : undefined,
      timestamp: tx.updatedAt.toISOString(),
      href: `/brokerage/transactions/${tx.id}`,
      status: tx.stage,
      statusColor: TX_STAGE_COLORS[tx.stage],
    });
  }
  for (const inv of recentInvoices) {
    const amt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(Number(inv.totalCommission) || 0);
    allActivity.push({
      type: "invoice",
      title: `Invoice ${inv.invoiceNumber} — ${amt}`,
      subtitle: inv.agentName || undefined,
      timestamp: inv.updatedAt.toISOString(),
      href: "/brokerage/invoices",
      status: inv.status,
      statusColor: INV_STATUS_COLORS[inv.status],
    });
  }
  for (const sub of recentSubmissions) {
    allActivity.push({
      type: "submission",
      title: `Deal: ${sub.propertyAddress}`,
      subtitle: sub.agent ? `${sub.agent.firstName} ${sub.agent.lastName}` : undefined,
      timestamp: sub.updatedAt.toISOString(),
      href: "/brokerage/deal-submissions",
      status: sub.status,
      statusColor: SUB_STATUS_COLORS[sub.status],
    });
  }
  for (const ag of recentAgents) {
    allActivity.push({
      type: "agent",
      title: `Agent: ${ag.firstName} ${ag.lastName}`,
      subtitle: ag.status === "active" ? "Joined" : ag.status === "pending" ? "Invited" : ag.status,
      timestamp: ag.updatedAt.toISOString(),
      href: `/brokerage/agents/${ag.id}`,
      status: ag.status,
      statusColor: ag.status === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700",
    });
  }

  allActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // ── Process Top Agents ──────────────────────────────────────

  const topAgents: DashboardData["topAgents"] = [];
  if (isAdmin && Array.isArray(topAgentData) && topAgentData.length > 0) {
    const agentIds = topAgentData.map((a) => a.agentId).filter((id): id is string => id !== null);
    const agents = await prisma.brokerAgent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameMap = new Map(agents.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));

    topAgentData.forEach((a, i) => {
      topAgents.push({
        name: (a.agentId && nameMap.get(a.agentId)) || "Unknown",
        deals: a._count.id,
        revenue: Number(a._sum.totalCommission) || 0,
        rank: i + 1,
      });
    });
  }

  // ── Process Alerts ──────────────────────────────────────────

  const alerts: DashboardData["alerts"] = [];
  if (overdueInvoices > 0) {
    alerts.push({
      type: "overdue_invoice",
      title: `${overdueInvoices} overdue invoice${overdueInvoices > 1 ? "s" : ""}`,
      count: overdueInvoices,
      href: "/brokerage/invoices?status=sent",
    });
  }
  if (staleListings > 0) {
    alerts.push({
      type: "stale_listing",
      title: `${staleListings} stale listing${staleListings > 1 ? "s" : ""} (30+ days)`,
      count: staleListings,
      href: "/brokerage/listings",
    });
  }
  if (expiringCompliance > 0) {
    alerts.push({
      type: "expiring_compliance",
      title: `${expiringCompliance} compliance doc${expiringCompliance > 1 ? "s" : ""} expiring soon`,
      count: expiringCompliance,
      href: "/brokerage/compliance",
    });
  }
  if (pendingApprovals > 0) {
    alerts.push({
      type: "pending_approval",
      title: `${pendingApprovals} pending deal approval${pendingApprovals > 1 ? "s" : ""}`,
      count: pendingApprovals,
      href: "/brokerage/deal-submissions?status=submitted",
    });
  }

  return {
    userName: ctx.fullName.split(" ")[0],
    isAdmin,
    overview: {
      totalRevenue: Number(paymentsThisMonth._sum.amount) || 0,
      pendingPayouts: Number(pendingPayoutsAgg._sum.payoutAmount) || 0,
      activeListings: activeListingsCount,
      activeTransactions: activeTransactionsCount,
      dealsClosedThisMonth: closedTransactions,
      agentCount: activeAgentCount,
    },
    revenueByMonth,
    pipeline: { listings, transactions, invoices },
    recentActivity: allActivity.slice(0, 10),
    topAgents,
    alerts,
    crm: {
      totalContacts,
      newContactsThisMonth,
      unreadMessages,
      upcomingEvents,
    },
  };
}
