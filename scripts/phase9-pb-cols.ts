import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cols = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'portfolio_buildings'
    ORDER BY ordinal_position
  `);
  console.log("=== Production portfolio_buildings columns ===");
  cols.forEach((c) => console.log(`  ${c.column_name.padEnd(30)} ${c.data_type}`));

  // Quick smoke test
  console.log("\n=== Smoke test: prisma.portfolioBuilding.findFirst() ===");
  try {
    const result = await prisma.portfolioBuilding.findFirst();
    console.log("✓ Query succeeded, result:", result);
  } catch (e: any) {
    console.log("✗ Query failed:", e.message);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
