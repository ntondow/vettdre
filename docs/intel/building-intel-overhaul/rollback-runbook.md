# Building Intelligence Overhaul — Rollback Runbook

Three rollback layers, in order of severity. Start with Layer 1 (instant, no deploy). Escalate only if needed.

---

## Layer 1 — Feature Gate Kill Switch (instant, no deploy needed for runtime effect)

Removes `condo_intel` from the PRO plan feature set. All read endpoints return 403, all UI components hide intel panels. Existing data stays in the DB but is inaccessible.

**Files to edit:** `src/lib/feature-gate.ts`

**Three lines to remove/revert:**

```diff
# Line 126: Remove from Feature union type
- | "condo_intel";
+ ;

# Line 230: Remove from PRO_FEATURES array
-   "condo_intel",

# Line 359: Remove from UPGRADE_MESSAGES
-   condo_intel: "Upgrade to Pro for unit-level ownership intelligence",
```

**Verification after deploy:** `GET /api/intel/buildings/1011577501` returns `403 Forbidden` for any user.

---

## Layer 2 — Cloud Scheduler Pause (no deploy, stops all data flow)

Pauses all 11 intel cron jobs. No new data is ingested. Existing data and UI remain intact.

```bash
# Pause all intel scheduler jobs (run from gcloud-authenticated shell):
gcloud scheduler jobs pause intel-acris-sync --location=us-east1 --project=vettdre
gcloud scheduler jobs pause intel-building-signals --location=us-east1 --project=vettdre
gcloud scheduler jobs pause intel-condo-units-refresh --location=us-east1 --project=vettdre
gcloud scheduler jobs pause intel-distress-recompute --location=us-east1 --project=vettdre
gcloud scheduler jobs pause intel-exemptions-refresh --location=us-east1 --project=vettdre
gcloud scheduler jobs pause intel-hpd-mdr-sync --location=us-east1 --project=vettdre
gcloud scheduler jobs pause intel-mortgage-sync --location=us-east1 --project=vettdre
gcloud scheduler jobs pause intel-nys-corps-sync --location=us-east1 --project=vettdre
gcloud scheduler jobs pause intel-ofac-sync --location=us-east1 --project=vettdre
gcloud scheduler jobs pause intel-resolve-edges --location=us-east1 --project=vettdre
gcloud scheduler jobs pause intel-tax-liens-sync --location=us-east1 --project=vettdre
```

**To resume later:**
```bash
# Replace 'pause' with 'resume' in each command above
gcloud scheduler jobs resume intel-acris-sync --location=us-east1 --project=vettdre
# ... etc.
```

**Verification:** `gcloud scheduler jobs list --location=us-east1 --project=vettdre` shows all intel jobs as PAUSED.

---

## Layer 3 — Migration Rollback SQL (DESTRUCTIVE — last resort only)

Drops the entire `condo_ownership` schema and removes `building_id` columns from existing tables. **All ingested data is permanently lost.**

Only use this if the schema itself is causing production issues (e.g., FK constraint blocking writes to existing tables, which shouldn't happen since FKs are soft/nullable).

### Step 1: Drop building_id columns from existing tables (reverse migration 10)

```sql
-- Run FIRST — these reference condo_ownership.buildings which will be dropped
DROP INDEX IF EXISTS idx_portfolio_buildings_bid;
DROP INDEX IF EXISTS idx_prospecting_items_bid;
DROP INDEX IF EXISTS idx_building_cache_bid;
DROP INDEX IF EXISTS idx_terminal_events_bid;

ALTER TABLE "portfolios" DROP COLUMN IF EXISTS "building_id";
ALTER TABLE "portfolio_buildings" DROP COLUMN IF EXISTS "building_id";
ALTER TABLE "prospecting_items" DROP COLUMN IF EXISTS "building_id";
ALTER TABLE "building_cache" DROP COLUMN IF EXISTS "building_id";
ALTER TABLE "terminal_events" DROP COLUMN IF EXISTS "building_id";
```

### Step 2: Drop the entire condo_ownership schema

```sql
-- CASCADE drops all 19 tables + indexes + constraints in the schema
DROP SCHEMA IF EXISTS condo_ownership CASCADE;
```

### Step 3: Drop the backfill progress table (created at runtime, not by migration)

```sql
-- This table is created by the backfill script, not a migration
-- It lives in condo_ownership schema so CASCADE above should get it,
-- but run this as safety:
DROP TABLE IF EXISTS condo_ownership.backfill_progress;
```

### Step 4: Mark migrations as rolled back in Prisma

Run in reverse chronological order (FK dependencies require this order):

```bash
npx prisma migrate resolve --rolled-back 20260425200001_phase5_mortgage_fields
npx prisma migrate resolve --rolled-back 20260425100001_phase3_auxiliary_tables
npx prisma migrate resolve --rolled-back 20260425000010_building_id_fks
npx prisma migrate resolve --rolled-back 20260425000009_distress_signals
npx prisma migrate resolve --rolled-back 20260425000008_sync_metrics
npx prisma migrate resolve --rolled-back 20260425000007_debt_structure
npx prisma migrate resolve --rolled-back 20260425000006_unit_ownership_current
npx prisma migrate resolve --rolled-back 20260425000005_acris_mirror
npx prisma migrate resolve --rolled-back 20260425000004_entity_relationships
npx prisma migrate resolve --rolled-back 20260425000003_entities
npx prisma migrate resolve --rolled-back 20260425000002_units
npx prisma migrate resolve --rolled-back 20260425000001_building_spine
```

### Step 5: Verify

```sql
-- Confirm schema is gone:
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'condo_ownership';
-- Should return 0 rows

-- Confirm building_id columns are gone:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'terminal_events' AND column_name = 'building_id';
-- Should return 0 rows
```

---

## Decision matrix

| Symptom | Layer | Action |
|---------|-------|--------|
| Intel data is wrong / misleading | 1 | Disable feature gate |
| Cron jobs consuming too many resources | 2 | Pause schedulers |
| Feature gate disabled but users still see stale data | 1+2 | Gate + pause |
| Schema causing FK constraint errors on existing tables | 3 | Full rollback |
| Need to re-approach from scratch | 1+2+3 | All three layers |
