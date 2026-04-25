/**
 * Terminal Historical Backfill
 *
 * One-time operation to populate the Terminal with 30-90 days of historical
 * NYC Open Data events so users don't land on an empty feed.
 *
 * Reuses bblExtractor, eventTypeMapper, and recordIdExtractor from
 * terminal-datasets.ts — same dedup logic as live ingestion.
 */

import prisma from "@/lib/prisma";
import type { DatasetConfig } from "./terminal-datasets";
import {
  ACRIS_DATASET,
  ACRIS_LEGALS_ID,
  ACRIS_PARTIES_ID,
  ALL_DATASETS,
} from "./terminal-datasets";

const NYC = "https://data.cityofnewyork.us";
const APP_TOKEN = process.env.NYC_OPEN_DATA_APP_TOKEN || "";
const isValidToken = APP_TOKEN.length > 0 && !APP_TOKEN.startsWith("YOUR_");
const FETCH_TIMEOUT = 15000; // Longer timeout for historical queries
const PAGE_SIZE = 1000;
const MAX_RECORDS_PER_DATASET = 5000;
const UPSERT_BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

// ── Types ─────────────────────────────────────────────────────

export interface BackfillDatasetResult {
  dataset: string;
  displayName: string;
  status: "completed" | "error";
  recordsFetched: number;
  eventsCreated: number;
  eventsSkipped: number;
  pages: number;
  durationMs: number;
  error?: string;
}

export interface BackfillSummary {
  daysBack: number;
  datasetsProcessed: number;
  totalEventsCreated: number;
  totalRecordsFetched: number;
  totalDurationMs: number;
  results: BackfillDatasetResult[];
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

/** Default ISO floating timestamp for calendar_date columns */
function daysAgoISO(daysBack: number): string {
  const d = new Date(Date.now() - daysBack * 86_400_000);
  return d.toISOString().slice(0, 19); // "2026-03-07T00:00:00"
}

// ── Standard Dataset Backfill ─────────────────────────────────

async function backfillStandardDataset(
  config: DatasetConfig,
  daysBack: number,
  orgId: string,
): Promise<BackfillDatasetResult> {
  const start = Date.now();
  const result: BackfillDatasetResult = {
    dataset: config.datasetId,
    displayName: config.displayName,
    status: "completed",
    recordsFetched: 0,
    eventsCreated: 0,
    eventsSkipped: 0,
    pages: 0,
    durationMs: 0,
  };

  try {
    const sinceDate = new Date(Date.now() - daysBack * 86_400_000);
    const since = config.formatSinceDate
      ? config.formatSinceDate(sinceDate)
      : daysAgoISO(daysBack);
    let offset = 0;

    while (result.recordsFetched < MAX_RECORDS_PER_DATASET) {
      const tsField = config.timestampField || "issue_date";
      const params: Record<string, string> = {
        $where: `${tsField} > '${since}'`,
        $order: `${tsField} ASC`,
        $limit: String(PAGE_SIZE),
        $offset: String(offset),
      };

      const records = await querySoda(config.datasetId, params);
      result.recordsFetched += records.length;
      result.pages++;

      if (records.length === 0) break;

      // Batch upserts
      for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
        const batch = records.slice(i, i + UPSERT_BATCH_SIZE);

        const settled = await Promise.allSettled(
          batch.map(async (record) => {
            const bbl = config.bblExtractor(record);
            const eventType = config.eventTypeMapper(record);
            const sourceRecordId = config.recordIdExtractor(record);

            if (!eventType || !bbl) {
              result.eventsSkipped++;
              return;
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
              if (err?.code === "P2002") {
                result.eventsSkipped++;
              } else {
                throw err;
              }
            }
          }),
        );

        // Surface non-P2002 errors that Promise.allSettled caught
        for (const s of settled) {
          if (s.status === "rejected") {
            console.error(`[Terminal Backfill] Upsert error in ${config.displayName}:`, s.reason);
            result.eventsSkipped++;
          }
        }

        // Stagger batches
        if (i + UPSERT_BATCH_SIZE < records.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }

      offset += records.length;

      // Stop if we got less than a full page (no more records)
      if (records.length < PAGE_SIZE) break;

      // Brief pause between pages
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  } catch (err) {
    result.status = "error";
    result.error = err instanceof Error ? err.message : String(err);
    console.error(`[Terminal Backfill] ${config.displayName} error:`, err);
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── ACRIS Backfill ────────────────────────────────────────────

async function backfillAcris(
  daysBack: number,
  orgId: string,
): Promise<BackfillDatasetResult> {
  const start = Date.now();
  const config = ACRIS_DATASET;
  const result: BackfillDatasetResult = {
    dataset: config.datasetId,
    displayName: config.displayName,
    status: "completed",
    recordsFetched: 0,
    eventsCreated: 0,
    eventsSkipped: 0,
    pages: 0,
    durationMs: 0,
  };

  try {
    const sinceDate = new Date(Date.now() - daysBack * 86_400_000)
      .toISOString()
      .split("T")[0]; // ACRIS uses date-only

    let offset = 0;
    // Lower limit for ACRIS — each record triggers 2 join queries
    const ACRIS_MAX = Math.min(MAX_RECORDS_PER_DATASET, 500);

    while (result.recordsFetched < ACRIS_MAX) {
      const params: Record<string, string> = {
        $where: `doc_type IN('DEED','DEEDO','MTGE','AGMT','AL&R','ASST','SAT') AND good_through_date > '${sinceDate}'`,
        $order: "good_through_date ASC",
        $limit: String(Math.min(PAGE_SIZE, 100)), // Smaller pages for ACRIS
        $offset: String(offset),
      };

      const masterRecords = await querySoda(config.datasetId, params);
      result.recordsFetched += masterRecords.length;
      result.pages++;

      if (masterRecords.length === 0) break;

      for (const master of masterRecords) {
        const docId = master.document_id;
        if (!docId) {
          result.eventsSkipped++;
          continue;
        }

        const eventType = config.eventTypeMapper(master);
        if (!eventType) {
          result.eventsSkipped++;
          continue;
        }

        const safeDocId = String(docId).replace(/'/g, "''");

        // Join: Legals -> BBL
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
        } catch {
          // Legals join failed — skip this record
        }

        if (!bbl) {
          result.eventsSkipped++;
          continue;
        }

        const borough = parseInt(bbl[0]);

        // Join: Parties -> buyer/seller names
        let parties: any[] = [];
        try {
          parties = await querySoda(ACRIS_PARTIES_ID, {
            $where: `document_id='${safeDocId}'`,
            $limit: "10",
          });
        } catch {
          // Parties join failed — proceed without
        }

        const enrichedMetadata = {
          ...master,
          _bbl: bbl,
          _parties: parties.map((p: any) => ({
            name: p.name,
            type: p.party_type,
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

        // Brief pause between ACRIS records (each does 2 join queries)
        await new Promise((r) => setTimeout(r, 50));
      }

      offset += masterRecords.length;
      if (masterRecords.length < 100) break;

      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  } catch (err) {
    result.status = "error";
    result.error = err instanceof Error ? err.message : String(err);
    console.error("[Terminal Backfill] ACRIS error:", err);
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── Orchestrator ──────────────────────────────────────────────

/**
 * Run historical backfill for Terminal datasets.
 *
 * @param orgId - Organization ID to assign events to
 * @param daysBack - How many days of history to fetch (max 90)
 * @param datasetIds - Optional filter: only backfill these dataset IDs
 */
export async function runBackfill(
  orgId: string,
  daysBack = 30,
  datasetIds?: string[],
): Promise<BackfillSummary> {
  const totalStart = Date.now();
  const results: BackfillDatasetResult[] = [];

  // Filter datasets if specified
  let datasets = ALL_DATASETS;
  if (datasetIds && datasetIds.length > 0) {
    datasets = ALL_DATASETS.filter((ds) => datasetIds.includes(ds.datasetId));
  }

  console.log(
    `[Terminal Backfill] Starting: ${datasets.length} datasets, ${daysBack} days back, org=${orgId}`,
  );

  // Process datasets sequentially to avoid overwhelming SODA API
  for (const ds of datasets) {
    console.log(`[Terminal Backfill] Processing: ${ds.displayName} (${ds.datasetId})`);

    const result =
      ds.datasetId === ACRIS_DATASET.datasetId
        ? await backfillAcris(daysBack, orgId)
        : await backfillStandardDataset(ds, daysBack, orgId);

    results.push(result);

    console.log(
      `[Terminal Backfill] ${ds.displayName}: ${result.eventsCreated} created, ${result.eventsSkipped} skipped, ${result.recordsFetched} fetched (${result.durationMs}ms)`,
    );

    // Pause between datasets
    await new Promise((r) => setTimeout(r, 500));
  }

  const summary: BackfillSummary = {
    daysBack,
    datasetsProcessed: results.length,
    totalEventsCreated: results.reduce((sum, r) => sum + r.eventsCreated, 0),
    totalRecordsFetched: results.reduce((sum, r) => sum + r.recordsFetched, 0),
    totalDurationMs: Date.now() - totalStart,
    results,
  };

  console.log(
    `[Terminal Backfill] Complete: ${summary.totalEventsCreated} events created across ${summary.datasetsProcessed} datasets (${summary.totalDurationMs}ms)`,
  );

  return summary;
}
