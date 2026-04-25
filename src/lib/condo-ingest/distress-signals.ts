/**
 * Pre-Foreclosure Risk Composite Signal — Phase 5, Half B
 *
 * Substitute for lis pendens per Phase 3 Option B decision.
 * NYC ACRIS does not contain Notice-of-Pendency filings.
 *
 * Composite score per building (0-100), persisted to Co_building_signals
 * with signal_type = "pre_foreclosure_risk".
 *
 * Components:
 *   a) Active tax liens — 25 pts base + 5 per additional
 *   b) Mortgage maturity proximity — 20 pts (<12mo) / 10 pts (<24mo)
 *   c) HPD Class C violation density — 15 pts if > median for borough+yearBuilt
 *   d) ECB high-penalty filings — 10 pts per >$10K in trailing 12mo
 *   e) Non-bank mortgage assignment — 15 pts if most recent assignee is non-bank
 *   f) Distressed satisfaction pattern — 10 pts if SAT→MTGE within 60 days
 *   g) Lender stress overlay — 20 pts if current lender has stress_flag
 *
 * Cap at 100. Component breakdown stored in evidence JSON.
 */

import prisma from "@/lib/prisma";

export interface DistressComponent {
  name: string;
  points: number;
  maxPoints: number;
  detail: string;
}

export interface DistressResult {
  buildingId: string;
  bbl: string;
  score: number;
  components: DistressComponent[];
}

/**
 * Compute pre-foreclosure risk score for a single building.
 */
export async function computePreForeclosureRisk(
  orgId: string,
  buildingId: string,
): Promise<DistressResult> {
  const building = await prisma.coBuilding.findUnique({
    where: { id: buildingId },
    select: { id: true, bbl: true, borough: true, yearBuilt: true },
  });
  if (!building) return { buildingId, bbl: "", score: 0, components: [] };

  const components: DistressComponent[] = [];

  // (a) Active tax liens
  const lienCount = await prisma.coTaxLien.count({
    where: { orgId, buildingId, status: "active" },
  });
  if (lienCount > 0) {
    const pts = Math.min(25 + (lienCount - 1) * 5, 40); // cap component at 40
    components.push({ name: "active_tax_liens", points: pts, maxPoints: 40, detail: `${lienCount} active lien(s)` });
  }

  // (b) Mortgage maturity proximity
  const now = new Date();
  const in12mo = new Date(now.getTime() + 365 * 86_400_000);
  const in24mo = new Date(now.getTime() + 730 * 86_400_000);
  const maturingSoon = await prisma.coMortgage.findFirst({
    where: {
      orgId, buildingId, status: "active",
      maturityDate: { not: null, lte: in24mo },
    },
    select: { maturityDate: true, amount: true },
  });
  if (maturingSoon?.maturityDate) {
    const isImm = maturingSoon.maturityDate <= in12mo;
    const pts = isImm ? 20 : 10;
    const label = isImm ? "within 12 months" : "within 24 months";
    components.push({ name: "mortgage_maturity", points: pts, maxPoints: 20, detail: `Maturity ${label}` });
  }

  // (c) HPD Class C violation density
  // Query violations from the existing building_cache or Terminal events
  const classCCount = await prisma.$queryRaw<[{ cnt: bigint }]>`
    SELECT COUNT(*)::bigint as cnt FROM terminal_events
    WHERE org_id = ${orgId}
      AND building_id = ${buildingId}
      AND event_type = 'HPD_VIOLATION'
      AND metadata->>'class' = 'C'
      AND detected_at >= NOW() - INTERVAL '24 months'
  `.then(r => Number(r[0]?.cnt || 0)).catch(() => 0);

  // Median threshold: rough heuristic — 3+ Class C in 24mo is above typical
  if (classCCount >= 3) {
    components.push({ name: "hpd_class_c_density", points: 15, maxPoints: 15, detail: `${classCCount} Class C violations in 24 months` });
  }

  // (d) ECB high-penalty filings
  const ecbHighCount = await prisma.$queryRaw<[{ cnt: bigint }]>`
    SELECT COUNT(*)::bigint as cnt FROM terminal_events
    WHERE org_id = ${orgId}
      AND building_id = ${buildingId}
      AND event_type = 'ECB_HIGH_PENALTY'
      AND detected_at >= NOW() - INTERVAL '12 months'
  `.then(r => Number(r[0]?.cnt || 0)).catch(() => 0);

  if (ecbHighCount > 0) {
    const pts = Math.min(ecbHighCount * 10, 20); // cap at 20
    components.push({ name: "ecb_high_penalty", points: pts, maxPoints: 20, detail: `${ecbHighCount} ECB penalty filing(s) >$10K in 12 months` });
  }

  // (e) Non-bank mortgage assignment
  const latestAssignment = await prisma.coMortgage.findFirst({
    where: { orgId, buildingId, mortgageType: "assignment" },
    orderBy: { recordedDate: "desc" },
    select: { currentAssigneeEntityId: true },
  });
  if (latestAssignment?.currentAssigneeEntityId) {
    const assignee = await prisma.coEntity.findUnique({
      where: { id: latestAssignment.currentAssigneeEntityId },
      select: { isBank: true, canonicalName: true },
    });
    if (assignee && !assignee.isBank) {
      components.push({ name: "non_bank_assignment", points: 15, maxPoints: 15, detail: `Assigned to non-bank: ${assignee.canonicalName}` });
    }
  }

  // (f) Distressed satisfaction pattern (SAT followed by new MTGE within 60 days)
  const recentSatisfactions = await prisma.coMortgage.findMany({
    where: { orgId, buildingId, mortgageType: "satisfaction", recordedDate: { gte: new Date(now.getTime() - 365 * 86_400_000) } },
    orderBy: { recordedDate: "desc" },
    take: 3,
    select: { recordedDate: true },
  });
  for (const sat of recentSatisfactions) {
    if (!sat.recordedDate) continue;
    const window60 = new Date(sat.recordedDate.getTime() + 60 * 86_400_000);
    const quickRefi = await prisma.coMortgage.findFirst({
      where: {
        orgId, buildingId,
        mortgageType: { in: ["first", "cema"] },
        recordedDate: { gte: sat.recordedDate, lte: window60 },
      },
    });
    if (quickRefi) {
      components.push({ name: "distressed_satisfaction", points: 10, maxPoints: 10, detail: "SAT→MTGE within 60 days (refi-under-pressure)" });
      break;
    }
  }

  // (g) Lender stress overlay
  const activeMortgage = await prisma.coMortgage.findFirst({
    where: { orgId, buildingId, status: "active" },
    orderBy: { recordedDate: "desc" },
    select: { lenderEntityId: true },
  });
  if (activeMortgage?.lenderEntityId) {
    const lenderEntity = await prisma.coEntity.findUnique({
      where: { id: activeMortgage.lenderEntityId },
      select: { bankFfiecId: true },
    });
    if (lenderEntity?.bankFfiecId) {
      const stressed = await prisma.coLenderStressMetrics.findFirst({
        where: { ffiecId: lenderEntity.bankFfiecId, stressFlag: true },
        orderBy: { quarterEndDate: "desc" },
      });
      if (stressed) {
        components.push({ name: "lender_stress", points: 20, maxPoints: 20, detail: `Lender flagged as stressed (FFIEC ${lenderEntity.bankFfiecId})` });
      }
    }
  }

  const score = Math.min(100, components.reduce((s, c) => s + c.points, 0));

  return { buildingId, bbl: building.bbl, score, components };
}

/**
 * Compute and persist pre-foreclosure risk for a set of buildings.
 */
export async function recomputeDistressSignals(
  orgId: string,
  buildingIds?: string[],
): Promise<{ computed: number; errors: number; durationMs: number }> {
  const start = Date.now();
  let computed = 0;
  let errors = 0;

  // If no specific buildings, recompute all buildings with mortgages or tax liens
  const buildings = buildingIds
    ? buildingIds
    : await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT DISTINCT b.id FROM condo_ownership.buildings b
        WHERE b.org_id = ${orgId}
          AND (
            EXISTS (SELECT 1 FROM condo_ownership.mortgages m WHERE m.building_id = b.id)
            OR EXISTS (SELECT 1 FROM condo_ownership.tax_liens t WHERE t.building_id = b.id AND t.status = 'active')
          )
        LIMIT 1000
      `.then(r => r.map(b => b.id));

  for (const bid of buildings) {
    try {
      const result = await computePreForeclosureRisk(orgId, bid);

      // Persist to building_signals
      await prisma.$executeRaw`
        INSERT INTO condo_ownership.building_signals (id, org_id, building_id, signal_type, score, confidence, evidence, computed_at)
        VALUES (
          gen_random_uuid(), ${orgId}, ${bid}, 'pre_foreclosure_risk',
          ${result.score}::numeric,
          ${result.score >= 60 ? "high" : result.score >= 30 ? "medium" : "low"},
          ${JSON.stringify({ components: result.components })}::jsonb,
          NOW()
        )
        ON CONFLICT (org_id, building_id, signal_type, computed_at) DO UPDATE SET
          score = EXCLUDED.score,
          confidence = EXCLUDED.confidence,
          evidence = EXCLUDED.evidence
      `;
      computed++;
    } catch {
      errors++;
    }
  }

  console.log(`[DistressSignals] Computed ${computed} buildings, ${errors} errors (${Date.now() - start}ms)`);
  return { computed, errors, durationMs: Date.now() - start };
}
