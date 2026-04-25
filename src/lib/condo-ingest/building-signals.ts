/**
 * Building Signals Layer — Phase 6
 *
 * Turns Phase 1-5 data into agent-actionable prospecting signals.
 * Each signal persists to Co_building_signals with distinct signal_type values.
 *
 * Signal types:
 *   1. forced_sale_probability — likelihood of forced sale in 18 months
 *   2. assemblage_opportunity — same-owner adjacent BBLs assemblable
 *   3. exemption_cliff — tax exemption expiring within 24 months
 *   4. sponsor_overhang — unsold sponsor units > 5 years post-construction
 *
 * Insufficient-data paths write score=NULL with evidence.reason explaining why.
 */

import prisma from "@/lib/prisma";

// ── Shared Types ─────────────────────────────────────────────

export interface SignalComponent {
  name: string;
  points: number;
  maxPoints: number;
  detail: string;
}

export interface SignalResult {
  signalType: string;
  score: number | null;
  confidence: "high" | "medium" | "low" | "insufficient_data";
  components: SignalComponent[];
  reason?: string; // set when score is null
}

function capScore(components: SignalComponent[]): number {
  const raw = components.reduce((s, c) => s + c.points, 0);
  return Math.max(0, Math.min(100, raw));
}

function confidenceFromScore(score: number | null): SignalResult["confidence"] {
  if (score === null) return "insufficient_data";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

// ── Signal 1: Forced Sale Probability ────────────────────────

export async function computeForcedSaleProbability(
  orgId: string,
  buildingId: string,
): Promise<SignalResult> {
  const components: SignalComponent[] = [];

  // (a) preForeclosureRiskScore >= 60
  const preForeclosure = await prisma.coBuildingSignal.findFirst({
    where: { orgId, buildingId, signalType: "pre_foreclosure_risk" },
    orderBy: { computedAt: "desc" },
    select: { score: true },
  });
  if (preForeclosure && Number(preForeclosure.score) >= 60) {
    components.push({ name: "pre_foreclosure_risk_high", points: 30, maxPoints: 30, detail: `preForeclosureRisk score = ${preForeclosure.score}` });
  }

  // (b) Estate filing — check if current owner name contains "ESTATE OF" or "TRUST U/F"
  const ownership = await prisma.$queryRaw<Array<{ current_owner_name: string | null }>>`
    SELECT current_owner_name FROM condo_ownership.unit_ownership_current
    WHERE org_id = ${orgId} AND building_id = ${buildingId}
    LIMIT 1
  `.then(r => r[0]).catch(() => null);

  if (ownership?.current_owner_name) {
    const upper = ownership.current_owner_name.toUpperCase();
    if (upper.includes("ESTATE OF") || upper.includes("TRUST U/F") || upper.includes("TRUST UF")) {
      components.push({ name: "estate_filing", points: 25, maxPoints: 25, detail: `Owner: ${ownership.current_owner_name}` });
    }
  }

  // (c) Owner mailing address out-of-state (absentee owner)
  const mailing = await prisma.$queryRaw<Array<{ owner_mailing_address: string | null }>>`
    SELECT owner_mailing_address FROM condo_ownership.unit_ownership_current
    WHERE org_id = ${orgId} AND building_id = ${buildingId} AND owner_mailing_address IS NOT NULL
    LIMIT 1
  `.then(r => r[0]).catch(() => null);

  if (mailing?.owner_mailing_address) {
    const addr = mailing.owner_mailing_address.toUpperCase();
    const isNY = addr.includes(", NY") || addr.includes("NEW YORK");
    if (!isNY && addr.length > 10) {
      components.push({ name: "absentee_owner", points: 10, maxPoints: 10, detail: `Mailing: ${mailing.owner_mailing_address}` });
    }
  }

  // (d) Mortgage maturity within 6 months AND lender is non-bank
  const in6mo = new Date(Date.now() + 180 * 86_400_000);
  const imminentMortgage = await prisma.coMortgage.findFirst({
    where: { orgId, buildingId, status: "active", maturityDate: { not: null, lte: in6mo } },
    include: { lenderEntity: { select: { isBank: true } } },
  });
  if (imminentMortgage && imminentMortgage.lenderEntity && !imminentMortgage.lenderEntity.isBank) {
    components.push({ name: "non_bank_imminent_maturity", points: 15, maxPoints: 15, detail: "Non-bank mortgage maturing within 6 months" });
  }

  // (e) 2+ ACRIS doc filings in trailing 12 months (activity spike)
  const recentFilings = await prisma.$queryRaw<[{ cnt: bigint }]>`
    SELECT COUNT(DISTINCT l.document_id)::bigint as cnt
    FROM condo_ownership.acris_legals l
    JOIN condo_ownership.acris_master m ON l.document_id = m.document_id
    JOIN condo_ownership.buildings b ON b.org_id = ${orgId} AND b.id = ${buildingId}
    WHERE l.bbl = b.bbl
      AND m.recorded_datetime >= NOW() - INTERVAL '12 months'
  `.then(r => Number(r[0]?.cnt || 0)).catch(() => 0);

  if (recentFilings >= 2) {
    components.push({ name: "activity_spike", points: 10, maxPoints: 10, detail: `${recentFilings} ACRIS filings in 12 months` });
  }

  // (f) Long hold period (negative signal — reduces score)
  const building = await prisma.coBuilding.findUnique({
    where: { id: buildingId },
    select: { bbl: true },
  });
  if (building) {
    const lastSale = await prisma.$queryRaw<Array<{ last_sale_date: Date | null }>>`
      SELECT last_sale_date FROM condo_ownership.unit_ownership_current
      WHERE org_id = ${orgId} AND building_id = ${buildingId} AND last_sale_date IS NOT NULL
      ORDER BY last_sale_date DESC LIMIT 1
    `.then(r => r[0]).catch(() => null);

    if (lastSale?.last_sale_date) {
      const holdYears = (Date.now() - lastSale.last_sale_date.getTime()) / (365.25 * 86_400_000);
      if (holdYears > 8) {
        components.push({ name: "long_hold_period", points: -10, maxPoints: 0, detail: `Hold period: ${Math.round(holdYears)} years (historically low turnover)` });
      }
    }
  }

  const score = capScore(components);
  return { signalType: "forced_sale_probability", score, confidence: confidenceFromScore(score), components };
}

// ── Signal 2: Assemblage Opportunity ─────────────────────────

export async function computeAssemblageOpportunity(
  orgId: string,
  buildingId: string,
): Promise<SignalResult> {
  const building = await prisma.coBuilding.findUnique({
    where: { id: buildingId },
    select: { bbl: true, borough: true, block: true, lot: true },
  });
  if (!building) {
    return { signalType: "assemblage_opportunity", score: null, confidence: "insufficient_data", components: [], reason: "Building not found" };
  }

  const components: SignalComponent[] = [];

  // (a) Adjacent BBLs (same block, lot ±5) owned by same entity
  const currentOwner = await prisma.$queryRaw<Array<{ current_owner_entity: string | null }>>`
    SELECT current_owner_entity FROM condo_ownership.unit_ownership_current
    WHERE org_id = ${orgId} AND building_id = ${buildingId} AND current_owner_entity IS NOT NULL
    LIMIT 1
  `.then(r => r[0]?.current_owner_entity).catch(() => null);

  if (!currentOwner) {
    return { signalType: "assemblage_opportunity", score: null, confidence: "insufficient_data", components: [], reason: "No resolved owner entity for this building" };
  }

  // Find adjacent buildings (same block, lot within ±5) owned by the same entity
  const adjacentOwned = await prisma.$queryRaw<Array<{ id: string; lot: number }>>`
    SELECT b.id, b.lot FROM condo_ownership.buildings b
    JOIN condo_ownership.unit_ownership_current uoc ON uoc.building_id = b.id AND uoc.org_id = ${orgId}
    WHERE b.org_id = ${orgId}
      AND b.borough = ${building.borough}
      AND b.block = ${building.block}
      AND b.lot BETWEEN ${building.lot - 5} AND ${building.lot + 5}
      AND b.id != ${buildingId}
      AND uoc.current_owner_entity = ${currentOwner}
  `;

  if (adjacentOwned.length > 0) {
    const pts = Math.min(50 + (adjacentOwned.length - 1) * 10, 80);
    components.push({ name: "adjacent_same_owner", points: pts, maxPoints: 80, detail: `${adjacentOwned.length} adjacent lot(s) same owner` });
  }

  // (b) Zoning permits assemblage (R7+ density)
  // Check via PLUTO data in building_cache
  const plutoCache = await prisma.buildingCache.findFirst({
    where: { bbl: building.bbl, source: "pluto" },
    select: { data: true },
  });
  const plutoData = plutoCache?.data as any;
  const zoning = plutoData?.zonedist1 || plutoData?.zoneDist || "";
  const zoningUpper = String(zoning).toUpperCase();

  if (zoningUpper) {
    // R7 and above, C4+, M1+ generally allow assemblage
    const highDensity = /^R[7-9]|^R10|^C[4-8]|^M[1-3]/.test(zoningUpper);
    if (highDensity) {
      components.push({ name: "high_density_zoning", points: 15, maxPoints: 15, detail: `Zoning: ${zoning}` });
    }
  } else {
    // Insufficient data — note but don't score
    components.push({ name: "zoning_data_missing", points: 0, maxPoints: 15, detail: "PLUTO zoning data unavailable" });
  }

  // (c) Not landmarked
  const isLandmarked = plutoData?.landmark != null && plutoData?.landmark !== "";
  if (!isLandmarked) {
    if (plutoData) {
      components.push({ name: "not_landmarked", points: 15, maxPoints: 15, detail: "Not a designated landmark" });
    }
    // If no PLUTO data, skip this component (don't assume not-landmarked)
  }

  if (adjacentOwned.length === 0) {
    return { signalType: "assemblage_opportunity", score: 0, confidence: "low", components: [{ name: "no_adjacent_same_owner", points: 0, maxPoints: 80, detail: "No adjacent lots found with same owner" }] };
  }

  const score = capScore(components);
  return { signalType: "assemblage_opportunity", score, confidence: confidenceFromScore(score), components };
}

// ── Signal 3: Exemption Cliff ────────────────────────────────

export async function computeExemptionCliff(
  orgId: string,
  buildingId: string,
): Promise<SignalResult> {
  const now = new Date();
  const in12mo = new Date(now.getTime() + 365 * 86_400_000);
  const in24mo = new Date(now.getTime() + 730 * 86_400_000);
  const components: SignalComponent[] = [];

  // Get building's BBL for exemption lookup
  const building = await prisma.coBuilding.findUnique({
    where: { id: buildingId },
    select: { bbl: true },
  });
  if (!building) {
    return { signalType: "exemption_cliff", score: null, confidence: "insufficient_data", components: [], reason: "Building not found" };
  }

  // Query expiring exemptions
  const exemptions = await prisma.coPropertyExemption.findMany({
    where: {
      orgId,
      OR: [{ buildingId }, { bbl: building.bbl }],
      expirationDate: { not: null, lte: in24mo },
    },
    select: { exemptionType: true, expirationDate: true, primaryResidence: true, ownerName: true },
  });

  if (exemptions.length === 0) {
    return { signalType: "exemption_cliff", score: 0, confidence: "low", components: [{ name: "no_expiring_exemptions", points: 0, maxPoints: 60, detail: "No exemptions expiring within 24 months" }] };
  }

  for (const ex of exemptions) {
    if (!ex.expirationDate) continue;
    const withinYear = ex.expirationDate <= in12mo;
    const type = ex.exemptionType || "UNKNOWN";

    switch (type) {
      case "421a":
        components.push({
          name: "421a_expiration",
          points: withinYear ? 60 : 30,
          maxPoints: 60,
          detail: `421a expires ${ex.expirationDate.toISOString().split("T")[0]} (${withinYear ? "<12mo" : "<24mo"})`,
        });
        break;
      case "J-51":
        if (withinYear) {
          components.push({ name: "j51_expiration", points: 30, maxPoints: 30, detail: `J-51 expires ${ex.expirationDate.toISOString().split("T")[0]}` });
        }
        break;
      case "ICAP":
        if (withinYear) {
          components.push({ name: "icap_expiration", points: 20, maxPoints: 20, detail: `ICAP expires ${ex.expirationDate.toISOString().split("T")[0]}` });
        }
        break;
      case "STAR":
      case "STAR_ENHANCED":
        // STAR + mailing address differs = potential ineligibility
        if (ex.primaryResidence) {
          const mailDiff = await prisma.$queryRaw<Array<{ mailing_differs_from_unit: boolean | null }>>`
            SELECT mailing_differs_from_unit FROM condo_ownership.unit_ownership_current
            WHERE org_id = ${orgId} AND building_id = ${buildingId}
            LIMIT 1
          `.then(r => r[0]?.mailing_differs_from_unit).catch(() => null);

          if (mailDiff === true) {
            components.push({ name: "star_mailing_mismatch", points: 10, maxPoints: 10, detail: "STAR enrolled but mailing differs from unit address" });
          }
        }
        break;
    }
  }

  const score = capScore(components);
  return { signalType: "exemption_cliff", score, confidence: confidenceFromScore(score), components };
}

// ── Signal 4: Sponsor Overhang ───────────────────────────────

export async function computeSponsorOverhang(
  orgId: string,
  buildingId: string,
): Promise<SignalResult> {
  const building = await prisma.coBuilding.findUnique({
    where: { id: buildingId },
    select: { bbl: true, yearBuilt: true, totalUnits: true },
  });
  if (!building || !building.yearBuilt || !building.totalUnits || building.totalUnits < 2) {
    return { signalType: "sponsor_overhang", score: null, confidence: "insufficient_data", components: [], reason: "Missing yearBuilt or totalUnits data" };
  }

  const yearsSinceConstruction = Math.min(new Date().getFullYear() - building.yearBuilt, 10);
  if (yearsSinceConstruction < 1) {
    return { signalType: "sponsor_overhang", score: 0, confidence: "low", components: [{ name: "new_construction", points: 0, maxPoints: 50, detail: "Building < 1 year old" }] };
  }

  // Heuristic: identify sponsor entity as the entity that owned the most units
  // in the building's earliest deed-batch year
  const sponsorEntity = await prisma.$queryRaw<Array<{ entity_id: string; cnt: bigint; name: string }>>`
    SELECT uoc.current_owner_entity as entity_id, COUNT(*)::bigint as cnt, MAX(uoc.current_owner_name) as name
    FROM condo_ownership.unit_ownership_current uoc
    WHERE uoc.org_id = ${orgId} AND uoc.building_id = ${buildingId}
      AND uoc.current_owner_entity IS NOT NULL
    GROUP BY uoc.current_owner_entity
    ORDER BY cnt DESC
    LIMIT 1
  `.then(r => r[0]).catch(() => null);

  if (!sponsorEntity || !sponsorEntity.entity_id) {
    return { signalType: "sponsor_overhang", score: null, confidence: "insufficient_data", components: [], reason: "No ownership data to identify sponsor" };
  }

  const sponsorUnitCount = Number(sponsorEntity.cnt);
  const totalUnits = building.totalUnits;

  // Only flag if the top owner holds > 20% of units AND building is > 5 years old
  if (sponsorUnitCount <= Math.max(1, totalUnits * 0.2) || yearsSinceConstruction < 5) {
    return {
      signalType: "sponsor_overhang",
      score: 0,
      confidence: "low",
      components: [{ name: "no_overhang", points: 0, maxPoints: 50, detail: `Top owner holds ${sponsorUnitCount}/${totalUnits} units (${Math.round(sponsorUnitCount / totalUnits * 100)}%), building ${yearsSinceConstruction}yr old` }],
    };
  }

  // Score = (sponsor_unit_count × years_since_construction) / total_units × 50, capped at 100
  const rawScore = Math.round((sponsorUnitCount * yearsSinceConstruction) / totalUnits * 50);
  const score = Math.min(100, rawScore);

  const components: SignalComponent[] = [{
    name: "sponsor_units_remaining",
    points: score,
    maxPoints: 100,
    detail: `${sponsorUnitCount} of ${totalUnits} units held by "${sponsorEntity.name || "unknown"}" (${yearsSinceConstruction} years post-construction)`,
  }];

  return { signalType: "sponsor_overhang", score, confidence: confidenceFromScore(score), components };
}

// ── Orchestrator ─────────────────────────────────────────────

/**
 * Compute all 4 signal types for a building and persist to Co_building_signals.
 */
export async function computeAllSignals(
  orgId: string,
  buildingId: string,
): Promise<SignalResult[]> {
  const results = await Promise.all([
    computeForcedSaleProbability(orgId, buildingId),
    computeAssemblageOpportunity(orgId, buildingId),
    computeExemptionCliff(orgId, buildingId),
    computeSponsorOverhang(orgId, buildingId),
  ]);

  // Persist each signal
  for (const result of results) {
    await prisma.$executeRaw`
      INSERT INTO condo_ownership.building_signals (id, org_id, building_id, signal_type, score, confidence, evidence, computed_at)
      VALUES (
        gen_random_uuid(), ${orgId}, ${buildingId}, ${result.signalType},
        ${result.score}::numeric,
        ${result.confidence},
        ${JSON.stringify({ components: result.components, reason: result.reason || null })}::jsonb,
        NOW()
      )
      ON CONFLICT (org_id, building_id, signal_type, computed_at) DO UPDATE SET
        score = EXCLUDED.score,
        confidence = EXCLUDED.confidence,
        evidence = EXCLUDED.evidence
    `;
  }

  return results;
}

/**
 * Batch recompute signals for a set of buildings (or all recent).
 */
export async function recomputeBuildingSignals(
  orgId: string,
  buildingIds?: string[],
  windowHours = 36,
): Promise<{ computed: number; errors: number; durationMs: number }> {
  const start = Date.now();
  let computed = 0;
  let errors = 0;

  const ids = buildingIds || await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT b.id FROM condo_ownership.buildings b
    WHERE b.org_id = ${orgId} AND b.updated_at >= NOW() - INTERVAL '${windowHours} hours'
    LIMIT 500
  `.then(r => r.map(b => b.id));

  for (const bid of ids) {
    try {
      await computeAllSignals(orgId, bid);
      computed++;
    } catch {
      errors++;
    }
  }

  // Log to sync_metrics
  await prisma.coSyncMetrics.create({
    data: {
      datasetId: "building_signals",
      runStartedAt: new Date(start),
      runCompletedAt: new Date(),
      rowsUpserted: computed * 4, // 4 signals per building
      rowsFailed: errors,
    },
  }).catch(() => {});

  console.log(`[BuildingSignals] Computed ${computed} buildings (${computed * 4} signals), ${errors} errors (${Date.now() - start}ms)`);
  return { computed, errors, durationMs: Date.now() - start };
}
