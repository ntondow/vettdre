# Terminal Handoff Prompt 9: CLAUDE.md Update + Ingestion Health Admin Page

## Goal
Two things in one prompt: (1) Add the Terminal feature to CLAUDE.md so all future Claude Code sessions understand the new subsystem — its architecture, files, conventions, and dependencies. (2) Build an admin-facing ingestion health dashboard at `/settings/admin/terminal` that shows pipeline status, per-dataset stats, error rates, and manual trigger buttons. Operators need visibility into whether the 3-stage pipeline (ingest → enrich → brief) is running correctly.

## Project
Repo: VettdRE (this repo)
Files to modify:
- `CLAUDE.md` (add Terminal section)

Files to create:
- `src/app/(dashboard)/settings/admin/terminal/page.tsx` (new — admin page)
- `src/app/(dashboard)/settings/admin/terminal/actions.ts` (new — server actions)
- `src/app/(dashboard)/settings/admin/terminal/components/health-dashboard.tsx` (new — client component)

## Discovery Instructions
Before writing any code, read the following files:

1. `CLAUDE.md` — Read the full file. Understand the structure: overview, tech stack, env vars, project structure, feature details, deployment, conventions. You'll be adding a new "### Terminal (Working)" section under Feature Details and updating the project structure.

2. `src/app/(dashboard)/settings/admin/users/page.tsx` — Study the admin page pattern. Note:
   - How `requireAdmin()` or equivalent role check is done
   - The page layout and styling conventions
   - How server actions are called

3. `src/app/(dashboard)/settings/admin/teams/page.tsx` — Another admin page pattern. Note the CRUD patterns and data tables.

4. `src/lib/terminal-ingestion.ts` — Understand the ingestion engine: `pollDataset()`, `IngestionResult` return type, how errors are tracked.

5. `src/lib/terminal-enrichment.ts` — Understand `enrichTerminalEvents()` return signature — it returns counts of processed/failed.

6. `src/lib/terminal-ai.ts` — Understand `generateTerminalBriefs()` return signature.

7. `src/lib/terminal-datasets.ts` — The dataset configurations. Get the full list of dataset keys and their display labels.

8. `prisma/schema.prisma` — Find the IngestionState model. It has: `datasetId` (PK), `lastCheckedAt`, `lastRecordTimestamp`, `lastRowsUpdatedAt` (BigInt), `recordCount`, `status`, `lastError`.

9. `src/app/api/terminal/ingest/route.ts` — See how the cron endpoint works, how it iterates datasets, how it updates IngestionState.

10. `src/app/(dashboard)/settings/admin/admin-actions.ts` — See `requireAdmin()` pattern for admin-only pages. This is the correct location — it checks `super_admin` role and redirects to `/settings` if not authorized.

**Propose your plan before writing any code.**

## Implementation Intent

### Part 1: CLAUDE.md Terminal Section

Add a new section under "## Feature Details" titled "### Terminal — Working". Include:

**Routes:** `/terminal` (main feed), `/api/terminal/ingest`, `/api/terminal/enrich`, `/api/terminal/generate-briefs`, `/api/terminal/backfill`, `/settings/admin/terminal` (health dashboard)

**Architecture summary:** 3-stage pipeline (Ingestion → Enrichment → AI Brief Generation) running on staggered 15-minute Cloud Scheduler crons. BBL is the universal join key. Events flow through TerminalEvent records with progressive enrichment.

**Key files:**
- `lib/terminal-datasets.ts` — 7 dataset configs (ACRIS sales, DOB permits, HPD violations, HPD complaints, ECB violations, foreclosure lis pendens, rent stabilization changes)
- `lib/terminal-ingestion.ts` — Two-phase SODA polling (metadata check → incremental fetch)
- `lib/terminal-enrichment.ts` — Reuses data-fusion-engine for BBL-keyed assembly
- `lib/terminal-ai.ts` — Bloomberg-voice brief generation via Claude claude-sonnet-4-5-20250514
- `lib/terminal-prompts.ts` — System prompts and event-type fragments
- `app/(dashboard)/terminal/page.tsx` — Server component entry point
- `app/(dashboard)/terminal/actions.ts` — 7 server actions
- `app/(dashboard)/terminal/components/terminal-feed.tsx` — Three-panel dark Bloomberg UI
- `app/(dashboard)/terminal/components/terminal-event-card.tsx` — Event card with color tags

**DB models:** TerminalEvent, TerminalEventCategory, UserTerminalPreferences, TerminalWatchlist, TerminalWatchlistAlert, DatasetRegistry, IngestionState

**Conventions:**
- Terminal dark theme is scoped (CSS custom properties on container div) — does NOT affect app shell
- Borough filter: 1=Manhattan, 2=Bronx, 3=Brooklyn, 4=Queens, 5=Staten Island
- All cron endpoints use `Bearer ${CRON_SECRET}` auth
- Feature gates: `nav_terminal`, `terminal_access`, `terminal_ai_brief`
- Brief generation uses `claude-sonnet-4-5-20250514`, temperature 0

Also update the Project Structure tree to include `terminal/` under `(dashboard)/`.

Also add to the "Pending / Incomplete Features" table:
- Terminal: **Working (Phase 1 MVP)** — Pipeline + UI complete, Phase 2: watchlists, Realtime, search

Also add to "Recent Changes" section with the current date.

### Part 2: Ingestion Health Dashboard

#### Admin Page (`settings/admin/terminal/page.tsx`)

Server component that:
1. Checks admin role (reuse `requireAdmin()` or equivalent pattern from other admin pages)
2. Fetches all IngestionState records
3. Fetches aggregate stats: total events by dataset, events in last 24h, events pending enrichment, events pending briefs
4. Passes to client component

#### Server Actions (`settings/admin/terminal/actions.ts`)

```typescript
"use server"

// Get pipeline health overview
async function getIngestionHealth(): Promise<{
  datasets: Array<{
    datasetId: string
    label: string
    lastCheckedAt: Date | null
    lastRecordTimestamp: Date | null
    recordCount: number
    status: string          // "idle", "running", "error" — from IngestionState.status
    lastError: string | null
    eventsLast24h: number
    pendingEnrichment: number
    pendingBriefs: number
  }>
  totals: {
    totalEvents: number
    eventsLast24h: number
    pendingEnrichment: number
    pendingBriefs: number
    datasetsHealthy: number
    datasetsErroring: number
  }
}>

// Manually trigger a pipeline stage (for debugging)
async function triggerPipelineStage(stage: 'ingest' | 'enrich' | 'briefs'): Promise<{
  success: boolean
  message: string
  duration: number
}>

// Reset error count for a dataset (after fixing the issue)
async function resetDatasetErrors(datasetKey: string): Promise<void>

// Get recent events for a specific dataset (for debugging)
async function getRecentDatasetEvents(datasetKey: string, limit?: number): Promise<Array<{
  id: string
  bbl: string
  eventType: string
  detectedAt: Date
  hasEnrichment: boolean
  hasBrief: boolean
}>>
```

#### Health Dashboard Component (`components/health-dashboard.tsx`)

"use client" component with:

**Summary Cards (top row):**
- Total Events (all time)
- Events Last 24h (with trend arrow if possible)
- Pending Enrichment (count of events with null enrichmentPackage)
- Pending Briefs (count of events with null aiBrief)
- Pipeline Health (X/Y datasets healthy — healthy = consecutiveErrors < 3 and lastPollAt within 30 minutes)

**Dataset Table:**
| Dataset | Last Poll | Events (24h) | Total | Errors | Status | Actions |
|---------|-----------|-------------|-------|--------|--------|---------|
| ACRIS Sales | 2m ago | 12 | 1,234 | 0 | ✅ Healthy | [Details] |
| DOB Permits | 2m ago | 45 | 3,456 | 0 | ✅ Healthy | [Details] |
| HPD Violations | 17m ago | 8 | 890 | 3 | ⚠️ Erroring | [Reset] [Details] |

Status logic:
- ✅ Healthy: status === "idle" AND lastCheckedAt within 30 min AND lastError is null
- ⚠️ Warning: status === "error" OR lastError is not null
- 🔴 Failed: status === "error" AND lastCheckedAt older than 30 min
- ⏸ Stale: lastCheckedAt older than 30 min AND status === "idle" (scheduler might not be running)

**Manual Trigger Buttons:**
Row of 3 buttons: "Run Ingestion", "Run Enrichment", "Run Brief Generation"
- Each shows a loading spinner while running
- Shows success/error toast with duration
- These call the actual pipeline functions directly (same logic as cron endpoints, minus the HTTP layer)
- Protected by admin role check in the server action

**Pipeline Queue Breakdown:**
Show counts: "Events awaiting enrichment: 45 | Events awaiting AI briefs: 23 | Events fully processed: 1,892"

**Error Log:**
For datasets with consecutiveErrors > 0, show the `lastError` message in a collapsible panel. Include a "Reset Errors" button that zeroes the counter.

#### Styling
This is an admin page — use the app's normal light theme (not Terminal dark). Follow the same table/card patterns as other admin pages. Use Lucide icons: `Activity` for health, `AlertTriangle` for warnings, `CheckCircle` for healthy, `RefreshCw` for manual triggers.

#### Navigation
Add a "Terminal Health" link to the admin settings section (wherever other admin links like Users, Teams are listed). This should only be visible to super_admin users.

## Constraints
- Admin-only page: require super_admin role (same pattern as `/settings/admin/users`)
- The manual trigger buttons call the pipeline functions directly — do NOT make HTTP requests to the cron endpoints from the admin page. Import and call the functions.
- Do NOT modify the pipeline logic itself (terminal-ingestion.ts, terminal-enrichment.ts, terminal-ai.ts) — only read from IngestionState and TerminalEvent for stats
- The CLAUDE.md update should be factual and match the actual code that was written in Prompts 1-6. Read the actual files before writing the documentation.
- Keep the health dashboard simple — no charts, no time series. Just current state + counts + manual triggers.
- All server actions must validate admin role before executing
- Do NOT add new Prisma models — query existing TerminalEvent and IngestionState
- Relative timestamps (e.g., "2m ago") should use the same pattern as terminal-event-card.tsx
