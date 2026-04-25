-- Phase 1, Migration 01: condo_ownership schema + canonical buildings table
-- Part of the Building Intelligence Overhaul (10-phase build)

CREATE SCHEMA IF NOT EXISTS condo_ownership;

-- Canonical Building spine — every NYC building resolves to exactly one row here.
-- BBL is the billing BBL (parent lot for condos, building lot for non-condos).
CREATE TABLE condo_ownership.buildings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              TEXT NOT NULL,
    bbl                 TEXT NOT NULL,
    bin                 TEXT,
    borough             SMALLINT NOT NULL,
    block               INT NOT NULL,
    lot                 INT NOT NULL,
    address             TEXT NOT NULL,
    normalized_address  TEXT NOT NULL,
    building_class      TEXT,
    property_type       TEXT,  -- 'condo' | 'coop' | 'condop' | 'rental' | 'commercial' | 'mixed' | 'unknown'
    year_built          INT,
    total_units         INT,
    residential_units   INT,
    commercial_units    INT,
    gross_sqft          INT,
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, bbl)
);

CREATE INDEX idx_buildings_org_address ON condo_ownership.buildings (org_id, normalized_address);
CREATE INDEX idx_buildings_bin ON condo_ownership.buildings (bin);
CREATE INDEX idx_buildings_org_type ON condo_ownership.buildings (org_id, property_type);
CREATE INDEX idx_buildings_borough ON condo_ownership.buildings (borough);
