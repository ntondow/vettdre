import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  let pass = true;

  // 1. Confirm all 19 condo_ownership tables exist
  console.log("=== condo_ownership tables ===");
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'condo_ownership' 
    ORDER BY tablename
  `);
  console.log(`Count: ${tables.length} (expected 19)`);
  tables.forEach((t) => console.log(`  - ${t.tablename}`));
  if (tables.length !== 19) {
    console.log("⚠ TABLE COUNT MISMATCH");
    pass = false;
  } else {
    console.log("✓ Table count matches");
  }

  // 2. Confirm building_id columns on 5 existing tables
  console.log("\n=== building_id columns on existing tables ===");
  const cols = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name IN ('portfolios','portfolio_buildings','prospecting_items','building_cache','terminal_events') 
      AND column_name = 'building_id'
    ORDER BY table_name
  `);
  console.log(`Count: ${cols.length} (expected 5)`);
  cols.forEach((c) => console.log(`  - ${c.table_name}.${c.column_name}`));
  if (cols.length !== 5) {
    console.log("⚠ COLUMN COUNT MISMATCH");
    pass = false;
  } else {
    console.log("✓ All 5 building_id columns present");
  }

  // 3. Confirm row counts on existing tables match baseline
  console.log("\n=== Row count verification (baseline vs actual) ===");
  const expected = {
    portfolios: 0,
    portfolio_buildings: 0,
    prospecting_items: 1,
    building_cache: 33773,
    terminal_events: 4340,
  };
  for (const [tbl, exp] of Object.entries(expected)) {
    const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint as count FROM "${tbl}"`,
    );
    const actual = Number(result[0].count);
    const ok = actual === exp ? "✓" : "⚠";
    console.log(`  ${ok} ${tbl}: ${actual} (baseline ${exp})`);
    if (actual !== exp) pass = false;
  }

  // 4. Confirm migration 5's UNIQUE INDEX exists (the one we fixed)
  console.log("\n=== Migration 5 fix verification ===");
  const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(`
    SELECT indexname FROM pg_indexes 
    WHERE schemaname = 'condo_ownership' 
      AND tablename = 'acris_legals' 
      AND indexname = 'idx_acris_legals_unique'
  `);
  if (idx.length === 1) {
    console.log("✓ idx_acris_legals_unique exists (COALESCE expression index)");
  } else {
    console.log("⚠ idx_acris_legals_unique MISSING");
    pass = false;
  }

  console.log(`\n=== Overall: ${pass ? "✓ PASS" : "✗ FAIL"} ===`);
  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("VERIFY FAILED:", e);
  process.exit(1);
});
