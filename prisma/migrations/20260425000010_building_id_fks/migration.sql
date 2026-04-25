-- Phase 1, Migration 10: Add nullable building_id FK to 5 existing fragmented tables.
-- Additive only — no existing columns modified or removed.
-- Coexistence period: old code keeps working, new code writes through the spine.

-- 1. portfolios
ALTER TABLE "portfolios"
    ADD COLUMN "building_id" UUID;

-- 2. portfolio_buildings
ALTER TABLE "portfolio_buildings"
    ADD COLUMN "building_id" UUID;

-- 3. prospecting_items
ALTER TABLE "prospecting_items"
    ADD COLUMN "building_id" UUID;

-- 4. building_cache
ALTER TABLE "building_cache"
    ADD COLUMN "building_id" UUID;

-- 5. terminal_events
ALTER TABLE "terminal_events"
    ADD COLUMN "building_id" UUID;

-- Indexes for the new FK columns (for join performance)
CREATE INDEX idx_portfolio_buildings_bid ON "portfolio_buildings" ("building_id") WHERE "building_id" IS NOT NULL;
CREATE INDEX idx_prospecting_items_bid ON "prospecting_items" ("building_id") WHERE "building_id" IS NOT NULL;
CREATE INDEX idx_building_cache_bid ON "building_cache" ("building_id") WHERE "building_id" IS NOT NULL;
CREATE INDEX idx_terminal_events_bid ON "terminal_events" ("building_id") WHERE "building_id" IS NOT NULL;

-- Note: FK constraints reference the condo_ownership.buildings table which lives in a
-- separate schema. Prisma doesn't manage cross-schema FKs natively, so we add them as
-- raw SQL constraints. These are soft FKs — nullable, no cascade delete (existing data
-- won't have building_id populated until the Phase 2 migration script runs).
-- We skip adding actual REFERENCES constraints here to avoid blocking existing writes
-- to these tables before buildings are populated. The application layer enforces the
-- relationship. Phase 2's data migration script will populate these columns.
