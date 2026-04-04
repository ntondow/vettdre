# Terminal Handoff Prompt 2: Data Ingestion Infrastructure

## Goal
Build the data ingestion layer that polls NYC Open Data via the Socrata SODA API to detect new property events. This is the "input side" of the Terminal — it detects that something happened (a sale, permit, violation, etc.) and writes a raw TerminalEvent record to the database. Enrichment and AI processing happen in later prompts.

## Project
Repo: VettdRE (this repo)
Target files: `src/lib/terminal-ingestion.ts` (new), `src/app/api/terminal/ingest/route.ts` (new), `src/lib/terminal-datasets.ts` (new)

## Discovery Instructions
Before writing any code, read the following files:

1. `prisma/schema.prisma` — Find the TerminalEvent, DatasetRegistry, IngestionState, and TerminalEventCategory models added in the previous prompt. Understand their fields and indexes.

2. `src/lib/nyc-opendata.ts` — Understand the existing SODA API query pattern. Note the base URL, how app tokens are passed, timeout handling.

3. `src/lib/data-fusion-engine.ts` (lines 390-430) — See the DATASETS constant with existing dataset IDs. These are already proven to work.

4. `src/lib/cache-warming.ts` — Study the batch processing pattern: batches of 5, 200ms delays, Promise.allSettled for resilience, skip-if-cached logic.

5. `src/app/api/automations/cron/route.ts` — This is the existing cron endpoint pattern. Uses CRON_SECRET bearer token auth. The Terminal ingestion endpoint should follow the same pattern.

6. `src/lib/prisma.ts` — How the Prisma client is initialized (singleton, connection pooling).

7. `CLAUDE.md` — Full project context.

**Propose your plan before writing any code.**

## Implementation Intent

### 1. Dataset Registry Constants (`src/lib/terminal-datasets.ts`)
Create a constants file that defines the full dataset registry for the Terminal. This is the source of truth for what gets polled. Structure:

```typescript
interface DatasetConfig {
  datasetId: string;       // Socrata 4x4 ID
  displayName: string;
  pollTier: 'A' | 'B' | 'C';
  pollIntervalMinutes: number;  // 15, 60, or 1440
  timestampField: string | null;  // Field for incremental $where queries
  bblExtractor: (record: any) => string | null;  // How to get BBL from a record
  eventTypeMapper: (record: any) => string | null;  // Map record to Terminal event type
  eventTier: 1 | 2 | 3;   // Which output tier this generates
  category: string;        // Which toggle category (Sales, Violations, etc.)
}
```

For MVP (Phase 1), only implement Tier A datasets that detect clear events:
- DOB NOW Job Applications (`w9ak-ipjd`) — New Building (NB) and Major Alteration (A1) permits
- DOB Job Application Filings Legacy (`ic3t-wcy2`) — Same but BIS-era
- HPD Violations (`wvxf-dwi5`) — Class C and I only (immediately hazardous)
- DOB Violations (`3h2n-5cm9`) — Stop work orders (filter for SWO disposition)
- DOB ECB Violations (`6bgk-3dad`) — High-penalty ECB summonses (>$10K)
- DOB Stalled Sites (`i296-73x5`) — Stalled construction
- ACRIS Master (`bnx9-e6tj`) — Sales detection (deed recordings)
- ACRIS Legals (`8h5j-fqxa`) — For BBL resolution of ACRIS events
- ACRIS Parties (`636b-3b5g`) — Buyer/seller names

For each dataset, define the `bblExtractor` function. Most NYC datasets have `bbl` or `borough`+`block`+`lot` fields. ACRIS uses a document_id join pattern — the Legals table has BBL, Master has the event, Parties has names. Handle this join.

### 2. Two-Phase Polling Engine (`src/lib/terminal-ingestion.ts`)

**Phase 1 — Metadata Check:**
For each dataset in the registry, make a lightweight GET to:
```
https://data.cityofnewyork.us/api/views/{datasetId}
```
Parse the `rowsUpdatedAt` field from the response. Compare against `IngestionState.lastRowsUpdatedAt` for this dataset. If unchanged, skip. If changed, proceed to Phase 2.

**Phase 2 — Incremental Fetch:**
Query the dataset's SODA endpoint with:
```
$where=:updated_at > '{lastRecordTimestamp}'
$order=:updated_at ASC
$limit=1000
```
For datasets without `:updated_at`, use the dataset-specific `timestampField` (e.g., `approved_date` for permits, `inspectiondate` for violations).

For each returned record:
1. Extract BBL using the dataset's `bblExtractor`
2. Determine event type using `eventTypeMapper`
3. Skip if event type is null (record doesn't qualify — e.g., a minor permit type)
4. Check for duplicate via `@@unique([sourceDataset, sourceRecordId])` — use upsert
5. Write `TerminalEvent` with: eventType, bbl, borough (derived from BBL first digit), sourceDataset, sourceRecordId, tier, metadata (raw record as Json)
6. Leave `enrichmentPackage` and `aiBrief` null — those are filled by later pipeline steps

After processing, update `IngestionState`: lastCheckedAt, lastRowsUpdatedAt, lastRecordTimestamp, recordCount, status.

**Error Handling:**
- Wrap each dataset's poll in try/catch. On error, set IngestionState.status = "error" and IngestionState.lastError with the message. Never let one dataset failure stop others.
- Use exponential backoff if a dataset returns 429 (rate limited): skip it this cycle, double the wait.
- Use the same `Promise.allSettled` pattern from cache-warming.ts for parallel polling within a tier.

**ACRIS Special Handling:**
ACRIS data requires joining 3 tables (Master → Legals → Parties) to produce a complete event. The ingestion layer should:
1. Poll ACRIS Master for new document_ids (filter doc_type in ['DEED', 'DEEDO', 'MTGE', 'AGMT', 'AL&R', 'ASST', 'SAT'])
2. For each new document_id, query ACRIS Legals for BBL
3. Query ACRIS Parties for buyer/seller names
4. Assemble the joined record before writing the TerminalEvent
5. Store the joined data in the metadata Json field

### 3. Cron API Endpoint (`src/app/api/terminal/ingest/route.ts`)

Create a GET endpoint that:
1. Validates CRON_SECRET bearer token (same pattern as `/api/automations/cron`)
2. Reads the DatasetRegistry from the database (or uses the hardcoded constants for MVP)
3. Groups datasets by pollTier
4. For this invocation, determine which tiers to poll based on elapsed time:
   - Tier A: always poll (called every 15 min)
   - Tier B: poll if last poll was >60 min ago
   - Tier C: poll if last poll was >24 hours ago
5. Calls the ingestion engine for qualifying datasets
6. Returns JSON summary: datasets checked, events detected, errors

The endpoint should be designed to be called by Google Cloud Scheduler every 15 minutes. A single invocation handles all tiers based on elapsed time logic.

### 4. Seed DatasetRegistry

Include a utility function or script that seeds the DatasetRegistry table with the MVP dataset configurations. This can run on first invocation or be called manually.

## Constraints
- Use the existing `NYC_OPEN_DATA_APP_TOKEN` env var for Socrata API auth (already in the app)
- Follow the existing fetch pattern from nyc-opendata.ts (timeout: 8000ms, proper error handling)
- Batch processing: poll max 5 datasets in parallel, 200ms delay between batches (same as cache-warming.ts)
- All new files must use `"use server"` if they export async functions called from server actions
- The cron route should complete within Cloud Run's 300-second timeout — if there are too many datasets, prioritize Tier A and defer others
- Do NOT implement enrichment or AI brief generation — those are separate prompts
- Do NOT create mirror tables — the ingestion layer writes events, not mirrors
- Log key metrics: datasets polled, records fetched, events created, errors, duration
