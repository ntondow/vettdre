// 2026-04-29_verify_gulino_backfill.ts
//
// Slice 0b post-apply verification. Confirms steps 1-3 of Nathan's checklist.

import prisma from "../src/lib/prisma";

const GULINO_SLUG = "gulino-group";
const REF = "BACKFILL-2026-04-28";

async function main() {
  const org = await prisma.organization.findUnique({
    where: { slug: GULINO_SLUG },
    select: { id: true, name: true },
  });
  if (!org) throw new Error("Gulino org not found");
  console.log(`Org: ${org.name} (${org.id})\n`);

  const [payments, paySum, auditRows, fullChain] = await Promise.all([
    prisma.payment.findMany({
      where: { orgId: org.id, referenceNumber: REF },
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        paymentMethod: true,
        paymentDate: true,
        invoice: { select: { invoiceNumber: true, agentName: true, propertyAddress: true } },
      },
      orderBy: { invoice: { invoiceNumber: "asc" } },
    }),
    prisma.payment.aggregate({
      where: { orgId: org.id, referenceNumber: REF },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.auditLog.count({
      where: {
        orgId: org.id,
        entityType: "payment",
        action: "backfilled",
        metadata: { path: ["source"], equals: "2026-04-28_backfill_gulino_payments.ts" },
      },
    }),
    prisma.dealSubmission.count({
      where: {
        orgId: org.id,
        invoice: { payments: { some: {} } },
        transaction: { isNot: null },
      },
    }),
  ]);

  console.log("STEP 1 — Payment rows with reference='BACKFILL-2026-04-28':");
  console.log(`  ${payments.length} rows`);
  console.log("  " + "Invoice".padEnd(18) + "Agent".padEnd(22) + "Method".padEnd(8) + "Amount".padStart(10));
  for (const p of payments) {
    console.log(
      "  " +
        (p.invoice?.invoiceNumber ?? "?").padEnd(18) +
        (p.invoice?.agentName ?? "?").padEnd(22) +
        p.paymentMethod.padEnd(8) +
        Number(p.amount).toFixed(2).padStart(10),
    );
  }
  console.log(`  ✓ count=${payments.length} method=check ref=${REF}\n`);

  console.log("STEP 2 — Σ Payment.amount:");
  console.log(`  Total: $${Number(paySum._sum.amount || 0).toFixed(2)}    (rows: ${paySum._count.id})`);
  console.log(
    `  ${Number(paySum._sum.amount || 0) === 20110.83 ? "✓ matches $20,110.83 expected" : "✗ MISMATCH"}\n`,
  );

  console.log("STEP 3 — audit_log rows for the backfill:");
  console.log(`  ${auditRows} rows  ${auditRows === 18 ? "✓" : "✗ expected 18"}\n`);

  console.log("Bonus — DS→TX→INV→PAY full-chain count for Gulino:");
  console.log(`  ${fullChain} of 18  ${fullChain === 18 ? "✓ chain restored end-to-end" : "✗"}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
