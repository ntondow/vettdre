/**
 * ACRIS Historical Backfill — chunked by recorded_borough × document_date monthly windows.
 *
 * Resumable via backfill_progress table tracking completed chunks.
 * Respects Socrata rate limits (250ms sleep between requests with app token).
 *
 * Usage:
 *   npx tsx scripts/condo-ingest/backfill.ts                           # full 2000-present, all boroughs
 *   npx tsx scripts/condo-ingest/backfill.ts --since=2020-01-01 --boroughs=1  # Manhattan 2020+
 *   npx tsx scripts/condo-ingest/backfill.ts --dry-run                 # preview chunks
 */

import prisma from "../../src/lib/prisma";
import { initDocTypeWhitelists, isDeedType, isMortgageType } from "../../src/lib/condo-ingest/deed-types";
import { ACRIS_LEGALS_ID, ACRIS_PARTIES_ID } from "../../src/lib/terminal-datasets";

const ACRIS_MASTER_ID = "bnx9-e6tj";
const NYC_BASE = "https://data.cityofnewyork.us/resource";
const FETCH_TIMEOUT = 15000;
const PAGE_SIZE = 1000;
const INTER_REQUEST_DELAY_MS = 250;
const BATCH_SIZE = 5;

// ── CLI Args ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const sinceArg = args.find((a) => a.startsWith("--since="))?.split("=")[1] || "2000-01-01";
const boroughsArg = args.find((a) => a.startsWith("--boroughs="))?.split("=")[1] || "1,2,3,4,5";
const SINCE = new Date(sinceArg);
const BOROUGHS = boroughsArg.split(",").map(Number);

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

// ── Chunk Generator ──────────────────────────────────────────

interface Chunk {
  borough: number;
  yearMonth: string; // "YYYY-MM"
  startDate: string; // "YYYY-MM-01"
  endDate: string;   // next month first day
}

function generateChunks(): Chunk[] {
  const chunks: Chunk[] = [];
  const now = new Date();

  for (const boro of BOROUGHS) {
    const cursor = new Date(SINCE);
    while (cursor < now) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const nextMonth = new Date(year, month + 1, 1);
      const endDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

      chunks.push({
        borough: boro,
        yearMonth: `${year}-${String(month + 1).padStart(2, "0")}`,
        startDate,
        endDate,
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return chunks;
}

// ── Progress Tracking ────────────────────────────────────────

async function ensureProgressTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS condo_ownership.backfill_progress (
      chunk_key TEXT PRIMARY KEY,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      records_processed INT NOT NULL DEFAULT 0
    )
  `;
}

async function isChunkDone(chunkKey: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ chunk_key: string }>>`
    SELECT chunk_key FROM condo_ownership.backfill_progress WHERE chunk_key = ${chunkKey}
  `;
  return rows.length > 0;
}

async function markChunkDone(chunkKey: string, records: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO condo_ownership.backfill_progress (chunk_key, records_processed)
    VALUES (${chunkKey}, ${records})
    ON CONFLICT (chunk_key) DO UPDATE SET records_processed = EXCLUDED.records_processed, completed_at = NOW()
  `;
}

// ── Main Backfill ────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Since: ${sinceArg}, Boroughs: ${BOROUGHS.join(",")}`);

  await initDocTypeWhitelists();
  await ensureProgressTable();

  const chunks = generateChunks();
  console.log(`Total chunks: ${chunks.length}`);

  if (DRY_RUN) {
    console.log(`\nFirst 10 chunks:`);
    for (const c of chunks.slice(0, 10)) {
      console.log(`  boro=${c.borough} ${c.yearMonth} (${c.startDate} → ${c.endDate})`);
    }
    console.log(`\nLast 5 chunks:`);
    for (const c of chunks.slice(-5)) {
      console.log(`  boro=${c.borough} ${c.yearMonth} (${c.startDate} → ${c.endDate})`);
    }
    await prisma.$disconnect();
    return;
  }

  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const startTime = Date.now();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkKey = `${chunk.borough}-${chunk.yearMonth}`;

    // Check if already done (resumable)
    if (await isChunkDone(chunkKey)) {
      totalSkipped++;
      continue;
    }

    try {
      const records = await processChunk(chunk);
      await markChunkDone(chunkKey, records);
      totalProcessed += records;

      if ((i + 1) % 10 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(
          `  Progress: ${i + 1}/${chunks.length} chunks, ` +
          `${totalProcessed} records, ${totalSkipped} skipped, ${elapsed}s elapsed`,
        );
      }
    } catch (err) {
      totalErrors++;
      console.error(`  ERROR chunk ${chunkKey}:`, err);
      // Continue with next chunk — don't fail entire backfill
    }

    await new Promise((r) => setTimeout(r, INTER_REQUEST_DELAY_MS));
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Backfill complete.`);
  console.log(`  Chunks processed: ${chunks.length - totalSkipped}`);
  console.log(`  Chunks skipped (already done): ${totalSkipped}`);
  console.log(`  Total records: ${totalProcessed}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(0)}s`);

  await prisma.$disconnect();
}

async function processChunk(chunk: Chunk): Promise<number> {
  let totalRecords = 0;
  let offset = 0;

  while (true) {
    const masters = await querySoda(ACRIS_MASTER_ID, {
      $where: `recorded_borough='${chunk.borough}' AND document_date >= '${chunk.startDate}' AND document_date < '${chunk.endDate}'`,
      $order: "document_date ASC",
      $limit: String(PAGE_SIZE),
      $offset: String(offset),
    });

    if (masters.length === 0) break;

    for (let i = 0; i < masters.length; i += BATCH_SIZE) {
      const batch = masters.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(processMasterRecord));

      if (i + BATCH_SIZE < masters.length) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    totalRecords += masters.length;
    offset += masters.length;
    if (masters.length < PAGE_SIZE) break;

    await new Promise((r) => setTimeout(r, INTER_REQUEST_DELAY_MS));
  }

  return totalRecords;
}

async function processMasterRecord(master: any): Promise<void> {
  const documentId = master.document_id;
  if (!documentId) return;

  const docType = (master.doc_type || "").trim().toUpperCase();
  if (!isDeedType(docType) && !isMortgageType(docType)) return;

  // Upsert Master
  await prisma.$executeRaw`
    INSERT INTO condo_ownership.acris_master (document_id, record_type, crfn, recorded_borough, doc_type, document_date, document_amount, recorded_datetime, modified_date, good_through_date, raw)
    VALUES (
      ${documentId}, ${master.record_type || null}, ${master.crfn || null},
      ${master.recorded_borough ? parseInt(master.recorded_borough) : null}::smallint,
      ${docType},
      ${master.document_date ? master.document_date.split("T")[0] : null}::date,
      ${master.document_amount ? parseFloat(master.document_amount) : null}::numeric,
      ${master.recorded_datetime || null}::timestamptz,
      ${master.modified_date || null}::timestamptz,
      ${master.good_through_date ? master.good_through_date.split("T")[0] : null}::date,
      ${JSON.stringify(master)}::jsonb
    )
    ON CONFLICT (document_id) DO NOTHING
  `;

  // Fetch + upsert Legals
  try {
    const legals = await querySoda(ACRIS_LEGALS_ID, {
      $where: `document_id='${documentId}'`,
      $limit: "50",
    });
    for (const leg of legals) {
      await prisma.$executeRaw`
        INSERT INTO condo_ownership.acris_legals (id, document_id, record_type, borough, block, lot, property_type, street_number, street_name, unit)
        VALUES (gen_random_uuid(), ${documentId}, ${leg.record_type || null},
          ${leg.borough ? parseInt(leg.borough) : null}::smallint,
          ${leg.block ? parseInt(leg.block) : null}, ${leg.lot ? parseInt(leg.lot) : null},
          ${leg.property_type || null}, ${leg.street_number || null}, ${leg.street_name || null}, ${leg.unit || null})
        ON CONFLICT (document_id, borough, block, lot, COALESCE(unit, '')) DO NOTHING
      `;
    }
  } catch { /* continue */ }

  // Fetch + upsert Parties
  try {
    const parties = await querySoda(ACRIS_PARTIES_ID, {
      $where: `document_id='${documentId}'`,
      $order: "party_type ASC",
      $limit: "50",
    });
    for (let seq = 0; seq < parties.length; seq++) {
      const p = parties[seq];
      await prisma.$executeRaw`
        INSERT INTO condo_ownership.acris_parties (id, document_id, party_sequence, party_type, name, address_1, address_2, country, city, state, zip)
        VALUES (gen_random_uuid(), ${documentId}, ${seq + 1},
          ${p.party_type ? parseInt(p.party_type) : null}::smallint,
          ${p.name || null}, ${p.address_1 || null}, ${p.address_2 || null},
          ${p.country || null}, ${p.city || null}, ${p.state || null}, ${p.zip || null})
        ON CONFLICT (document_id, party_type, party_sequence) DO NOTHING
      `;
    }
  } catch { /* continue */ }
}

main().catch((err) => {
  console.error("Backfill fatal error:", err);
  process.exit(1);
});
