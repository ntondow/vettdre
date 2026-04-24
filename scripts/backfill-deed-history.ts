/**
 * Backfill — Fix swapped buyer/seller in enrichmentPackage.ownership_chain.deedHistory
 *
 * The bug: terminal-enrichment.ts mapped ACRIS party type 2 → buyerName
 * and type 1 → sellerName. Correct mapping: type 1 = grantee (buyer),
 * type 2 = grantor (seller).
 *
 * This script re-reads metadata._parties for each affected event,
 * recomputes deedHistory.buyerName and .sellerName, and writes back.
 * Also fixes event_core.rawFields.buyers and .sellers for SALE_RECORDED events.
 *
 * Idempotent: re-running on already-fixed data is a no-op (detects correct mapping).
 *
 * Usage:
 *   npx tsx scripts/backfill-deed-history.ts --dry-run   # preview changes
 *   npx tsx scripts/backfill-deed-history.ts              # apply changes
 */

import prisma from "../src/lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");
const LOG_INTERVAL = 100;

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log("");

  // Find all events with enrichmentPackage containing ownership_chain.deedHistory
  const events = await prisma.terminalEvent.findMany({
    where: {
      enrichmentPackage: { not: { equals: null } },
    },
    select: {
      id: true,
      eventType: true,
      bbl: true,
      metadata: true,
      enrichmentPackage: true,
    },
  });

  console.log(`Total events with enrichment: ${events.length}`);

  let scanned = 0;
  let fixed = 0;
  let skipped = 0;
  let noParties = 0;
  let noDeedHistory = 0;

  for (const event of events) {
    scanned++;

    const ep = event.enrichmentPackage as any;
    const meta = event.metadata as any;
    if (!ep || !meta) { skipped++; continue; }

    const parties: Array<{ name: string; type: string | number }> = meta._parties || [];
    if (parties.length === 0) { noParties++; continue; }

    const deedHistory = ep.ownership_chain?.deedHistory;
    if (!deedHistory || deedHistory.length === 0) { noDeedHistory++; continue; }

    // Correct mapping: type 1 = grantee (buyer), type 2 = grantor (seller)
    const correctBuyers = parties.filter(p => String(p.type) === "1").map(p => p.name).filter(Boolean);
    const correctSellers = parties.filter(p => String(p.type) === "2").map(p => p.name).filter(Boolean);
    const correctBuyer = correctBuyers[0] || null;
    const correctSeller = correctSellers[0] || null;

    const deed = deedHistory[0];
    const currentBuyer = deed.buyerName;
    const currentSeller = deed.sellerName;

    // Check if already correct (idempotent)
    if (currentBuyer === correctBuyer && currentSeller === correctSeller) {
      skipped++;
      continue;
    }

    // Also fix rawFields for SALE_RECORDED events
    let rawFieldsFixed = false;
    if (event.eventType === "SALE_RECORDED" && ep.event_core?.rawFields) {
      const rf = ep.event_core.rawFields;
      if (rf.buyers || rf.sellers) {
        rf.buyers = correctBuyers;
        rf.sellers = correctSellers;
        rawFieldsFixed = true;
      }
    }

    if (DRY_RUN && fixed < 5) {
      console.log(`\n  [WOULD FIX] ${event.bbl} (${event.eventType})`);
      console.log(`    buyerName:  "${currentBuyer}" → "${correctBuyer}"`);
      console.log(`    sellerName: "${currentSeller}" → "${correctSeller}"`);
      if (rawFieldsFixed) console.log(`    rawFields.buyers/sellers: also fixed`);
    }

    if (!DRY_RUN) {
      deed.buyerName = correctBuyer;
      deed.sellerName = correctSeller;

      await prisma.terminalEvent.update({
        where: { id: event.id },
        data: {
          enrichmentPackage: ep as any,
        },
      });
    }

    fixed++;

    if (scanned % LOG_INTERVAL === 0) {
      console.log(`  Progress: ${scanned}/${events.length} scanned, ${fixed} fixed`);
    }
  }

  console.log("");
  console.log("=".repeat(50));
  console.log(`Scanned:        ${scanned}`);
  console.log(`Fixed:          ${fixed}`);
  console.log(`Already correct:${skipped}`);
  console.log(`No parties:     ${noParties}`);
  console.log(`No deedHistory: ${noDeedHistory}`);
  console.log("=".repeat(50));

  if (DRY_RUN) {
    console.log("\nDry run complete. Run without --dry-run to apply changes.");
  } else {
    console.log("\nBackfill complete.");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
