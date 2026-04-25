# Handoff: Terminal Real-Time Background Processing

## Goal
The Terminal's 3-stage pipeline (ingest → enrich → generate briefs) works but is too slow for a live product. When a user opens the Terminal, events should already have AI briefs ready — not still be queuing. We need to make the pipeline fast enough and frequent enough that brief generation keeps pace with ingestion in near real-time, and the UI should degrade gracefully when briefs aren't ready yet.

## Project
- **Repo:** VettdRE (this repo)
- **Target folder:** `src/app/api/terminal/`, `src/lib/terminal-ai.ts`, `src/app/(dashboard)/terminal/`

## Current State (the problem)
- **Brief generation is sequential:** one Claude API call at a time with 200ms delay between calls
- **Batch cap:** 30 events per run, each ~3 seconds = ~96 seconds per run
- **Frequency:** Cloud Scheduler fires every 15 minutes (`:10/:25/:40/:55`)
- **Max throughput:** ~120 briefs/hour — any burst of events (backfill, busy news day) creates a backlog that takes hours to clear
- **UI blocks on briefs:** events without `aiBrief` may not render prominently or feel incomplete to users
- **Cloud Scheduler status unknown:** the 5 cron jobs from `scripts/terminal-scheduler-setup.sh` may not actually be deployed in production — verify first

## Files Likely Involved

### Pipeline speed (parallelization + frequency)
- `src/app/api/terminal/generate-briefs/route.ts` — main file to modify: parallelize the sequential loop, increase batch size
- `src/lib/terminal-ai.ts` — no changes needed (already a clean single-brief function), but review for any error handling that needs to work with concurrent calls
- `scripts/terminal-scheduler-setup.sh` — update brief generation cron from 15-min to 3–5 min interval

### UI graceful degradation
- `src/app/(dashboard)/terminal/components/terminal-event-card.tsx` — render events without briefs using raw event data (address, type, amount)
- `src/app/(dashboard)/terminal/components/terminal-feed.tsx` — ensure feed query doesn't filter out events missing `aiBrief`; add polling or refresh to pick up newly generated briefs
- `src/app/(dashboard)/terminal/components/event-detail-expanded.tsx` — handle missing brief in expanded view

### Verification
- `scripts/terminal-scheduler-setup.sh` — verify these jobs exist in GCP
- `src/app/api/terminal/generate-briefs/route.ts` — check production logs for recent invocations

## Implementation Intent

### 1. Verify Cloud Scheduler is running (prerequisite)
Check whether the 5 cron jobs from `terminal-scheduler-setup.sh` are actually deployed. The endpoint URLs, auth headers, and schedule expressions should match what's in the script. If they're not deployed, that's the #1 reason nothing runs in the background. Document how to verify (e.g., `gcloud scheduler jobs list --location=us-east1`).

### 2. Parallelize brief generation
In `generate-briefs/route.ts`, replace the sequential `for` loop with batched parallel processing:
- Process briefs in parallel batches of 5 (configurable via `PARALLEL_BATCH_SIZE` constant)
- Use `Promise.allSettled()` for each batch so one failure doesn't kill the batch
- Keep the 200ms delay BETWEEN batches (not between individual calls) as a rate-limit safety valve
- Increase `MAX_EVENTS_PER_RUN` from 30 to 50 (with parallelization, 50 events in batches of 5 = 10 sequential rounds × ~3.5s = ~35 seconds total)
- Preserve all existing error handling: retry counter, rate-limit detection, metadata updates

### 3. Increase brief generation frequency
Update the Cloud Scheduler for the `generate-briefs` cron job:
- Change from every 15 minutes to every 5 minutes
- This means brief gen runs 12x/hour instead of 4x/hour
- Combined with parallelization (50/run × 12 runs/hour), throughput jumps to ~600 briefs/hour
- The other pipeline stages (ingest, enrich) can stay at 15-minute intervals — they're not the bottleneck

### 4. UI: show events before briefs are ready
In the Terminal feed UI, events should be visible and useful even without an AI brief:
- **Event cards without briefs:** show the event card normally using raw data (address, event type, dollar amount, neighborhood, date). Where the brief text would go, show a subtle "Brief generating..." indicator or just omit the brief section
- **Feed query:** make sure the Prisma query in the feed's server action does NOT filter on `aiBrief: { not: null }` — all enriched events should appear
- **Brief appears when ready:** on next page load or feed refresh, the brief will be there. A simple approach: the existing feed refresh/polling mechanism picks it up. No need for WebSockets or SSE in v1
- **Color tags fallback:** if `_colorTags` aren't in metadata yet, derive a default tag from the event type (e.g., "SALE" → green, "VIOLATION" → red) so the card still has visual coding

### 5. Optional: use Haiku for Tier 2 events
Tier 2 events (lower priority) currently use Claude Sonnet like Tier 1. Switching Tier 2 to Claude Haiku would be ~3x faster and ~10x cheaper per brief, further reducing queue pressure. This is a nice-to-have, not required for the core fix.

## Constraints
- **Stack:** Next.js 16 App Router, TypeScript, Prisma, Anthropic SDK
- **Anthropic rate limits:** Sonnet allows substantial concurrent requests but respect 429s. The existing `rateLimited` break logic must still work — if any call in a parallel batch returns 429, stop the entire run
- **Cloud Run timeout:** the endpoint has `maxDuration = 300` (5 minutes). With parallelization, 50 events should complete well under this
- **No WebSockets:** Cloud Run doesn't support long-lived WebSocket connections well. For real-time brief updates, polling or client-side refetch is the right approach for now
- **Existing patterns:** use `Promise.allSettled()` (already used in `data-fusion-engine.ts`), keep the fire-and-forget error recording pattern, keep the `CRON_SECRET` auth pattern
- **Don't touch ingestion or enrichment stages** — they're not the bottleneck and work fine on 15-minute cycles

## Discovery Instructions
Before writing any code, read these files to understand the current implementation:

1. `src/app/api/terminal/generate-briefs/route.ts` — the main file you'll modify (sequential loop → parallel batches)
2. `src/lib/terminal-ai.ts` — the `generateBrief()` function signature and error behavior
3. `src/app/(dashboard)/terminal/components/terminal-feed.tsx` — how the feed fetches and renders events, current query filters
4. `src/app/(dashboard)/terminal/components/terminal-event-card.tsx` — how cards render, where `aiBrief` and `_colorTags` are used
5. `src/app/(dashboard)/terminal/components/event-detail-expanded.tsx` — expanded view brief display
6. `scripts/terminal-scheduler-setup.sh` — current Cloud Scheduler job definitions
7. `src/lib/terminal-enrichment.ts` — just the `EnrichmentPackage` interface (for type context)

After reading, propose a plan before writing any code. The plan should cover:
- Whether Cloud Scheduler jobs need to be created/updated
- The parallelization approach in `generate-briefs/route.ts`
- Which UI components need changes for graceful degradation
- Any edge cases around the rate-limit handling in parallel mode
