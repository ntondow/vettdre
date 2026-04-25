# Terminal Handoff Prompt 7: Cloud Scheduler + Initial Data Backfill

## Goal
Set up the infrastructure to actually run the Terminal pipeline in production: configure Google Cloud Scheduler to trigger the 3 Terminal cron endpoints on the right intervals, create a one-time backfill script that populates the Terminal with 30-60 days of historical events so users don't land on an empty feed, and add a setup script that documents the scheduler configuration.

## Project
Repo: VettdRE (this repo)
Target files:
- `scripts/terminal-scheduler-setup.sh` (new — gcloud scheduler commands)
- `src/app/api/terminal/backfill/route.ts` (new — one-time historical backfill endpoint)
- `src/lib/terminal-backfill.ts` (new — backfill logic)

## Discovery Instructions
Before writing any code, read the following files:

1. `cloudbuild.yaml` — Understand the deployment: service name is `vettdre`, region is `us-east1`, secrets are in Google Secret Manager. Note: the service URL is `https://vettdre-[hash].run.app` — the setup script should include a `gcloud run services describe` command to get the actual URL.

2. `scripts/create-secrets.sh` — See how CRON_SECRET is generated and stored. The scheduler needs this value for the Authorization header.

3. `src/app/api/automations/cron/route.ts` — The existing cron auth pattern: `Bearer ${process.env.CRON_SECRET}` header check. All Terminal endpoints use this same pattern.

4. `src/app/api/leasing/follow-ups/route.ts` (lines 7-14) — Contains a documented gcloud scheduler template command. Follow this exact format.

5. `src/lib/terminal-ingestion.ts` — Understand the ingestion engine so the backfill can reuse it. The backfill needs to call the same polling logic but with a wider time window.

6. `src/lib/terminal-datasets.ts` — The dataset configurations. The backfill iterates these same datasets but fetches historical records.

7. `src/lib/supabase/middleware.ts` — Verify `/api/terminal/` prefix is already whitelisted (it should be from Prompt 2).

**Propose your plan before writing any code.**

## Implementation Intent

### 1. Cloud Scheduler Setup Script (`scripts/terminal-scheduler-setup.sh`)

Create a bash script that sets up 5 Cloud Scheduler jobs (3 Terminal + 2 existing that may not be configured yet). The script should:

1. Retrieve the Cloud Run service URL:
   ```bash
   SERVICE_URL=$(gcloud run services describe vettdre --region=us-east1 --format='value(status.url)')
   ```

2. Retrieve the CRON_SECRET:
   ```bash
   CRON_SECRET=$(gcloud secrets versions access latest --secret=CRON_SECRET)
   ```

3. Create scheduler jobs with `--location=us-east1` and `--time-zone="America/New_York"`:

**Terminal Ingestion** (every 15 minutes):
```bash
gcloud scheduler jobs create http terminal-ingest \
  --location=us-east1 \
  --schedule="*/15 * * * *" \
  --uri="${SERVICE_URL}/api/terminal/ingest" \
  --http-method=GET \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --time-zone="America/New_York" \
  --attempt-deadline=300s
```

**Terminal Enrichment** (every 15 minutes, offset by 5 minutes):
```bash
gcloud scheduler jobs create http terminal-enrich \
  --location=us-east1 \
  --schedule="5,20,35,50 * * * *" \
  --uri="${SERVICE_URL}/api/terminal/enrich" \
  --http-method=GET \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --time-zone="America/New_York" \
  --attempt-deadline=300s
```

**Terminal Brief Generation** (every 15 minutes, offset by 10 minutes):
```bash
gcloud scheduler jobs create http terminal-generate-briefs \
  --location=us-east1 \
  --schedule="10,25,40,55 * * * *" \
  --uri="${SERVICE_URL}/api/terminal/generate-briefs" \
  --http-method=GET \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --time-zone="America/New_York" \
  --attempt-deadline=300s
```

**Automations Cron** (every 30 minutes — existing endpoint, may not be scheduled):
```bash
gcloud scheduler jobs create http automations-cron \
  --location=us-east1 \
  --schedule="*/30 * * * *" \
  --uri="${SERVICE_URL}/api/automations/cron" \
  --http-method=GET \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --time-zone="America/New_York" \
  --attempt-deadline=60s
```

**Leasing Follow-Ups** (every 15 minutes — existing endpoint, may not be scheduled):
```bash
gcloud scheduler jobs create http leasing-follow-ups \
  --location=us-east1 \
  --schedule="*/15 * * * *" \
  --uri="${SERVICE_URL}/api/leasing/follow-ups" \
  --http-method=GET \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --time-zone="America/New_York" \
  --attempt-deadline=60s
```

The script should include:
- Usage instructions at the top as comments
- Error handling (check if `gcloud` is installed, check if project is set)
- A `--update` flag that uses `gcloud scheduler jobs update http` instead of `create` for idempotency
- A list command at the end: `gcloud scheduler jobs list --location=us-east1`

### 2. Historical Backfill Logic (`src/lib/terminal-backfill.ts`)

Create a backfill function that populates the Terminal with historical events. This is different from normal ingestion:
- Normal ingestion fetches records since the last poll (incremental)
- Backfill fetches records from the last N days regardless of prior state

```typescript
async function backfillDataset(
  config: DatasetConfig,
  daysBack: number,  // default 30
  orgId: string,
): Promise<{ created: number; skipped: number; errors: number }>
```

For each dataset in terminal-datasets.ts:
1. Calculate the start date: `new Date(Date.now() - daysBack * 86400000)`
2. Query SODA API with: `$where={timestampField} > '{startDate}'&$order={timestampField} ASC&$limit=5000`
3. For each record, apply the same `eventTypeMapper` and `bblExtractor` from the dataset config
4. Upsert into TerminalEvent (same dedup logic as normal ingestion)
5. Track counts: created, skipped (duplicate), errors

**Batch processing:**
- Process max 1000 records per dataset per invocation
- Use pagination ($offset) if a dataset has more than 1000 qualifying records in the time window
- 200ms delay between batches of 5 upserts

**ACRIS special handling:**
Same Master → Legals → Parties join as normal ingestion, but query all deed recordings in the time window rather than just new ones.

### 3. Backfill API Endpoint (`src/app/api/terminal/backfill/route.ts`)

Create a POST endpoint (not GET — backfill is a deliberate action, not a scheduled poll):

1. Validate CRON_SECRET bearer token
2. Accept JSON body: `{ daysBack?: number, datasets?: string[], orgId: string }`
   - `daysBack` defaults to 30
   - `datasets` defaults to all MVP datasets
   - `orgId` is required (backfill is org-scoped)
3. Call `backfillDataset()` for each qualifying dataset
4. Return summary: per-dataset counts, total events created, total duration
5. Set `dynamic = "force-dynamic"` and a generous timeout

**Safety:**
- Max daysBack: 90 (prevent accidental huge backfills)
- Max 5000 events per dataset per run
- Idempotent: upsert means running twice doesn't create duplicates

### 4. Backfill Trigger

After the backfill endpoint is deployed, it can be triggered with:
```bash
curl -X POST "https://YOUR_SERVICE_URL/api/terminal/backfill" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"daysBack": 30, "orgId": "YOUR_ORG_ID"}'
```

Include this curl command as a comment at the top of the backfill route file.

## Constraints
- The scheduler setup script is documentation + automation — it runs manually, not in CI
- Use `gcloud scheduler jobs create http` (not App Engine cron.yaml — that's a different product)
- The backfill endpoint must be behind CRON_SECRET auth — it's not a public endpoint
- Backfill should reuse `bblExtractor`, `eventTypeMapper`, and `getRecordId` from terminal-datasets.ts — do NOT duplicate that logic
- The 3 Terminal cron jobs are staggered by 5 minutes so they don't compete for resources: ingest at :00, enrich at :05, briefs at :10
- Do NOT set up the scheduler to also trigger backfill — that's a one-time manual operation
- The setup script should use `gcloud scheduler jobs create` with `|| gcloud scheduler jobs update` for idempotency
