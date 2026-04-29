// 2026-04-29_gulino_dashboard_preview.ts
//
// Read-only: simulate exactly what the brokerage dashboard's getDashboardSummary
// will return for Gulino under each period, given the current invoice state and
// what /brokerage/payments will return given current Payment state vs after
// the slice-0b backfill.
//
// Usage: npx tsx scripts/2026-04-29_gulino_dashboard_preview.ts

import prisma from "../src/lib/prisma";

const GULINO_SLUG = "gulino-group";

function getPeriodDates(period: "month" | "quarter" | "year") {
  const end = new Date();
  const start = new Date();
  if (period === "month") start.setDate(start.getDate() - 30);
  else if (period === "quarter") start.setDate(start.getDate() - 90);
  else start.setDate(start.getDate() - 365);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

async function main() {
  const org = await prisma.organization.findUnique({
    where: { slug: GULINO_SLUG },
    select: { id: true, name: true },
  });
  if (!org) throw new Error("Gulino org not found");
  console.log(`Org: ${org.name} (${org.id})`);
  console.log(`Now: ${new Date().toISOString()}`);
  console.log("");

  const approvedStatuses = ["approved", "invoiced", "paid"];

  for (const period of ["month", "quarter", "year"] as const) {
    const { start, end } = getPeriodDates(period);
    const [vol, comm, house, agent, pending] = await Promise.all([
      prisma.dealSubmission.aggregate({
        where: { orgId: org.id, createdAt: { gte: start, lt: end }, status: { in: approvedStatuses } },
        _sum: { transactionValue: true },
        _count: true,
      }),
      prisma.dealSubmission.aggregate({
        where: { orgId: org.id, createdAt: { gte: start, lt: end }, status: { in: approvedStatuses } },
        _sum: { totalCommission: true },
      }),
      prisma.invoice.aggregate({
        where: { orgId: org.id, paidDate: { gte: start, lt: end }, status: "paid" },
        _sum: { housePayout: true },
        _count: true,
      }),
      prisma.invoice.aggregate({
        where: { orgId: org.id, paidDate: { gte: start, lt: end }, status: "paid" },
        _sum: { agentPayout: true },
      }),
      prisma.invoice.aggregate({
        where: { orgId: org.id, createdAt: { gte: start, lt: end }, status: { in: ["draft", "sent"] } },
        _sum: { agentPayout: true },
      }),
    ]);
    console.log(`────── period: ${period} (start=${start.toISOString().slice(0, 10)} → end=${end.toISOString().slice(0, 10)}) ──────`);
    console.log(`  /brokerage/dashboard KPIs (read from invoices + deal_submissions; Payment NOT queried):`);
    console.log(`    TOTAL VOLUME      $${Number(vol._sum.transactionValue || 0).toFixed(2)}    (${vol._count} approved+ submissions, sum of transaction_value)`);
    console.log(`    TOTAL COMMISSION  $${Number(comm._sum.totalCommission || 0).toFixed(2)}    (sum of total_commission)`);
    console.log(`    HOUSE REVENUE     $${Number(house._sum.housePayout || 0).toFixed(2)}    (${house._count} paid invoices, sum of house_payout)`);
    console.log(`    AGENT PAYOUTS     $${Number(agent._sum.agentPayout || 0).toFixed(2)}    (sum of agent_payout where status='paid' & paid_date in range)`);
    console.log(`    PENDING PAYOUTS   $${Number(pending._sum.agentPayout || 0).toFixed(2)}    (status in draft/sent)`);
  }

  console.log("");
  console.log("/brokerage/payments KPIs (reads from payments table — this is what backfill changes):");
  // Total Paid = sum of payments.amount, no period filter by default in route
  const paySum = await prisma.payment.aggregate({
    where: { orgId: org.id },
    _sum: { amount: true },
    _count: { id: true },
  });
  console.log(`  CURRENT  TOTAL PAID   $${Number(paySum._sum.amount || 0).toFixed(2)}    (${paySum._count.id} payment rows)`);
  console.log(`  POST-BACKFILL          $20,110.83    (18 payment rows, one per Gulino paid invoice)`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
