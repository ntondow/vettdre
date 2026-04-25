-- Phase 1, Migration 06: unit_ownership_current
-- Denormalized lookup table — what the read endpoint hits for "who owns this unit?"

CREATE TABLE condo_ownership.unit_ownership_current (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  TEXT NOT NULL,
    unit_id                 UUID NOT NULL REFERENCES condo_ownership.units(id) ON DELETE CASCADE,
    building_id             UUID NOT NULL REFERENCES condo_ownership.buildings(id),
    current_owner_entity    UUID REFERENCES condo_ownership.entities(id),
    current_owner_name      TEXT,                    -- denormalized for fast search
    current_owner_type      TEXT,                    -- 'individual' | 'llc' | 'trust' | 'corp' | 'nonprofit' | 'unknown'
    last_deed_doc_id        TEXT,
    last_sale_date          DATE,
    last_sale_price         NUMERIC,
    grantor_entity          UUID REFERENCES condo_ownership.entities(id),
    grantor_name            TEXT,
    owner_mailing_address   TEXT,
    mailing_differs_from_unit BOOLEAN,               -- "out-of-building investor" badge signal
    deed_count              INT DEFAULT 0,
    primary_residence_flag  BOOLEAN,                 -- from co-op/condo tax abatement
    star_enrolled           BOOLEAN,                 -- from STAR enrollment
    last_refreshed          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, unit_id)
);

CREATE INDEX idx_ownership_org_building ON condo_ownership.unit_ownership_current (org_id, building_id);
CREATE INDEX idx_ownership_name_search ON condo_ownership.unit_ownership_current USING GIN (to_tsvector('simple', current_owner_name));
CREATE INDEX idx_ownership_owner_entity ON condo_ownership.unit_ownership_current (current_owner_entity);
CREATE INDEX idx_ownership_sale_date ON condo_ownership.unit_ownership_current (last_sale_date DESC);
