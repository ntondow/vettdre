/**
 * Bulk Spine Ingest CLI — run via tsx for one-time bulk load of
 * condo_ownership.buildings + units from eguu-7ie3.
 *
 * Bypasses the MAX_BUILDINGS_PER_RUN cap that protects the cron from the
 * 300s Cloud Run timeout. Runs against production DB via DATABASE_URL.
 *
 * Usage:
 *   npx tsx scripts/condo-ingest/refresh-spine.ts                    # all 5 boroughs
 *   npx tsx scripts/condo-ingest/refresh-spine.ts --boroughs=1       # Manhattan only
 *   npx tsx scripts/condo-ingest/refresh-spine.ts --boroughs=1,3,4   # Manhattan + Brooklyn + Queens
 *
 * Estimated runtime (full 5 boroughs): 30-60 minutes depending on Socrata
 * throughput and GeoSearch latency. Resumable: idempotent upserts mean
 * re-running is safe (will refresh existing records, add new ones).
 */

import { refreshCondoUnits } from "../../src/lib/condo-ingest/units";
import prisma from "../../src/lib/prisma";

function parseArgs(): { boroughs: number[] } {
  const args = process.argv.slice(2);
  const boroArg = args.find((a) => a.startsWith("--boroughs="));
  const boroughs = boroArg
    ? boroArg
        .split("=")[1]
        .split(",")
        .map(Number)
        .filter((b) => b >= 1 && b <= 5)
    : [1, 2, 3, 4, 5];
  return { boroughs };
}

async function main() {
  const { boroughs } = parseArgs();
  console.log(`[refresh-spine] Starting bulk spine ingest for boroughs: ${boroughs.join(",")}`);
  console.log(`[refresh-spine] fullRun=true — MAX_BUILDINGS_PER_RUN cap bypassed.`);
  console.log(`[refresh-spine] Estimated runtime: ${boroughs.length * 6}-${boroughs.length * 12} minutes.`);
  console.log("");

  const start = Date.now();

  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!org) {
    console.error("[refresh-spine] No organization found in DB. Aborting.");
    process.exit(1);
  }
  console.log(`[refresh-spine] Target org: ${org.name} (${org.id})`);
  console.log("");

  const result = await refreshCondoUnits(org.id, boroughs, { fullRun: true });

  console.log("");
  console.log("=== Bulk spine ingest complete ===");
  console.log(`Total buildings upserted: ${result.totalBuildings}`);
  console.log(`Total units upserted:     ${result.totalUnits}`);
  console.log(`Total errors:             ${result.totalErrors}`);
  console.log(`Wall clock:               ${Math.round(result.durationMs / 1000)}s`);
  console.log("");
  console.log("Per-borough breakdown:");
  for (const b of result.boroughs) {
    console.log(
      `  Boro ${b.borough}: ${b.buildingsUpserted} buildings, ${b.unitsUpserted} units, ` +
      `${b.errors} errors (${Math.round(b.durationMs / 1000)}s)`,
    );
  }

  await prisma.$disconnect();
  process.exit(result.totalErrors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[refresh-spine] FATAL:", e);
  process.exit(1);
});
