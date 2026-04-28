import prisma from "../src/lib/prisma";
async function main() {
  console.log("[1/3] Connecting...");
  const result = await prisma.$queryRawUnsafe<any[]>("SELECT 1 as ok");
  console.log("[2/3] Connected:", result);
  console.log("[3/3] Disconnecting...");
  await prisma.$disconnect();
  console.log("Done.");
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
