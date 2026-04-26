/**
 * Condo Unit Spine Ingest — populates condo_ownership.buildings + units from eguu-7ie3.
 *
 * Queries the Digital Tax Map Condominium Units dataset, groups by billing BBL,
 * resolves addresses via GeoSearch, and upserts buildings + units.
 *
 * Cross-references DOF Property Valuation (8y4t-faws) for building metadata.
 *
 * Schedule: weekly (Sunday 03:00 ET)
 */

import prisma from "@/lib/prisma";
import { geoSearch, buildSearchAddress } from "./geosearch";

const CONDO_UNITS_DATASET = "eguu-7ie3";
const DOF_DATASET = "8y4t-faws";
const NYC_BASE = "https://data.cityofnewyork.us/resource";
const FETCH_TIMEOUT = 10000;
const PAGE_SIZE = 2000;
const UPSERT_BATCH = 10;
const BATCH_DELAY_MS = 100;
const GEOSEARCH_DELAY_MS = 50; // rate limit GeoSearch

// Safety cap to prevent Cloud Run 300s timeout in cron runs.
// Bulk spine ingest must be run via CLI with { fullRun: true } to bypass.
// At ~250ms per building (GeoSearch dominates), 200 buildings ≈ 50s of work.
const MAX_BUILDINGS_PER_RUN = 200;

const BORO_NAMES: Record<number, string> = {
  1: "Manhattan", 2: "Bronx", 3: "Brooklyn", 4: "Queens", 5: "Staten Island",
};

export interface UnitRefreshResult {
  borough: number;
  buildingsUpserted: number;
  unitsUpserted: number;
  errors: number;
  durationMs: number;
}

export interface UnitRefreshSummary {
  boroughs: UnitRefreshResult[];
  totalBuildings: number;
  totalUnits: number;
  totalErrors: number;
  durationMs: number;
}

// ── SODA Query Helper ────────────────────────────────────────

async function querySoda(datasetId: string, params: Record<string, string>): Promise<any[]> {
  const appToken = process.env.NYC_OPEN_DATA_APP_TOKEN || "";
  const isValid = appToken.length > 0 && !appToken.startsWith("YOUR_");

  const query = new URLSearchParams(params).toString();
  const url = `${NYC_BASE}/${datasetId}.json?${query}`;

  const headers: Record<string, string> = { "Accept": "application/json" };
  if (isValid) headers["X-App-Token"] = appToken;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  const res = await fetch(url, { headers, signal: controller.signal });
  clearTimeout(timer);

  if (!res.ok) throw new Error(`SODA ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ── BBL Helpers ──────────────────────────────────────────────

function padBbl(boro: number, block: number, lot: number): string {
  return `${boro}${String(block).padStart(5, "0")}${String(lot).padStart(4, "0")}`;
}

/**
 * Derive the condo billing BBL from a unit record.
 * Condo billing lots are typically 7501+ (the "base lot").
 * The dataset provides condo_base_boro + condo_base_block.
 * The base lot is the lowest lot in the unit_lot range — we use the lot from the first unit.
 */
function deriveBillingBbl(
  condoBaseBoro: number,
  condoBaseBlock: number,
  unitLots: number[],
): string {
  // Billing BBL: use the smallest lot number in the condo complex
  const baseLot = Math.min(...unitLots);
  return padBbl(condoBaseBoro, condoBaseBlock, baseLot);
}

// ── DOF Cross-Reference ──────────────────────────────────────

interface DofData {
  buildingClass?: string;
  totalUnits?: number;
  grossSqft?: number;
  yearBuilt?: number;
}

async function fetchDofData(bbl: string): Promise<DofData | null> {
  const boro = parseInt(bbl[0]);
  const block = parseInt(bbl.slice(1, 6));
  const lot = parseInt(bbl.slice(6, 10));

  try {
    const records = await querySoda(DOF_DATASET, {
      $where: `boro='${boro}' AND block='${String(block).padStart(5, "0")}' AND lot='${String(lot).padStart(4, "0")}'`,
      $limit: "1",
    });
    if (records.length === 0) return null;
    const r = records[0];
    return {
      buildingClass: r.bldg_class || r.building_class || undefined,
      totalUnits: r.units ? parseInt(r.units) : undefined,
      grossSqft: r.gross_sqft ? parseInt(r.gross_sqft) : undefined,
      yearBuilt: r.year_built ? parseInt(r.year_built) : undefined,
    };
  } catch {
    return null;
  }
}

// ── Main Ingest Function ─────────────────────────────────────

/**
 * Refresh condo buildings + units for a specific borough (or all).
 * Queries eguu-7ie3 in pages, groups by condo base, upserts.
 */
export async function refreshCondoUnits(
  orgId: string,
  boroughs: number[] = [1, 2, 3, 4, 5],
  options: { fullRun?: boolean } = {},
): Promise<UnitRefreshSummary> {
  const start = Date.now();
  const results: UnitRefreshResult[] = [];
  const fullRun = options.fullRun === true;

  // Track total buildings processed across all boroughs in this run.
  // Cron runs are capped at MAX_BUILDINGS_PER_RUN to stay under 300s timeout.
  // CLI bulk-ingest passes fullRun=true to bypass.
  let totalBuildingsProcessed = 0;

  for (const boro of boroughs) {
    const remainingBudget = fullRun
      ? Number.POSITIVE_INFINITY
      : Math.max(0, MAX_BUILDINGS_PER_RUN - totalBuildingsProcessed);
    if (remainingBudget === 0) {
      console.log(`[CondoUnits] Building budget exhausted, skipping boro ${boro}`);
      results.push({ borough: boro, buildingsUpserted: 0, unitsUpserted: 0, errors: 0, durationMs: 0 });
      continue;
    }
    const boroResult = await refreshBorough(orgId, boro, remainingBudget);
    results.push(boroResult);
    totalBuildingsProcessed += boroResult.buildingsUpserted;
    console.log(
      `[CondoUnits] ${BORO_NAMES[boro]}: ` +
      `${boroResult.buildingsUpserted} buildings, ${boroResult.unitsUpserted} units, ` +
      `${boroResult.errors} errors (${boroResult.durationMs}ms)`
    );
  }

  return {
    boroughs: results,
    totalBuildings: results.reduce((s, r) => s + r.buildingsUpserted, 0),
    totalUnits: results.reduce((s, r) => s + r.unitsUpserted, 0),
    totalErrors: results.reduce((s, r) => s + r.errors, 0),
    durationMs: Date.now() - start,
  };
}

async function refreshBorough(orgId: string, boro: number, buildingBudget: number = Number.POSITIVE_INFINITY): Promise<UnitRefreshResult> {
  const start = Date.now();
  let buildingsUpserted = 0;
  let unitsUpserted = 0;
  let errors = 0;
  let offset = 0;

  // Group records by condo_base_boro + condo_base_block (the building grouping key)
  const buildingMap = new Map<string, Array<any>>();

  // Paginate through condo units in this borough.
  // Stop fetching when buildingMap has enough distinct buildings to satisfy
  // the budget — no point pulling 80K records to upsert only 200 buildings.
  // Use buildingBudget * 2 as a safety margin so we don't undershoot due to
  // records being clustered in the same building.
  const fetchTarget = Number.isFinite(buildingBudget)
    ? buildingBudget * 2
    : Number.POSITIVE_INFINITY;
  while (true) {
    if (buildingMap.size >= fetchTarget) {
      console.log(
        `[CondoUnits] Boro ${boro}: fetched ${buildingMap.size} buildings (target ${fetchTarget}), stopping fetch loop`,
      );
      break;
    }
    try {
      const records = await querySoda(CONDO_UNITS_DATASET, {
        $where: `condo_base_boro='${boro}'`,
        $order: "condo_base_block ASC, unit_lot ASC",
        $limit: String(PAGE_SIZE),
        $offset: String(offset),
      });

      if (records.length === 0) break;

      for (const r of records) {
        const baseBlock = parseInt(r.condo_base_block || r.block || "0");
        const baseLot = parseInt(r.condo_base_lot || "0");
        // Skip malformed records — every condo unit should have base block + base lot
        if (!baseBlock || !baseLot) continue;
        // Key by boro + baseBlock + baseLot so multiple buildings on the same
        // block don't collide into a single map entry.
        const key = `${boro}-${baseBlock}-${baseLot}`;
        if (!buildingMap.has(key)) buildingMap.set(key, []);
        buildingMap.get(key)!.push(r);
      }

      offset += records.length;
      if (records.length < PAGE_SIZE) break;
    } catch (err) {
      console.error(`[CondoUnits] Fetch error boro=${boro} offset=${offset}:`, err);
      errors++;
      break;
    }
  }

  // Process each building group, respecting buildingBudget for cron timeout safety
  const buildingKeys = [...buildingMap.keys()];
  const cappedKeys = buildingBudget === Number.POSITIVE_INFINITY
    ? buildingKeys
    : buildingKeys.slice(0, buildingBudget);

  if (cappedKeys.length < buildingKeys.length) {
    console.log(
      `[CondoUnits] Boro ${boro}: capping at ${cappedKeys.length} of ${buildingKeys.length} buildings ` +
      `(MAX_BUILDINGS_PER_RUN budget). Run with fullRun=true via CLI for bulk ingest.`
    );
  }

  for (let i = 0; i < cappedKeys.length; i += UPSERT_BATCH) {
    const batch = cappedKeys.slice(i, i + UPSERT_BATCH);

    await Promise.allSettled(
      batch.map(async (key) => {
        try {
          const unitRecords = buildingMap.get(key)!;
          const result = await upsertBuildingAndUnits(orgId, boro, unitRecords);
          buildingsUpserted += result.building ? 1 : 0;
          unitsUpserted += result.units;
        } catch (err) {
          console.error(`[CondoUnits] Upsert error key=${key}:`, err);
          errors++;
        }
      }),
    );

    if (i + UPSERT_BATCH < cappedKeys.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return { borough: boro, buildingsUpserted, unitsUpserted, errors, durationMs: Date.now() - start };
}

async function upsertBuildingAndUnits(
  orgId: string,
  boro: number,
  unitRecords: any[],
): Promise<{ building: boolean; units: number }> {
  if (unitRecords.length === 0) return { building: false, units: 0 };

  const first = unitRecords[0];
  const condoBaseBlock = parseInt(first.condo_base_block || first.block || "0");

  // Collect all lot numbers to derive billing BBL
  const lots = unitRecords.map((r) => parseInt(r.unit_lot || r.lot || "0")).filter((l) => l > 0);
  if (lots.length === 0) return { building: false, units: 0 };

  const billingBbl = deriveBillingBbl(boro, condoBaseBlock, lots);

  // Try to resolve address via GeoSearch
  const streetNum = first.house_number || first.street_number || "";
  const streetName = first.street_name || "";
  let address = buildSearchAddress(streetNum, streetName, BORO_NAMES[boro]);
  let normalizedAddress = address;

  const geo = await geoSearch(address);
  if (geo) {
    normalizedAddress = geo.normalizedAddress;
    address = geo.normalizedAddress;
  }
  // Small delay to rate-limit GeoSearch
  await new Promise((r) => setTimeout(r, GEOSEARCH_DELAY_MS));

  // Fetch DOF data for building metadata
  const dof = await fetchDofData(billingBbl);

  // Upsert building
  const building = await prisma.coBuilding.upsert({
    where: { orgId_bbl: { orgId, bbl: billingBbl } },
    create: {
      orgId,
      bbl: billingBbl,
      borough: boro,
      block: condoBaseBlock,
      lot: Math.min(...lots),
      address,
      normalizedAddress,
      propertyType: "condo",
      buildingClass: dof?.buildingClass || null,
      totalUnits: unitRecords.length,
      residentialUnits: unitRecords.length, // condos are primarily residential
      grossSqft: dof?.grossSqft || null,
      yearBuilt: dof?.yearBuilt || null,
      lastSyncedAt: new Date(),
    },
    update: {
      address,
      normalizedAddress,
      totalUnits: unitRecords.length,
      residentialUnits: unitRecords.length,
      buildingClass: dof?.buildingClass || undefined,
      grossSqft: dof?.grossSqft || undefined,
      yearBuilt: dof?.yearBuilt || undefined,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // Upsert individual units via raw SQL.
  // Prisma's typed coUnit.upsert can't be used because the unit_bbl unique is a
  // PARTIAL index (WHERE unit_bbl IS NOT NULL) which Prisma's @@unique can't
  // express. Cast building_id to uuid since Prisma binds string parameters as
  // text by default.
  let unitCount = 0;
  for (const r of unitRecords) {
    const unitLot = parseInt(r.unit_lot || r.lot || "0");
    if (!unitLot) continue;

    const unitBbl = padBbl(boro, condoBaseBlock, unitLot);
    const unitNumber = r.unit_designation || r.apt_no || null;

    try {
      await prisma.$executeRaw`
        INSERT INTO condo_ownership.units (id, org_id, building_id, subject_type, unit_bbl, unit_number, last_refreshed, created_at)
        VALUES (gen_random_uuid(), ${orgId}, ${building.id}::uuid, 'condo_bbl', ${unitBbl}, ${unitNumber}, NOW(), NOW())
        ON CONFLICT (org_id, unit_bbl) WHERE unit_bbl IS NOT NULL
        DO UPDATE SET unit_number = COALESCE(EXCLUDED.unit_number, condo_ownership.units.unit_number), last_refreshed = NOW()
      `;
      unitCount++;
    } catch (err) {
      console.error(`[CondoUnits] Unit upsert failed bbl=${unitBbl}:`, err);
    }
  }

  return { building: true, units: unitCount };
}
