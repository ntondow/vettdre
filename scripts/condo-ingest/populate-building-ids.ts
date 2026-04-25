/**
 * Populate building_id FKs on existing fragmented tables.
 *
 * For every distinct BBL in: portfolios, portfolio_buildings, prospecting_items,
 * building_cache, terminal_events — match to condo_ownership.buildings and set building_id.
 *
 * Idempotent: re-running is safe (only updates NULL building_id rows).
 *
 * Usage:
 *   npx tsx scripts/condo-ingest/populate-building-ids.ts
 *   npx tsx scripts/condo-ingest/populate-building-ids.ts --dry-run
 */

import prisma from "../../src/lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  // Build a BBL → building_id map from condo_ownership.buildings
  const buildings = await prisma.$queryRaw<Array<{ bbl: string; id: string; org_id: string }>>`
    SELECT bbl, id, org_id FROM condo_ownership.buildings
  `;

  const bblMap = new Map<string, string>(); // bbl → building id
  for (const b of buildings) {
    bblMap.set(b.bbl, b.id);
  }
  console.log(`Buildings in spine: ${bblMap.size}`);

  if (bblMap.size === 0) {
    console.log("No buildings in spine yet — nothing to populate. Run condo-units-refresh first.");
    await prisma.$disconnect();
    return;
  }

  // 1. portfolios — has building_id column but NO bbl column.
  //    A Portfolio is an entity-level aggregate spanning multiple buildings.
  //    The building_id on portfolios is for single-building portfolios only.
  //    We attempt to match via the portfolio's first PortfolioBuilding's BBL.
  const pfUpdated = await updatePortfolios(bblMap);

  // 2. portfolio_buildings (has bbl column)
  const pfBuildings = await updateTable(
    "portfolio_buildings",
    "bbl",
    bblMap,
  );

  // 3. prospecting_items (has block + lot but not a combined bbl column — need boro too)
  const piUpdated = await updateProspectingItems(bblMap);

  // 4. building_cache (has bbl column)
  const bcUpdated = await updateTable("building_cache", "bbl", bblMap);

  // 5. terminal_events (has bbl column)
  const teUpdated = await updateTable("terminal_events", "bbl", bblMap);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`portfolios: ${pfUpdated} updated`);
  console.log(`portfolio_buildings: ${pfBuildings} updated`);
  console.log(`prospecting_items: ${piUpdated} updated`);
  console.log(`building_cache: ${bcUpdated} updated`);
  console.log(`terminal_events: ${teUpdated} updated`);

  await prisma.$disconnect();
}

async function updateTable(
  tableName: string,
  bblColumn: string,
  bblMap: Map<string, string>,
): Promise<number> {
  // Find rows with null building_id that have a BBL matching the spine
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; bbl: string }>>(
    `SELECT id, ${bblColumn} as bbl FROM "${tableName}" WHERE building_id IS NULL AND ${bblColumn} IS NOT NULL`,
  );

  let updated = 0;
  for (const row of rows) {
    const buildingId = bblMap.get(row.bbl);
    if (!buildingId) continue;

    if (!DRY_RUN) {
      await prisma.$executeRawUnsafe(
        `UPDATE "${tableName}" SET building_id = $1 WHERE id = $2`,
        buildingId,
        row.id,
      );
    }
    updated++;
  }

  console.log(`${tableName}: ${updated}/${rows.length} rows matched (${DRY_RUN ? "dry run" : "updated"})`);
  return updated;
}

async function updatePortfolios(bblMap: Map<string, string>): Promise<number> {
  // Portfolio has no direct BBL. Try to match via the first PortfolioBuilding's BBL.
  // Only set building_id on single-building portfolios (totalBuildings === 1).
  const rows = await prisma.portfolio.findMany({
    where: { buildingId: null, totalBuildings: 1 },
    select: { id: true, buildings: { select: { bbl: true }, take: 1 } },
  });

  let updated = 0;
  for (const row of rows) {
    const bbl = row.buildings[0]?.bbl;
    if (!bbl) continue;
    const buildingId = bblMap.get(bbl);
    if (!buildingId) continue;

    if (!DRY_RUN) {
      await prisma.portfolio.update({
        where: { id: row.id },
        data: { buildingId },
      });
    }
    updated++;
  }

  console.log(`portfolios: ${updated}/${rows.length} rows matched (${DRY_RUN ? "dry run" : "updated"})`);
  return updated;
}

async function updateProspectingItems(bblMap: Map<string, string>): Promise<number> {
  // ProspectingItem has borough (name), block, lot — need to construct BBL
  const boroMap: Record<string, number> = {
    manhattan: 1, bronx: 2, brooklyn: 3, queens: 4, "staten island": 5,
    mn: 1, bx: 2, bk: 3, qn: 4, si: 5,
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
  };

  const rows = await prisma.prospectingItem.findMany({
    where: { buildingId: null, block: { not: null }, lot: { not: null } },
    select: { id: true, borough: true, block: true, lot: true },
  });

  let updated = 0;
  for (const row of rows) {
    if (!row.borough || !row.block || !row.lot) continue;
    const boroCode = boroMap[row.borough.toLowerCase()];
    if (!boroCode) continue;

    const bbl = `${boroCode}${row.block.padStart(5, "0")}${row.lot.padStart(4, "0")}`;
    const buildingId = bblMap.get(bbl);
    if (!buildingId) continue;

    if (!DRY_RUN) {
      await prisma.prospectingItem.update({
        where: { id: row.id },
        data: { buildingId },
      });
    }
    updated++;
  }

  console.log(`prospecting_items: ${updated}/${rows.length} rows matched (${DRY_RUN ? "dry run" : "updated"})`);
  return updated;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
