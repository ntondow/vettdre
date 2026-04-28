import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cols = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string; is_nullable: string }[]>(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'portfolios'
    ORDER BY ordinal_position
  `);
  console.log("=== Production portfolios columns ===");
  cols.forEach((c) => console.log(`  ${c.column_name.padEnd(30)} ${c.data_type.padEnd(25)} ${c.is_nullable === "YES" ? "NULL" : "NOT NULL"}`));
  console.log(`\nTotal: ${cols.length} columns`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
