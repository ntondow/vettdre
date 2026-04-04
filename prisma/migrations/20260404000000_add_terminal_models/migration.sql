-- Terminal: Real-Time NYC Intelligence Feed (7 models, 3 enums)

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE "PollTier" AS ENUM ('A', 'B', 'C');
CREATE TYPE "WatchType" AS ENUM ('bbl', 'block', 'owner', 'nta');

-- ── TerminalEvent ────────────────────────────────────────────

CREATE TABLE "terminal_events" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "bbl" VARCHAR(10) NOT NULL,
    "borough" INTEGER NOT NULL,
    "nta_code" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_dataset" TEXT NOT NULL,
    "source_record_id" TEXT NOT NULL,
    "enrichment_package" JSONB,
    "ai_brief" TEXT,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,

    CONSTRAINT "terminal_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "terminal_events_source_dataset_source_record_id_key" ON "terminal_events"("source_dataset", "source_record_id");
CREATE INDEX "terminal_events_detected_at_idx" ON "terminal_events"("detected_at" DESC);
CREATE INDEX "terminal_events_bbl_idx" ON "terminal_events"("bbl");
CREATE INDEX "terminal_events_borough_detected_at_idx" ON "terminal_events"("borough", "detected_at" DESC);
CREATE INDEX "terminal_events_event_type_detected_at_idx" ON "terminal_events"("event_type", "detected_at" DESC);
CREATE INDEX "terminal_events_source_dataset_source_record_id_idx" ON "terminal_events"("source_dataset", "source_record_id");

-- ── TerminalEventCategory ────────────────────────────────────

CREATE TABLE "terminal_event_categories" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "default_enabled" BOOLEAN NOT NULL DEFAULT true,
    "display_label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "terminal_event_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "terminal_event_categories_event_type_key" ON "terminal_event_categories"("event_type");

-- ── UserTerminalPreferences ──────────────────────────────────

CREATE TABLE "user_terminal_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "enabled_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled_boroughs" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "selected_ntas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferences" JSONB,

    CONSTRAINT "user_terminal_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_terminal_preferences_user_id_key" ON "user_terminal_preferences"("user_id");

-- ── TerminalWatchlist ────────────────────────────────────────

CREATE TABLE "terminal_watchlists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "watch_type" "WatchType" NOT NULL,
    "watch_value" TEXT NOT NULL,
    "label" TEXT,
    "notify_tiers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminal_watchlists_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "terminal_watchlists_user_id_idx" ON "terminal_watchlists"("user_id");
CREATE INDEX "terminal_watchlists_watch_type_watch_value_idx" ON "terminal_watchlists"("watch_type", "watch_value");

-- ── TerminalWatchlistAlert ───────────────────────────────────

CREATE TABLE "terminal_watchlist_alerts" (
    "id" TEXT NOT NULL,
    "watchlist_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "notified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminal_watchlist_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "terminal_watchlist_alerts_watchlist_id_read_idx" ON "terminal_watchlist_alerts"("watchlist_id", "read");

-- ── DatasetRegistry ──────────────────────────────────────────

CREATE TABLE "dataset_registry" (
    "dataset_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "poll_tier" "PollTier" NOT NULL,
    "poll_interval_minutes" INTEGER NOT NULL,
    "soda_endpoint" TEXT NOT NULL,
    "timestamp_field" TEXT,
    "bbl_fields" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dataset_registry_pkey" PRIMARY KEY ("dataset_id")
);

-- ── IngestionState ───────────────────────────────────────────

CREATE TABLE "ingestion_state" (
    "dataset_id" TEXT NOT NULL,
    "last_checked_at" TIMESTAMP(3),
    "last_rows_updated_at" BIGINT,
    "last_record_timestamp" TIMESTAMP(3),
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "last_error" TEXT,

    CONSTRAINT "ingestion_state_pkey" PRIMARY KEY ("dataset_id")
);

-- ── Foreign Keys ─────────────────────────────────────────────

ALTER TABLE "terminal_events" ADD CONSTRAINT "terminal_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_terminal_preferences" ADD CONSTRAINT "user_terminal_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_terminal_preferences" ADD CONSTRAINT "user_terminal_preferences_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "terminal_watchlists" ADD CONSTRAINT "terminal_watchlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "terminal_watchlists" ADD CONSTRAINT "terminal_watchlists_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "terminal_watchlist_alerts" ADD CONSTRAINT "terminal_watchlist_alerts_watchlist_id_fkey" FOREIGN KEY ("watchlist_id") REFERENCES "terminal_watchlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "terminal_watchlist_alerts" ADD CONSTRAINT "terminal_watchlist_alerts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "terminal_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Seed: Default Event Categories ───────────────────────────

INSERT INTO "terminal_event_categories" ("id", "event_type", "category", "tier", "default_enabled", "display_label", "sort_order") VALUES
  (gen_random_uuid(), 'SALE_RECORDED',         'Sales',              1, true,  'Sales',                  1),
  (gen_random_uuid(), 'LOAN_RECORDED',          'Loans',              1, true,  'Loans',                  2),
  (gen_random_uuid(), 'NEW_BUILDING_PERMIT',    'Permits',            1, true,  'New Construction',       3),
  (gen_random_uuid(), 'MAJOR_ALTERATION',       'Permits',            1, true,  'Major Alterations',      4),
  (gen_random_uuid(), 'CERTIFICATE_OF_OCCUPANCY','Permits',           1, true,  'Certificates of Occupancy', 5),
  (gen_random_uuid(), 'ZONING_CHANGE',          'Zoning',             1, true,  'Zoning',                 6),
  (gen_random_uuid(), 'FORECLOSURE_FILED',      'Foreclosures',       1, true,  'Foreclosures',           7),
  (gen_random_uuid(), 'TAX_LIEN_SOLD',          'Tax Liens',          1, true,  'Tax Liens',              8),
  (gen_random_uuid(), 'HPD_VIOLATION',          'Violations',         2, true,  'Violations',             9),
  (gen_random_uuid(), 'DOB_COMPLAINT',          'Complaints',         2, false, 'DOB Complaints',         10),
  (gen_random_uuid(), 'EVICTION_FILING',        'Evictions',          2, false, 'Evictions',              11),
  (gen_random_uuid(), 'STALLED_SITE',           'Stalled Sites',      2, true,  'Stalled Sites',          12),
  (gen_random_uuid(), 'HPD_LITIGATION',         'Litigation',         2, false, 'HPD Litigation',         13);
