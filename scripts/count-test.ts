import prisma from "../src/lib/prisma";
async function main() {
  const buildings = await prisma.coBuilding.count();
  const units = await prisma.coUnit.count();
  console.log(`Buildings: ${buildings}, Units: ${units}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
