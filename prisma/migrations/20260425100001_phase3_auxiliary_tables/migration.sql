-- Phase 3: Auxiliary free-data source tables
-- Building Intelligence Overhaul

-- ── HPD Multiple Dwelling Registrations ──────────────────────
CREATE TABLE condo_ownership.hpd_registrations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  TEXT NOT NULL,
    building_id             UUID REFERENCES condo_ownership.buildings(id),
    registration_id         TEXT NOT NULL,
    bbl                     TEXT,
    borough                 SMALLINT,
    block                   INT,
    lot                     INT,
    building_name           TEXT,
    registered_owner_name   TEXT,
    registered_owner_type   TEXT,
    managing_agent_name     TEXT,
    managing_agent_address  TEXT,
    head_officer_name       TEXT,
    head_officer_address    TEXT,
    last_registration_date  DATE,
    raw                     JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, registration_id)
);

CREATE INDEX idx_hpd_reg_building ON condo_ownership.hpd_registrations (building_id);
CREATE INDEX idx_hpd_reg_bbl ON condo_ownership.hpd_registrations (bbl);
CREATE INDEX idx_hpd_reg_head_officer ON condo_ownership.hpd_registrations USING GIN (to_tsvector('simple', head_officer_name));
CREATE INDEX idx_hpd_reg_owner ON condo_ownership.hpd_registrations USING GIN (to_tsvector('simple', registered_owner_name));

-- ── DOF Property Exemptions (STAR/SCRIE/DRIE/421a/J-51) ─────
CREATE TABLE condo_ownership.property_exemptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              TEXT NOT NULL,
    building_id         UUID REFERENCES condo_ownership.buildings(id),
    unit_id             UUID REFERENCES condo_ownership.units(id),
    bbl                 TEXT NOT NULL,
    exemption_code      TEXT NOT NULL,
    exemption_type      TEXT,                       -- 'STAR', 'SCRIE', 'DRIE', '421a', 'J-51', etc.
    tax_year            INT,
    owner_name          TEXT,
    primary_residence   BOOLEAN,                    -- derived: STAR/SCRIE/DRIE = primary residence
    effective_date      DATE,
    expiration_date     DATE,
    raw                 JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, bbl, exemption_code, tax_year)
);

CREATE INDEX idx_exemptions_building ON condo_ownership.property_exemptions (building_id);
CREATE INDEX idx_exemptions_bbl ON condo_ownership.property_exemptions (bbl);
CREATE INDEX idx_exemptions_type ON condo_ownership.property_exemptions (exemption_type);

-- ── NYS Active Corporations (from n9v6-gdp6) ────────────────
CREATE TABLE condo_ownership.nys_entities (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  TEXT NOT NULL,
    dos_id                  TEXT NOT NULL,
    entity_name             TEXT NOT NULL,
    entity_name_normalized  TEXT NOT NULL,
    entity_type             TEXT,                   -- 'DOMESTIC LIMITED LIABILITY COMPANY', 'DOMESTIC BUSINESS CORPORATION', etc.
    formation_date          DATE,
    status                  TEXT,                   -- 'Active', 'Inactive', etc.
    jurisdiction            TEXT,
    process_address         TEXT,                   -- registered agent address
    principal_office_address TEXT,
    chairman_name           TEXT,                   -- corps only
    ceo_name                TEXT,
    raw                     JSONB,
    last_synced_at          TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, dos_id)
);

CREATE INDEX idx_nys_entities_name ON condo_ownership.nys_entities USING GIN (to_tsvector('simple', entity_name));
CREATE INDEX idx_nys_entities_normalized ON condo_ownership.nys_entities (entity_name_normalized);
CREATE INDEX idx_nys_entities_dos ON condo_ownership.nys_entities (dos_id);

-- ── ICIJ Offshore Leaks ──────────────────────────────────────
CREATE TABLE condo_ownership.icij_entities (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id             TEXT NOT NULL UNIQUE,
    entity_name         TEXT NOT NULL,
    name_normalized     TEXT NOT NULL,
    entity_type         TEXT,                       -- 'Entity', 'Officer', 'Intermediary', 'Address'
    jurisdiction        TEXT,
    source_leak         TEXT NOT NULL,              -- 'panama_papers', 'pandora_papers', etc.
    address             TEXT,
    officers            JSONB,                      -- related officer node IDs
    intermediaries      JSONB,                      -- related intermediary node IDs
    raw                 JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_icij_name ON condo_ownership.icij_entities USING GIN (to_tsvector('simple', entity_name));
CREATE INDEX idx_icij_normalized ON condo_ownership.icij_entities (name_normalized);
CREATE INDEX idx_icij_leak ON condo_ownership.icij_entities (source_leak);

-- ── OFAC SDN (Sanctions) ─────────────────────────────────────
CREATE TABLE condo_ownership.ofac_sdn (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sdn_id              TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    name_normalized     TEXT NOT NULL,
    aliases             JSONB,                      -- array of alternate names
    addresses           JSONB,                      -- array of known addresses
    country             TEXT,
    program             TEXT,                       -- e.g. 'RUSSIA-EO14024', 'SDGT'
    designation_date    DATE,
    entity_type         TEXT,                       -- 'Individual', 'Entity', 'Vessel', 'Aircraft'
    raw                 JSONB,
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ofac_name ON condo_ownership.ofac_sdn USING GIN (to_tsvector('simple', name));
CREATE INDEX idx_ofac_normalized ON condo_ownership.ofac_sdn (name_normalized);
CREATE INDEX idx_ofac_program ON condo_ownership.ofac_sdn (program);
