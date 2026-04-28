import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(process.env.HOME!, `vettdre-pre-phase9-${ts}`);
  fs.mkdirSync(dir, { recursive: true });

  // Use raw SQL to bypass schema drift (e.g., portfolios.total_buildings)
  const tables = [
    "portfolios",
    "portfolio_buildings",
    "prospecting_items",
    "building_cache",
    "terminal_events",
  ];

  for (const tbl of tables) {
    process.stdout.write(`Exporting ${tbl}... `);
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "${tbl}"`);
    const file = path.join(dir, `${tbl}.json`);
    // BigInt-safe stringify
    const json = JSON.stringify(
      rows,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    );
    fs.writeFileSync(file, json);
    const sizeMB = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
    console.log(`${rows.length} rows, ${sizeMB} MB → ${file}`);
  }

  console.log(`\nBackup directory: ${dir}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("BACKUP FAILED:", e);
  process.exit(1);
});
