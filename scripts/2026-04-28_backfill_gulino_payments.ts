// 2026-04-28_backfill_gulino_payments.ts
//
// Slice 0b: backfill the missing Payment rows for Gulino's bulk-imported
// invoices. The audit (2026-04-28_audit_gulino_chain.ts) confirmed that all
// 18 DealSubmissions have Invoice rows with status='paid' and paid_date set,
// but zero Payment rows. Reports/Leaderboard sum from `payments`, not from
// `invoices.agent_payout`, which is the source of the "$0 paid out" symptom.
//
// SCOPE: hard-scoped to org slug='gulino-group' (UUID resolved at runtime).
//
// IDEMPOTENCY: skip-if-any-payment-exists on the invoice. First run creates
// a Payment for every paid invoice that has no payments. Re-runs match 0
// invoices and create 0 rows.
//
// AMOUNT: invoice.agentPayout (the canonical net-of-processing-fee figure).
//   This matches the historical reconciliation reference and what
//   Reports/Leaderboard expect to see in the payments table.
//
// PAYMENT METHOD: 'check' (default) — Gulino's actual payout method per
//   their reconciliation; can be edited per-payment after backfill if needed.
//
// PAYMENT DATE: invoice.paidDate (already populated for all 18).
//
// REFERENCE NUMBER: 'BACKFILL-2026-04-28' as a marker so future audits can
//   distinguish backfilled rows from real-time-recorded rows.
//
// AUDIT LOG: one audit_log row per inserted payment, attribution matches
//   the 2026-04-27_*.sql migration convention.
//
// Usage:
//   npx tsx scripts/2026-04-28_backfill_gulino_payments.ts            # dry-run (default)
//   npx tsx scripts/2026-04-28_backfill_gulino_payments.ts --apply    # writes
//
// Dry-run is the default safety floor. Writes only happen with --apply.

import prisma from "../src/lib/prisma";
import { randomUUID } from "node:crypto";

const GULINO_SLUG = "gulino-group";
const NATHAN_USER_ID = "b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db"; // nathan@ntrec.co
const BACKFILL_REF = "BACKFILL-2026-04-28";
const SOURCE_TAG = "2026-04-28_backfill_gulino_payments.ts";

type Mode = "dry-run" | "apply";

type Plan = {
  invoiceId: string;
  invoiceNumber: string;
  orgId: string;
  agentId: string | null;
  amount: number;
  paymentDate: Date;
  agentName: string;
  property: string;
};

function parseMode(): Mode {
  const args = process.argv.slice(2);
  if (args.includes("--apply")) return "apply";
  if (args.includes("--dry-run")) return "dry-run";
  return "dry-run";
}

async function main() {
  const mode = parseMode();
  console.log(`Mode: ${mode}${mode === "dry-run" ? " (default — no writes)" : ""}`);

  console.log(`[1/4] Resolving Gulino org by slug='${GULINO_SLUG}'...`);
  const org = await prisma.organization.findUnique({
    where: { slug: GULINO_SLUG },
    select: { id: true, name: true },
  });
  if (!org) {
    console.error(`FAIL: org with slug='${GULINO_SLUG}' not found.`);
    process.exit(1);
  }
  console.log(`      → ${org.name} (${org.id})`);

  console.log("[2/4] Building backfill plan...");
  const candidates = await prisma.invoice.findMany({
    where: {
      orgId: org.id,
      status: "paid",
      paidDate: { not: null },
      payments: { none: {} },
    },
    select: {
      id: true,
      invoiceNumber: true,
      orgId: true,
      agentId: true,
      agentName: true,
      agentPayout: true,
      paidDate: true,
      propertyAddress: true,
    },
    orderBy: { invoiceNumber: "asc" },
  });

  const plan: Plan[] = candidates.map((inv) => ({
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    orgId: inv.orgId,
    agentId: inv.agentId,
    amount: Number(inv.agentPayout),
    paymentDate: inv.paidDate as Date,
    agentName: inv.agentName,
    property: inv.propertyAddress,
  }));

  console.log(`      → ${plan.length} invoices need backfill`);

  console.log("[3/4] Plan preview:");
  console.log(
    "      " +
      "Invoice".padEnd(18) +
      "Agent".padEnd(22) +
      "Paid date  ".padEnd(13) +
      "Amount".padStart(10) +
      "  Property",
  );
  let sum = 0;
  for (const p of plan) {
    sum += p.amount;
    console.log(
      "      " +
        p.invoiceNumber.padEnd(18) +
        p.agentName.padEnd(22) +
        p.paymentDate.toISOString().slice(0, 10).padEnd(13) +
        p.amount.toFixed(2).padStart(10) +
        "  " +
        p.property,
    );
  }
  console.log("      " + "-".repeat(75));
  console.log(
    "      " +
      "TOTAL".padEnd(53) +
      sum.toFixed(2).padStart(10),
  );

  if (mode === "dry-run") {
    console.log("[4/4] Dry-run complete. No writes performed.");
    console.log(`      Re-run with --apply to insert ${plan.length} payment row(s) and ${plan.length} audit_log row(s).`);
    await prisma.$disconnect();
    return;
  }

  if (plan.length === 0) {
    console.log("[4/4] Nothing to insert (all invoices already have payments). Exiting.");
    await prisma.$disconnect();
    return;
  }

  console.log("[4/4] Applying backfill in a single transaction...");
  const result = await prisma.$transaction(async (tx) => {
    let inserted = 0;
    let skipped = 0;
    for (const p of plan) {
      // Defensive re-check inside the transaction in case of race.
      const existing = await tx.payment.findFirst({
        where: { invoiceId: p.invoiceId },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const paymentId = randomUUID();
      await tx.payment.create({
        data: {
          id: paymentId,
          orgId: p.orgId,
          invoiceId: p.invoiceId,
          agentId: p.agentId,
          amount: p.amount,
          paymentMethod: "check",
          paymentDate: p.paymentDate,
          referenceNumber: BACKFILL_REF,
          notes: `Backfilled from Gulino bulk import. Invoice ${p.invoiceNumber}.`,
        },
      });

      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          orgId: p.orgId,
          userId: NATHAN_USER_ID,
          action: "backfilled",
          entityType: "payment",
          entityId: paymentId,
          actorName: "Nathan Tondow",
          actorRole: "super_admin",
          changes: {
            invoiceId: p.invoiceId,
            invoiceNumber: p.invoiceNumber,
            amount: p.amount.toFixed(2),
            paymentMethod: "check",
            paymentDate: p.paymentDate.toISOString(),
            referenceNumber: BACKFILL_REF,
            agentId: p.agentId,
            agentName: p.agentName,
            property: p.property,
            reason:
              "gulino bulk import skipped payments table -- backfill restores DS->INV->PAY chain so reports/leaderboard match invoice.agent_payout",
          },
          metadata: {
            source: SOURCE_TAG,
            classification: "backfill",
            phase: "slice_0b_gulino_payments",
          },
        },
      });

      inserted += 1;
    }
    return { inserted, skipped };
  });

  console.log(
    `      → inserted=${result.inserted} skipped=${result.skipped} total_planned=${plan.length}`,
  );
  console.log("Done.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAIL:", e);
  await prisma.$disconnect();
  process.exit(1);
});
