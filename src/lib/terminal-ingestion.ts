/**
 * Terminal Data Ingestion Engine
 *
 * Two-phase polling of NYC Open Data:
 *   Phase 1: Metadata check (has dataset been updated?)
 *   Phase 2: Incremental fetch (get new records since last poll)
 *
 * Writes raw TerminalEvent records — enrichment and AI happen later.
 */

import prisma from "@/lib/prisma";
import type { DatasetConfig } from "./terminal-datasets";
import {
  STANDARD_DATASETS,
  ACRIS_DATASET,
  ACRIS_LEGALS_ID,
  ACRIS_PARTIES_ID,
  ALL_DATASETS,
} from "./terminal-datasets";

const NYC = "https://data.cityofnewyork.us";
const APP_TOKEN = process.env.NYC_OPEN_DATA_APP_TOKEN || "";
// Detect placeholder/invalid tokens — sending a bad X-App-Token causes 403
const isValidToken = APP_TOKEN.length > 0 && !APP_TOKEN.startsWith("YOUR_");
const FETCH_TIMEOUT = 8000;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;
const MAX_RECORDS_PER_POLL = 1000;

// ── Types ─────────────────────────────────────────────────────

export interface IngestionResult {
  dataset: string;
  displayName: string;
  status: "skipped" | "polled" | "error";
  recordsFetched: number;
  eventsCreated: number;
  eventsSkipped: number;
  durationMs: number;
  error?: string;
}

export interface IngestionSummary {
  datasetsChecked: number;
  datasetsPolled: number;
  datasetsSkipped: number;
  datasetsErrored: number;
  totalEventsCreated: number;
  totalDurationMs: number;
  results: IngestionResult[];
}

// ── Fetch Helpers ─────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {};
    if (isValidToken) headers["X-App-Token"] = APP_TOKEN;
    return await fetch(url, { signal: controller.signal, headers });
  } finally {
    clearTimeout(timeout);
  }
}

async function querySoda(datasetId: string, params: Record<string, string>): Promise<any[]> {
  const url = new URL(`${NYC}/resource/${datasetId}.json`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) throw new Error(`SODA ${datasetId} returned ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ── Phase 1: Metadata Check ──────────────────────────────────

/**
 * Check if a dataset has been updated since our last poll.
 * Returns the rowsUpdatedAt epoch if changed, null if unchanged.
 */
async function checkDatasetMetadata(
  datasetId: string,
  lastRowsUpdatedAt: bigint | null,
): Promise<bigint | null> {
  const url = `${NYC}/api/views/${datasetId}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Metadata check for ${datasetId} returned ${res.status}`);
  const meta = await res.json();
  // Socrata returns rowsUpdatedAt as a Unix epoch (seconds or milliseconds)
  const rawValue = meta.rowsUpdatedAt;
  if (!rawValue) return BigInt(0);
  const numValue = typeof rawValue === "string" ? parseInt(rawValue, 10) : Number(rawValue);
  const remoteUpdatedAt = BigInt(isNaN(numValue) ? 0 : numValue);

  if (lastRowsUpdatedAt !== null && remoteUpdatedAt <= lastRowsUpdatedAt) {
    return null; // No changes
  }
  return remoteUpdatedAt;
}

// ── Phase 2: Incremental Fetch (Standard) ─────────────────────

async function pollStandardDataset(
  config: DatasetConfig,
  orgId: string,
): Promise<IngestionResult> {
  const start = Date.now();
  const result: IngestionResult = {
    dataset: config.datasetId,
    displayName: config.displayName,
    status: "polled",
    recordsFetched: 0,
    eventsCreated: 0,
    eventsSkipped: 0,
    durationMs: 0,
  };

  try {
    // Read ingestion state
    const state = await prisma.ingestionState.findUnique({
      where: { datasetId: config.datasetId },
    });

    // Phase 1: Metadata check
    const newRowsUpdatedAt = await checkDatasetMetadata(
      config.datasetId,
      state?.lastRowsUpdatedAt ?? null,
    );
    if (newRowsUpdatedAt === null) {
      result.status = "skipped";
      result.durationMs = Date.now() - start;
      return result;
    }

    // Phase 2: Incremental fetch
    const params: Record<string, string> = {
      $order: config.timestampField
        ? `${config.timestampField} ASC`
        : ":updated_at ASC",
      $limit: String(MAX_RECORDS_PER_POLL),
    };

    // Add $where for incremental — only fetch records newer than last poll
    if (state?.lastRecordTimestamp && config.timestampField) {
      const ts = config.formatSinceDate
        ? config.formatSinceDate(state.lastRecordTimestamp)
        : state.lastRecordTimestamp.toISOString().slice(0, 19);
      params.$where = `${config.timestampField} > '${ts}'`;
    }

    const records = await querySoda(config.datasetId, params);
    result.recordsFetched = records.length;

    let latestTimestamp: Date | null = null;

    for (const record of records) {
      const bbl = config.bblExtractor(record);
      const eventType = config.eventTypeMapper(record);
      const sourceRecordId = config.recordIdExtractor(record);

      if (!eventType || !bbl) {
        result.eventsSkipped++;
        continue;
      }

      const borough = parseInt(bbl[0]);

      try {
        await prisma.terminalEvent.upsert({
          where: {
            sourceDataset_sourceRecordId: {
              sourceDataset: config.datasetId,
              sourceRecordId,
            },
          },
          create: {
            orgId,
            eventType,
            bbl,
            borough,
            sourceDataset: config.datasetId,
            sourceRecordId,
            tier: config.eventTier,
            metadata: record as any,
          },
          update: {}, // Dedup — don't overwrite existing
        });
        result.eventsCreated++;
      } catch (err: any) {
        // Unique constraint violation = dedup, skip silently
        if (err?.code === "P2002") {
          result.eventsSkipped++;
        } else {
          throw err;
        }
      }

      // Track latest timestamp for incremental state
      const tsField = config.timestampField || ":updated_at";
      const tsValue = record[tsField] || record[":updated_at"];
      if (tsValue) {
        const d = new Date(tsValue);
        if (!isNaN(d.getTime()) && (!latestTimestamp || d > latestTimestamp)) {
          latestTimestamp = d;
        }
      }
    }

    // Update ingestion state
    await prisma.ingestionState.upsert({
      where: { datasetId: config.datasetId },
      create: {
        datasetId: config.datasetId,
        lastCheckedAt: new Date(),
        lastRowsUpdatedAt: newRowsUpdatedAt,
        lastRecordTimestamp: latestTimestamp,
        recordCount: result.eventsCreated,
        status: "idle",
      },
      update: {
        lastCheckedAt: new Date(),
        lastRowsUpdatedAt: newRowsUpdatedAt,
        ...(latestTimestamp ? { lastRecordTimestamp: latestTimestamp } : {}),
        recordCount: { increment: result.eventsCreated },
        status: "idle",
        lastError: null,
      },
    });
  } catch (err) {
    result.status = "error";
    result.error = err instanceof Error ? err.message : String(err);
    console.error(`[Terminal Ingestion] ${config.displayName} error:`, err);

    // Record error in ingestion state
    await prisma.ingestionState.upsert({
      where: { datasetId: config.datasetId },
      create: {
        datasetId: config.datasetId,
        lastCheckedAt: new Date(),
        status: "error",
        lastError: result.error,
      },
      update: {
        lastCheckedAt: new Date(),
        status: "error",
        lastError: result.error,
      },
    }).catch(() => {}); // Don't throw on state update failure
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── ACRIS Special Handling ────────────────────────────────────

async function pollAcris(orgId: string): Promise<IngestionResult> {
  const start = Date.now();
  const config = ACRIS_DATASET;
  const result: IngestionResult = {
    dataset: config.datasetId,
    displayName: config.displayName,
    status: "polled",
    recordsFetched: 0,
    eventsCreated: 0,
    eventsSkipped: 0,
    durationMs: 0,
  };

  try {
    const state = await prisma.ingestionState.findUnique({
      where: { datasetId: config.datasetId },
    });

    // Phase 1: Metadata check
    const newRowsUpdatedAt = await checkDatasetMetadata(
      config.datasetId,
      state?.lastRowsUpdatedAt ?? null,
    );
    if (newRowsUpdatedAt === null) {
      result.status = "skipped";
      result.durationMs = Date.now() - start;
      return result;
    }

    // Phase 2: Fetch new ACRIS Master records
    // Limit to 100 for ACRIS — each record triggers 2 join queries (Legals + Parties)
    const ACRIS_BATCH_LIMIT = 100;
    const masterParams: Record<string, string> = {
      $where: `doc_type IN('DEED','DEEDO','MTGE','AGMT','AL&R','ASST','SAT')`,
      $order: "good_through_date ASC",
      $limit: String(ACRIS_BATCH_LIMIT),
    };

    if (state?.lastRecordTimestamp) {
      const ts = state.lastRecordTimestamp.toISOString().split("T")[0]; // date only
      masterParams.$where += ` AND good_through_date > '${ts}'`;
    }

    const masterRecords = await querySoda(config.datasetId, masterParams);
    result.recordsFetched = masterRecords.length;

    // Batch: for each master record, join with Legals + Parties
    let latestTimestamp: Date | null = null;

    for (const master of masterRecords) {
      const docId = master.document_id;
      if (!docId) { result.eventsSkipped++; continue; }

      const eventType = config.eventTypeMapper(master);
      if (!eventType) { result.eventsSkipped++; continue; }

      // Escape docId for SODA $where queries
      const safeDocId = String(docId).replace(/'/g, "''");

      // Join: Legals → BBL
      let bbl: string | null = null;
      try {
        const legals = await querySoda(ACRIS_LEGALS_ID, {
          $where: `document_id='${safeDocId}'`,
          $limit: "1",
        });
        if (legals[0]) {
          const l = legals[0];
          const boro = l.borough;
          const block = l.block;
          const lot = l.lot;
          if (boro && block && lot) {
            bbl = `${parseInt(boro)}${String(block).padStart(5, "0")}${String(lot).padStart(4, "0")}`;
          }
        }
      } catch (err) {
        console.debug(`[Terminal Ingestion] ACRIS Legals join failed for docId=${docId}:`, err);
      }

      if (!bbl) { result.eventsSkipped++; continue; }
      const borough = parseInt(bbl[0]);

      // Join: Parties → buyer/seller names
      let parties: any[] = [];
      try {
        parties = await querySoda(ACRIS_PARTIES_ID, {
          $where: `document_id='${safeDocId}'`,
          $limit: "10",
        });
      } catch (err) {
        console.debug(`[Terminal Ingestion] ACRIS Parties join failed for docId=${docId}:`, err);
      }

      const enrichedMetadata = {
        ...master,
        _bbl: bbl,
        _parties: parties.map((p: any) => ({
          name: p.name,
          type: p.party_type, // 1=buyer/grantee, 2=seller/grantor
          address1: p.address_1,
          city: p.city,
          state: p.state,
          zip: p.zip,
        })),
      };

      try {
        await prisma.terminalEvent.upsert({
          where: {
            sourceDataset_sourceRecordId: {
              sourceDataset: config.datasetId,
              sourceRecordId: docId,
            },
          },
          create: {
            orgId,
            eventType,
            bbl,
            borough,
            sourceDataset: config.datasetId,
            sourceRecordId: docId,
            tier: config.eventTier,
            metadata: enrichedMetadata as any,
          },
          update: {},
        });
        result.eventsCreated++;
      } catch (err: any) {
        if (err?.code === "P2002") {
          result.eventsSkipped++;
        } else {
          throw err;
        }
      }

      const gtd = master.good_through_date;
      if (gtd) {
        const d = new Date(gtd);
        if (!isNaN(d.getTime()) && (!latestTimestamp || d > latestTimestamp)) {
          latestTimestamp = d;
        }
      }
    }

    // Update ingestion state
    await prisma.ingestionState.upsert({
      where: { datasetId: config.datasetId },
      create: {
        datasetId: config.datasetId,
        lastCheckedAt: new Date(),
        lastRowsUpdatedAt: newRowsUpdatedAt,
        lastRecordTimestamp: latestTimestamp,
        recordCount: result.eventsCreated,
        status: "idle",
      },
      update: {
        lastCheckedAt: new Date(),
        lastRowsUpdatedAt: newRowsUpdatedAt,
        ...(latestTimestamp ? { lastRecordTimestamp: latestTimestamp } : {}),
        recordCount: { increment: result.eventsCreated },
        status: "idle",
        lastError: null,
      },
    });
  } catch (err) {
    result.status = "error";
    result.error = err instanceof Error ? err.message : String(err);
    console.error("[Terminal Ingestion] ACRIS error:", err);

    await prisma.ingestionState.upsert({
      where: { datasetId: config.datasetId },
      create: { datasetId: config.datasetId, lastCheckedAt: new Date(), status: "error", lastError: result.error },
      update: { lastCheckedAt: new Date(), status: "error", lastError: result.error },
    }).catch(() => {});
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── Orchestrator ──────────────────────────────────────────────

/**
 * Run ingestion for all datasets whose poll interval has elapsed.
 * Batches datasets (max 5 parallel, 200ms between batches).
 */
export async function runIngestion(orgId: string): Promise<IngestionSummary> {
  const totalStart = Date.now();
  const results: IngestionResult[] = [];

  // Determine which datasets need polling based on elapsed time
  const states = await prisma.ingestionState.findMany();
  const stateMap = new Map(states.map(s => [s.datasetId, s]));

  const now = Date.now();
  const datasetsToPolls: DatasetConfig[] = [];

  for (const ds of ALL_DATASETS) {
    const state = stateMap.get(ds.datasetId);
    if (!state?.lastCheckedAt) {
      // Never polled — always include
      datasetsToPolls.push(ds);
      continue;
    }
    const elapsedMin = (now - state.lastCheckedAt.getTime()) / 60_000;
    if (elapsedMin >= ds.pollIntervalMinutes) {
      datasetsToPolls.push(ds);
    }
  }

  // Batch poll: max BATCH_SIZE parallel, BATCH_DELAY_MS between batches
  for (let i = 0; i < datasetsToPolls.length; i += BATCH_SIZE) {
    const batch = datasetsToPolls.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(ds =>
        ds.datasetId === ACRIS_DATASET.datasetId
          ? pollAcris(orgId)
          : pollStandardDataset(ds, orgId),
      ),
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        results.push({
          dataset: "unknown",
          displayName: "unknown",
          status: "error",
          recordsFetched: 0,
          eventsCreated: 0,
          eventsSkipped: 0,
          durationMs: 0,
          error: r.reason?.message || String(r.reason),
        });
      }
    }

    // Stagger batches
    if (i + BATCH_SIZE < datasetsToPolls.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return {
    datasetsChecked: datasetsToPolls.length,
    datasetsPolled: results.filter(r => r.status === "polled").length,
    datasetsSkipped: results.filter(r => r.status === "skipped").length,
    datasetsErrored: results.filter(r => r.status === "error").length,
    totalEventsCreated: results.reduce((sum, r) => sum + r.eventsCreated, 0),
    totalDurationMs: Date.now() - totalStart,
    results,
  };
}

// ── Seed DatasetRegistry ──────────────────────────────────────

/**
 * Populate the DatasetRegistry table from hardcoded constants.
 * Safe to call multiple times (upserts).
 */
export async function seedDatasetRegistry(): Promise<number> {
  let count = 0;
  for (const ds of ALL_DATASETS) {
    await prisma.datasetRegistry.upsert({
      where: { datasetId: ds.datasetId },
      create: {
        datasetId: ds.datasetId,
        displayName: ds.displayName,
        pollTier: ds.pollTier,
        pollIntervalMinutes: ds.pollIntervalMinutes,
        sodaEndpoint: `${NYC}/resource/${ds.datasetId}.json`,
        timestampField: ds.timestampField,
        bblFields: null,
        enabled: true,
      },
      update: {
        displayName: ds.displayName,
        pollTier: ds.pollTier,
        pollIntervalMinutes: ds.pollIntervalMinutes,
        sodaEndpoint: `${NYC}/resource/${ds.datasetId}.json`,
        timestampField: ds.timestampField,
      },
    });
    count++;
  }
  return count;
}
