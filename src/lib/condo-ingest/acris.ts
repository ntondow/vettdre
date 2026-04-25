/**
 * ACRIS Incremental Sync — daily mirror of Master + Legals + Parties.
 *
 * Queries ACRIS Master by modified_date, joins Legals + Parties,
 * upserts into condo_ownership.acris_* tables.
 *
 * Schedule: daily 04:00 ET
 */

import prisma from "@/lib/prisma";
import { ACRIS_LEGALS_ID, ACRIS_PARTIES_ID } from "@/lib/terminal-datasets";
import { initDocTypeWhitelists, isDeedType, isMortgageType } from "./deed-types";

const ACRIS_MASTER_ID = "bnx9-e6tj";
const NYC_BASE = "https://data.cityofnewyork.us/resource";
const FETCH_TIMEOUT = 10000;
const PAGE_SIZE = 500;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;
const SAFETY_OVERLAP_DAYS = 2;
const MAX_RECORDS_PER_RUN = 5000; // cap to stay within 300s Cloud Run timeout

export interface AcrisSyncResult {
  masterRecords: number;
  legalsRecords: number;
  partiesRecords: number;
  bblsTouched: Set<string>;
  errors: number;
  durationMs: number;
}

// ── SODA Helper ──────────────────────────────────────────────

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

function padBbl(boro: number, block: number, lot: number): string | null {
  if (!boro || boro < 1 || boro > 5 || !block || !lot) return null;
  return `${boro}${String(block).padStart(5, "0")}${String(lot).padStart(4, "0")}`;
}

// ── Main Sync Function ───────────────────────────────────────

/**
 * Incremental ACRIS sync. Fetches Master records modified since last run,
 * joins Legals + Parties, upserts into mirror tables.
 *
 * Returns the set of BBLs touched (for downstream ownership recomputation).
 */
export async function runAcrisSync(orgId: string): Promise<AcrisSyncResult> {
  const start = Date.now();
  let masterCount = 0;
  let legalsCount = 0;
  let partiesCount = 0;
  let errors = 0;
  const bblsTouched = new Set<string>();

  // Initialize deed-type whitelists
  await initDocTypeWhitelists();

  // Determine sync window: last run - safety overlap
  const state = await prisma.ingestionState.findUnique({
    where: { datasetId: "acris_mirror" },
  });
  const lastRun = state?.lastRecordTimestamp
    ? new Date(state.lastRecordTimestamp.getTime() - SAFETY_OVERLAP_DAYS * 86_400_000)
    : new Date(Date.now() - 7 * 86_400_000); // default: 7 days back on first run

  const sinceStr = lastRun.toISOString().split("T")[0]; // YYYY-MM-DD
  let latestModified: Date | null = null;
  let offset = 0;

  console.log(`[AcrisSync] Syncing records modified since ${sinceStr}`);

  // Paginate through Master records
  while (true) {
    let masterRecords: any[];
    try {
      masterRecords = await querySoda(ACRIS_MASTER_ID, {
        $where: `modified_date > '${sinceStr}'`,
        $order: "modified_date ASC",
        $limit: String(PAGE_SIZE),
        $offset: String(offset),
      });
    } catch (err) {
      console.error(`[AcrisSync] Master fetch error offset=${offset}:`, err);
      errors++;
      break;
    }

    if (masterRecords.length === 0) break;

    // Process in batches
    for (let i = 0; i < masterRecords.length; i += BATCH_SIZE) {
      const batch = masterRecords.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((master) => processMasterRecord(orgId, master, bblsTouched)),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          masterCount++;
          legalsCount += r.value.legals;
          partiesCount += r.value.parties;
        } else {
          errors++;
        }
      }

      if (i + BATCH_SIZE < masterRecords.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    // Track latest modified date
    const lastRecord = masterRecords[masterRecords.length - 1];
    if (lastRecord?.modified_date) {
      const d = new Date(lastRecord.modified_date);
      if (!latestModified || d > latestModified) latestModified = d;
    }

    offset += masterRecords.length;
    if (masterRecords.length < PAGE_SIZE) break;
    if (offset >= MAX_RECORDS_PER_RUN) {
      console.log(`[AcrisSync] Hit per-run cap (${MAX_RECORDS_PER_RUN}), resuming next run`);
      break;
    }
  }

  // Update ingestion state
  await prisma.ingestionState.upsert({
    where: { datasetId: "acris_mirror" },
    create: {
      datasetId: "acris_mirror",
      lastCheckedAt: new Date(),
      lastRecordTimestamp: latestModified,
      recordCount: masterCount,
      status: "idle",
    },
    update: {
      lastCheckedAt: new Date(),
      lastRecordTimestamp: latestModified || undefined,
      recordCount: { increment: masterCount },
      status: "idle",
      lastError: null,
    },
  });

  // Log sync metrics
  await prisma.coSyncMetrics.create({
    data: {
      datasetId: "acris_mirror",
      runStartedAt: new Date(start),
      runCompletedAt: new Date(),
      rowsFetched: masterCount,
      rowsUpserted: masterCount,
      rowsFailed: errors,
    },
  });

  console.log(
    `[AcrisSync] Complete: ${masterCount} master, ${legalsCount} legals, ${partiesCount} parties, ` +
    `${bblsTouched.size} BBLs, ${errors} errors (${Date.now() - start}ms)`,
  );

  return { masterRecords: masterCount, legalsRecords: legalsCount, partiesRecords: partiesCount, bblsTouched, errors, durationMs: Date.now() - start };
}

// ── Per-Record Processing ────────────────────────────────────

async function processMasterRecord(
  orgId: string,
  master: any,
  bblsTouched: Set<string>,
): Promise<{ legals: number; parties: number }> {
  const documentId = master.document_id;
  if (!documentId) return { legals: 0, parties: 0 };

  const docType = (master.doc_type || "").trim().toUpperCase();

  // Only mirror deed + mortgage types (skip noise like UCC filings, power of attorney, etc.)
  if (!isDeedType(docType) && !isMortgageType(docType)) {
    return { legals: 0, parties: 0 };
  }

  // Upsert Master
  await prisma.$executeRaw`
    INSERT INTO condo_ownership.acris_master (document_id, record_type, crfn, recorded_borough, doc_type, document_date, document_amount, recorded_datetime, modified_date, good_through_date, raw)
    VALUES (
      ${documentId},
      ${master.record_type || null},
      ${master.crfn || null},
      ${master.recorded_borough ? parseInt(master.recorded_borough) : null}::smallint,
      ${docType},
      ${master.document_date ? master.document_date.split("T")[0] : null}::date,
      ${master.document_amount ? parseFloat(master.document_amount) : null}::numeric,
      ${master.recorded_datetime || null}::timestamptz,
      ${master.modified_date || null}::timestamptz,
      ${master.good_through_date ? master.good_through_date.split("T")[0] : null}::date,
      ${JSON.stringify(master)}::jsonb
    )
    ON CONFLICT (document_id) DO UPDATE SET
      doc_type = EXCLUDED.doc_type,
      document_amount = EXCLUDED.document_amount,
      modified_date = EXCLUDED.modified_date,
      good_through_date = EXCLUDED.good_through_date,
      raw = EXCLUDED.raw
  `;

  // Fetch + upsert Legals
  let legalsCount = 0;
  try {
    const legals = await querySoda(ACRIS_LEGALS_ID, {
      $where: `document_id='${documentId}'`,
      $limit: "50",
    });
    for (const leg of legals) {
      const borough = leg.borough ? parseInt(leg.borough) : null;
      const block = leg.block ? parseInt(leg.block) : null;
      const lot = leg.lot ? parseInt(leg.lot) : null;

      if (borough && block && lot) {
        const bbl = padBbl(borough, block, lot);
        if (bbl) bblsTouched.add(bbl);
      }

      await prisma.$executeRaw`
        INSERT INTO condo_ownership.acris_legals (id, document_id, record_type, borough, block, lot, easement, partial_lot, air_rights, subterranean_rights, property_type, street_number, street_name, unit)
        VALUES (
          gen_random_uuid(),
          ${documentId},
          ${leg.record_type || null},
          ${borough}::smallint,
          ${block},
          ${lot},
          ${leg.easement || null},
          ${leg.partial_lot || null},
          ${leg.air_rights || null},
          ${leg.subterranean_rights || null},
          ${leg.property_type || null},
          ${leg.street_number || null},
          ${leg.street_name || null},
          ${leg.unit || null}
        )
        ON CONFLICT (document_id, borough, block, lot, COALESCE(unit, '')) DO NOTHING
      `;
      legalsCount++;
    }
  } catch (err) {
    console.error(`[AcrisSync] Legals fetch error doc=${documentId}:`, err);
  }

  // Fetch + upsert Parties
  let partiesCount = 0;
  try {
    const parties = await querySoda(ACRIS_PARTIES_ID, {
      $where: `document_id='${documentId}'`,
      $order: "party_type ASC",
      $limit: "50",
    });
    for (let seq = 0; seq < parties.length; seq++) {
      const p = parties[seq];
      const partyType = p.party_type ? parseInt(p.party_type) : null;

      await prisma.$executeRaw`
        INSERT INTO condo_ownership.acris_parties (id, document_id, party_sequence, party_type, name, address_1, address_2, country, city, state, zip)
        VALUES (
          gen_random_uuid(),
          ${documentId},
          ${seq + 1},
          ${partyType}::smallint,
          ${p.name || null},
          ${p.address_1 || null},
          ${p.address_2 || null},
          ${p.country || null},
          ${p.city || null},
          ${p.state || null},
          ${p.zip || null}
        )
        ON CONFLICT (document_id, party_type, party_sequence) DO UPDATE SET
          name = EXCLUDED.name,
          address_1 = EXCLUDED.address_1,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip = EXCLUDED.zip
      `;
      partiesCount++;
    }
  } catch (err) {
    console.error(`[AcrisSync] Parties fetch error doc=${documentId}:`, err);
  }

  return { legals: legalsCount, parties: partiesCount };
}
