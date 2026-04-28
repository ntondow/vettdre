import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n=== Tables in condo_ownership schema ===");
  const tables = await prisma.$queryRawUnsafe<any[]>(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'condo_ownership' 
    ORDER BY tablename
  `);
  if (tables.length === 0) {
    console.log("(none)");
  } else {
    tables.forEach((t) => console.log(`  - ${t.tablename}`));
  }

  console.log("\n=== Migration history (Phase 9 migrations only) ===");
  const migs = await prisma.$queryRawUnsafe<any[]>(`
    SELECT 
      migration_name, 
      started_at, 
      finished_at, 
      rolled_back_at, 
      applied_steps_count 
    FROM _prisma_migrations 
    WHERE migration_name LIKE '20260425%' 
    ORDER BY migration_name
  `);
  if (migs.length === 0) {
    console.log("(none)");
  } else {
    migs.forEach((m) => {
      const status = m.finished_at
        ? "✓ applied"
        : m.rolled_back_at
        ? "✗ rolled back"
        : "⚠ FAILED (started but not finished)";
      console.log(`  ${m.migration_name}: ${status}`);
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("INSPECT FAILED:", e);
  process.exit(1);
});
