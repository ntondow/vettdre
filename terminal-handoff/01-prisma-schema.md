# Terminal Handoff Prompt 1: Prisma Schema + Migration

## Goal
Add the VettdRE Terminal data models to the existing Prisma schema. The Terminal is a real-time NYC real estate intelligence feed that detects property events (sales, permits, violations, liens) from NYC Open Data, enriches them with BBL-keyed context, and generates AI intelligence briefs. This prompt handles only the database layer — no application code.

## Project
Repo: VettdRE (this repo)
File: `prisma/schema.prisma` (currently 83 models, 34 enums)

## Discovery Instructions
Before writing any code, read the following files to understand existing patterns:

1. `prisma/schema.prisma` — Understand existing model conventions: uuid PKs, `@map()` for snake_case table names, `@@index()` usage, Json fields, DateTime with `@default(now())`, relation patterns, enum definitions. Pay special attention to:
   - `BuildingCache` model (~line 2418) — the Terminal mirrors follow this pattern
   - `ScreeningEvent` model — similar event-tracking pattern
   - `User` and `Organization` models — for FK patterns and multi-tenancy via orgId
   - All existing enums at the top of the file

2. `src/lib/cache-manager.ts` — Understand the SOURCE_CONFIG registry and how BuildingCache is used (bbl + source composite key, Json data, expiresAt TTL)

3. `src/lib/data-fusion-engine.ts` (first 50 lines) — Understand the DATASETS constant object to see which dataset IDs already exist

4. `CLAUDE.md` — Full project context

**Propose your plan before writing any code.**

## Implementation Intent

### New Enums
- `PollTier` — Values: `A`, `B`, `C` (maps to 15min, 60min, 24hr polling intervals)
- `WatchType` — Values: `bbl`, `block`, `owner`, `nta`
- `TerminalEventTier` — Values: `TIER_1`, `TIER_2`, `TIER_3`

### New Models (7 total)

**TerminalEvent** — Primary event feed table. One row per detected event.
- `id` String @id @default(uuid())
- `orgId` String (FK to Organization — for multi-tenancy)
- `eventType` String (e.g., "SALE_RECORDED", "NEW_BUILDING_PERMIT", "HPD_VIOLATION_C")
- `bbl` String @db.VarChar(10)
- `borough` Int
- `ntaCode` String? (nullable — not all events have NTA mapping)
- `detectedAt` DateTime @default(now())
- `sourceDataset` String (the Socrata 4x4 dataset ID, e.g., "bnx9-e6tj")
- `sourceRecordId` String (unique record ID from source dataset)
- `enrichmentPackage` Json? (the assembled data package passed to AI)
- `aiBrief` String? @db.Text (generated brief text — nullable until AI processes it)
- `tier` Int @default(1) (1, 2, or 3)
- `metadata` Json? (flexible extra data)
- Indexes: `@@index([detectedAt(sort: Desc)])`, `@@index([bbl])`, `@@index([borough, detectedAt(sort: Desc)])`, `@@index([eventType, detectedAt(sort: Desc)])`, `@@index([sourceDataset, sourceRecordId])` (unique composite for dedup)
- `@@unique([sourceDataset, sourceRecordId])`
- `@@map("terminal_events")`

**TerminalEventCategory** — Category classification lookup (seeded, not user-created).
- `id` String @id @default(uuid())
- `eventType` String @unique
- `category` String (e.g., "Sales", "Violations", "Permits")
- `tier` Int
- `defaultEnabled` Boolean @default(true)
- `displayLabel` String
- `sortOrder` Int @default(0)
- `@@map("terminal_event_categories")`

**UserTerminalPreferences** — Per-user filter and toggle state.
- `id` String @id @default(uuid())
- `userId` String (FK to User)
- `orgId` String (FK to Organization)
- `enabledCategories` String[] (array of category strings)
- `enabledBoroughs` Int[] (array of borough codes, default all 5)
- `selectedNtas` String[] (array of NTA codes, default empty = all)
- `preferences` Json? (future expansion)
- `@@unique([userId])` (one preferences record per user)
- `@@map("user_terminal_preferences")`
- Relation: `user User @relation(fields: [userId], references: [id])`

**TerminalWatchlist** — Watchlist definitions.
- `id` String @id @default(uuid())
- `userId` String (FK to User)
- `orgId` String (FK to Organization)
- `watchType` WatchType (enum)
- `watchValue` String (the BBL, block number, owner name, or NTA code)
- `label` String? (user-friendly name)
- `notifyTiers` Int[] (which event tiers trigger alerts, default [1])
- `isActive` Boolean @default(true)
- `createdAt` DateTime @default(now())
- `@@index([userId])`
- `@@index([watchType, watchValue])`
- `@@map("terminal_watchlists")`
- Relations: alerts TerminalWatchlistAlert[]

**TerminalWatchlistAlert** — Triggered watchlist notifications.
- `id` String @id @default(uuid())
- `watchlistId` String (FK to TerminalWatchlist)
- `eventId` String (FK to TerminalEvent)
- `read` Boolean @default(false)
- `notifiedAt` DateTime @default(now())
- `@@index([watchlistId, read])`
- `@@map("terminal_watchlist_alerts")`

**DatasetRegistry** — Configuration for all monitored NYC Open Data datasets.
- `datasetId` String @id (the Socrata 4x4 ID, e.g., "bnx9-e6tj")
- `displayName` String
- `pollTier` PollTier (enum)
- `pollIntervalMinutes` Int
- `sodaEndpoint` String (full URL to the SODA API endpoint)
- `timestampField` String? (the field name used for incremental polling, e.g., ":updated_at")
- `bblFields` Json? (mapping of how to extract BBL from this dataset's records)
- `enabled` Boolean @default(true)
- `@@map("dataset_registry")`

**IngestionState** — Tracks last poll state per dataset.
- `datasetId` String @id (matches DatasetRegistry.datasetId)
- `lastCheckedAt` DateTime?
- `lastRowsUpdatedAt` BigInt? (Socrata's rowsUpdatedAt epoch)
- `lastRecordTimestamp` DateTime? (most recent record timestamp seen)
- `recordCount` Int @default(0)
- `status` String @default("idle") (idle, polling, error)
- `lastError` String? @db.Text
- `@@map("ingestion_state")`

### Relation Additions
- Add `terminalPreferences UserTerminalPreferences?` to the User model
- Add `terminalWatchlists TerminalWatchlist[]` to the User model

### Seed Data
After migration, create a seed script or migration that populates TerminalEventCategory with the 13 default categories:
- Sales (tier 1, ON), Loans (tier 1, ON), New Construction (tier 1, ON), Major Alterations (tier 1, ON), Certificates of Occupancy (tier 1, ON), Zoning (tier 1, ON), Foreclosures (tier 1, ON), Tax Liens (tier 1, ON), Violations (tier 2, ON), DOB Complaints (tier 2, OFF), Evictions (tier 2, OFF), Stalled Sites (tier 2, ON), HPD Litigation (tier 2, OFF)

## Constraints
- Follow existing schema conventions exactly (uuid PKs, @map for snake_case, @@index patterns)
- All new models need orgId where appropriate for multi-tenancy
- Use `@db.Text` for any fields that could exceed 255 chars (aiBrief, lastError)
- Do NOT add mirror tables (mirror_pluto, mirror_acris, etc.) in this prompt — those will be handled separately when we determine if they should be Prisma models or raw SQL
- Run `npx prisma generate` after schema changes to verify no errors
- Run `npx prisma migrate dev --name add_terminal_models` to create the migration
- Do NOT modify any existing models except adding the two relation fields to User
