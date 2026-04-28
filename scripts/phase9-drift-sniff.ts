import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// High-traffic user-facing models. If any fail, drift exists.
const models = [
  "user", "organization", "contact", "deal", "pipeline",
  "property", "activity", "task", "showing",
  "emailMessage", "calendarEvent",
  "portfolio", "portfolioBuilding", "prospectingList", "prospectingItem",
  "terminalEvent", "buildingCache",
  "transaction", "brokerAgent", "invoice",
  "leasingConfig", "leasingConversation",
  "dealAnalysis",
] as const;

async function main() {
  let pass = 0, fail = 0;
  for (const m of models) {
    try {
      // @ts-ignore — dynamic model access
      await prisma[m].findFirst();
      console.log(`✓ ${m}`);
      pass++;
    } catch (e: any) {
      console.log(`✗ ${m}: ${e.message.split("\n")[0]}`);
      fail++;
    }
  }
  console.log(`\n${pass} pass, ${fail} fail of ${models.length}`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
