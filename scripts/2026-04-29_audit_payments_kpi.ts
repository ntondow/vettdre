// 2026-04-29_audit_payments_kpi.ts
//
// Read-only sanity check for Phase 0 verification Failure 1: /brokerage/payments
// shows TOTAL PAID=$0 / 18 missing under ?as_org=Gulino.
//
// Three hypotheses:
//   (a) Aggregate KPI queries skip override threading
//   (b) Backfill ran against wrong orgId
//   (c) Default date filter excludes March/April paid_dates
//
// This script proves/disproves (b) by directly counting Payment rows for
// Gulino's orgId. If 18/$20,110.83 → (b) ruled out, real bug is (a) or (c).

import prisma from "../src/lib/prisma";

const GULINO_ORGID = "5ecba9ba-6de1-4b1e-bb6a-3f2dfef81670";

async function main() {
  console.log(`Reading Payment rows for orgId=${GULINO_ORGID}...\n`);

  const all = await prisma.payment.aggregate({
    where: { orgId: GULINO_ORGID },
    _sum: { amount: true },
    _count: { id: true },
  });
  console.log(`ALL payments for Gulino:`);
  console.log(`  count=${all._count.id}`);
  console.log(`  sum=$${Number(all._sum.amount || 0).toFixed(2)}\n`);

  const backfilled = await prisma.payment.aggregate({
    where: { orgId: GULINO_ORGID, referenceNumber: "BACKFILL-2026-04-28" },
    _sum: { amount: true },
    _count: { id: true },
  });
  console.log(`Backfilled rows (ref=BACKFILL-2026-04-28):`);
  console.log(`  count=${backfilled._count.id}`);
  console.log(`  sum=$${Number(backfilled._sum.amount || 0).toFixed(2)}\n`);

  // Date distribution — does any default date filter on the Payments page
  // exclude these by date?
  const byMonth = await prisma.$queryRaw<Array<{ month: string; cnt: bigint; sum: number }>>`
    SELECT to_char(payment_date, 'YYYY-MM') AS month,
           COUNT(*)::bigint AS cnt,
           SUM(amount)::numeric AS sum
      FROM payments
     WHERE org_id = ${GULINO_ORGID}
     GROUP BY 1
     ORDER BY 1
  `;
  console.log(`Payment-date distribution:`);
  for (const row of byMonth) {
    console.log(`  ${row.month}: ${row.cnt} rows, $${Number(row.sum).toFixed(2)}`);
  }
  console.log("");

  // Cross-check: home org (Nathan's NTREC) — what payments live there?
  const nathan = await prisma.organization.findUnique({
    where: { slug: "nathan-tondow-org" },
    select: { id: true, name: true },
  });
  if (nathan) {
    const nathanPay = await prisma.payment.aggregate({
      where: { orgId: nathan.id },
      _sum: { amount: true },
      _count: { id: true },
    });
    console.log(`Nathan's home org "${nathan.name}" (${nathan.id}):`);
    console.log(`  count=${nathanPay._count.id}`);
    console.log(`  sum=$${Number(nathanPay._sum.amount || 0).toFixed(2)}`);
  }

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
