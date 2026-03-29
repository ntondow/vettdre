// ============================================================
// A/B Testing Framework for Leasing Follow-Up Messages
//
// Deterministic variant assignment, reply-rate tracking,
// chi-squared significance test, auto-promotion of winners.
// ============================================================

import prisma from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────

export type AbVariant = "A" | "B";

export interface AbTest {
  id: string;
  name: string;
  followUpType: string; // FollowUpType enum value
  templateA: string;    // supports [name] [building] [unit] [amenity] tokens
  templateB: string;
  metric: "reply_rate" | "showing_rate";
  active: boolean;
  winnerId?: AbVariant;
}

export interface AbResults {
  testId: string;
  testName: string;
  variantA: { sent: number; converted: number; rate: number };
  variantB: { sent: number; converted: number; rate: number };
  significant: boolean;
  winner: AbVariant | null;
  pValue: number;
}

// ── Default Tests ────────────────────────────────────────────

const DEFAULT_TESTS: AbTest[] = [
  {
    id: "touch1_tone",
    name: "Touch 1: Direct vs Soft",
    followUpType: "touch_1",
    templateA: "Hey [name], still looking for a place at [building]? I have a few spots open this week.",
    templateB: "Hi [name] — just wanted to check in on your search. Happy to answer any questions about [building] whenever you're ready.",
    metric: "reply_rate",
    active: true,
  },
  {
    id: "touch2_social_proof",
    name: "Touch 2: Social Proof vs Feature Focus",
    followUpType: "touch_2",
    templateA: "A few people toured [building] this week and really loved it. Still want to come take a look?",
    templateB: "Just a reminder — [building] has [amenity] that's hard to find in this price range. Worth a visit!",
    metric: "showing_rate",
    active: true,
  },
];

// ── djb2 Hash ────────────────────────────────────────────────

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ── Variant Assignment (Deterministic) ──────────────────────

export function assignVariant(conversationId: string, testId: string): AbVariant {
  return djb2(conversationId + testId) % 2 === 0 ? "A" : "B";
}

// ── Get Tests from Config ───────────────────────────────────

export function getTestsFromConfig(buildingKnowledge: any): AbTest[] {
  const bk = (buildingKnowledge && typeof buildingKnowledge === "object") ? buildingKnowledge as Record<string, any> : {};
  const stored = Array.isArray(bk.abTests) ? bk.abTests as AbTest[] : [];

  // Merge stored state with defaults (stored state wins for active/winnerId)
  const storedMap = new Map(stored.map((t) => [t.id, t]));

  return DEFAULT_TESTS.map((def) => {
    const override = storedMap.get(def.id);
    if (override) {
      return { ...def, active: override.active, winnerId: override.winnerId };
    }
    return { ...def };
  });
}

// ── Get Active Test for Follow-Up Type ──────────────────────

export function getActiveTest(tests: AbTest[], followUpType: string): AbTest | null {
  return tests.find((t) => t.followUpType === followUpType && t.active && !t.winnerId) || null;
}

// ── Get Winner Template ─────────────────────────────────────

export function getWinnerTemplate(test: AbTest): string | null {
  if (!test.winnerId) return null;
  return test.winnerId === "A" ? test.templateA : test.templateB;
}

// ── Get Promoted Test for Follow-Up Type ────────────────────
// Returns winner template if test is promoted (winnerId set)

export function getPromotedTemplate(tests: AbTest[], followUpType: string): string | null {
  const test = tests.find((t) => t.followUpType === followUpType && t.winnerId);
  if (!test) return null;
  return getWinnerTemplate(test);
}

// ── Token Replacement ───────────────────────────────────────

export function replaceAbTokens(
  template: string,
  context: { name?: string; building?: string; unit?: string; amenity?: string },
): string {
  return template
    .replace(/\[name\]/g, context.name || "there")
    .replace(/\[building\]/g, context.building || "the apartment")
    .replace(/\[unit\]/g, context.unit || "a unit")
    .replace(/\[amenity\]/g, context.amenity || "great amenities");
}

// ── A/B Results Query ───────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function getAbResults(testId: string, configId: string): Promise<AbResults> {
  const tests = await getTestsForConfig(configId);
  const test = tests.find((t) => t.id === testId);
  if (!test) {
    return {
      testId, testName: testId,
      variantA: { sent: 0, converted: 0, rate: 0 },
      variantB: { sent: 0, converted: 0, rate: 0 },
      significant: false, winner: null, pValue: 1,
    };
  }

  const variantAId = `${testId}_A`;
  const variantBId = `${testId}_B`;

  // Fetch all sent follow-ups with these variant IDs for this config
  const followUps = await prisma.leasingFollowUp.findMany({
    where: {
      variantId: { in: [variantAId, variantBId] },
      status: "sent",
      conversation: { configId },
    },
    select: {
      id: true,
      variantId: true,
      sentAt: true,
      conversationId: true,
    },
  });

  if (followUps.length === 0) {
    return {
      testId, testName: test.name,
      variantA: { sent: 0, converted: 0, rate: 0 },
      variantB: { sent: 0, converted: 0, rate: 0 },
      significant: false, winner: null, pValue: 1,
    };
  }

  // For each follow-up, check if prospect replied within 7 days
  const convIds = [...new Set(followUps.map((f) => f.conversationId))];
  const prospectMessages = await prisma.leasingMessage.findMany({
    where: {
      conversationId: { in: convIds },
      sender: "prospect",
    },
    select: { conversationId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Index prospect messages by conversation
  const prospectMsgMap = new Map<string, Date[]>();
  for (const msg of prospectMessages) {
    const arr = prospectMsgMap.get(msg.conversationId) || [];
    arr.push(msg.createdAt);
    prospectMsgMap.set(msg.conversationId, arr);
  }

  let aConverted = 0, aSent = 0, bConverted = 0, bSent = 0;

  for (const fu of followUps) {
    const isA = fu.variantId === variantAId;
    if (isA) aSent++; else bSent++;

    if (!fu.sentAt) continue;
    const sentTime = fu.sentAt.getTime();
    const windowEnd = sentTime + SEVEN_DAYS_MS;

    const msgs = prospectMsgMap.get(fu.conversationId) || [];
    const replied = msgs.some((d) => d.getTime() > sentTime && d.getTime() < windowEnd);

    if (replied) {
      if (isA) aConverted++; else bConverted++;
    }
  }

  const aRate = aSent > 0 ? Math.round((aConverted / aSent) * 1000) / 10 : 0;
  const bRate = bSent > 0 ? Math.round((bConverted / bSent) * 1000) / 10 : 0;

  // Chi-squared test for significance
  const { pValue, significant, winner } = chiSquaredTest(aConverted, aSent - aConverted, bConverted, bSent - bConverted);

  return {
    testId,
    testName: test.name,
    variantA: { sent: aSent, converted: aConverted, rate: aRate },
    variantB: { sent: bSent, converted: bConverted, rate: bRate },
    significant,
    winner,
    pValue,
  };
}

// ── Chi-Squared Approximation ───────────────────────────────
// 2x2 contingency table: [a, b] / [c, d]
// a = A converted, b = A not converted
// c = B converted, d = B not converted

function chiSquaredTest(
  a: number, b: number, c: number, d: number,
): { pValue: number; significant: boolean; winner: AbVariant | null } {
  const n = a + b + c + d;

  if (n === 0 || (a + b) < 30 || (c + d) < 30) {
    return { pValue: 1, significant: false, winner: null };
  }

  const num = (a * d - b * c) ** 2 * n;
  const den = (a + b) * (c + d) * (a + c) * (b + d);

  if (den === 0) return { pValue: 1, significant: false, winner: null };

  const chi2 = num / den;

  // p-value approximation for 1 degree of freedom
  const pValue = Math.exp(-chi2 / 2);

  const significant = pValue < 0.05;
  let winner: AbVariant | null = null;

  if (significant) {
    const rateA = (a + b) > 0 ? a / (a + b) : 0;
    const rateB = (c + d) > 0 ? c / (c + d) : 0;
    winner = rateA >= rateB ? "A" : "B";
  }

  return { pValue: Math.round(pValue * 10000) / 10000, significant, winner };
}

// ── Helper: Get Tests for Config ────────────────────────────

async function getTestsForConfig(configId: string): Promise<AbTest[]> {
  const config = await prisma.leasingConfig.findUnique({
    where: { id: configId },
    select: { buildingKnowledge: true },
  });
  return getTestsFromConfig(config?.buildingKnowledge);
}

// ── Check and Promote Winners ───────────────────────────────

export async function checkAndPromoteWinners(configId: string): Promise<void> {
  const config = await prisma.leasingConfig.findUnique({
    where: { id: configId },
    select: { buildingKnowledge: true },
  });
  if (!config) return;

  const tests = getTestsFromConfig(config.buildingKnowledge);
  const activeTests = tests.filter((t) => t.active && !t.winnerId);
  let changed = false;

  for (const test of activeTests) {
    const results = await getAbResults(test.id, configId);
    if (results.significant && results.winner) {
      test.winnerId = results.winner;
      test.active = false;
      changed = true;
      console.log(JSON.stringify({
        event: "ab_winner_promoted",
        testId: test.id,
        winner: results.winner,
        pValue: results.pValue,
        configId,
      }));
    }
  }

  if (changed) {
    const bk = (config.buildingKnowledge && typeof config.buildingKnowledge === "object")
      ? config.buildingKnowledge as Record<string, any>
      : {};
    await prisma.leasingConfig.update({
      where: { id: configId },
      data: {
        buildingKnowledge: {
          ...bk,
          abTests: tests.map(({ id, active, winnerId }) => ({ id, active, winnerId })),
        },
      },
    });
  }
}

// ── Get All Results for Analytics ───────────────────────────

export async function getAllAbResults(configId: string): Promise<AbResults[]> {
  const tests = await getTestsForConfig(configId);
  const results: AbResults[] = [];
  for (const test of tests) {
    results.push(await getAbResults(test.id, configId));
  }
  return results;
}
