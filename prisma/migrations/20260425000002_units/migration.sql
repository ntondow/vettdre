-- Phase 1, Migration 02: units table
-- Handles BOTH condo (BBL-keyed) and co-op (share-block-keyed) via subject_type discriminator.

CREATE TABLE condo_ownership.units (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            TEXT NOT NULL,
    building_id       UUID NOT NULL REFERENCES condo_ownership.buildings(id) ON DELETE CASCADE,
    subject_type      TEXT NOT NULL CHECK (subject_type IN ('condo_bbl', 'coop_share_block')),
    unit_bbl          TEXT,                     -- populated for condo units (from eguu-7ie3)
    share_block_id    TEXT,                     -- populated for co-op share blocks (synthetic id)
    unit_number       TEXT,                     -- apartment number from eguu-7ie3 unit_designation or RPTT filing
    bedrooms          INT,                      -- v2: populated by AG offering plans + DOB ALT-1 OCR
    bathrooms         NUMERIC,
    sqft              INT,
    last_refreshed    TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique indexes: each subject type has its own uniqueness constraint
CREATE UNIQUE INDEX idx_units_condo_bbl ON condo_ownership.units (org_id, unit_bbl)
    WHERE unit_bbl IS NOT NULL;
CREATE UNIQUE INDEX idx_units_coop_share ON condo_ownership.units (org_id, building_id, share_block_id)
    WHERE share_block_id IS NOT NULL;

CREATE INDEX idx_units_building ON condo_ownership.units (building_id);
CREATE INDEX idx_units_org_bbl ON condo_ownership.units (org_id, unit_bbl);
