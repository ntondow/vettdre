-- Phase 1, Migration 07: mortgages + tax_liens (debt structure)

CREATE TABLE condo_ownership.mortgages (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             TEXT NOT NULL,
    building_id        UUID REFERENCES condo_ownership.buildings(id),
    unit_id            UUID REFERENCES condo_ownership.units(id),
    document_id        TEXT,
    borrower_entity    UUID REFERENCES condo_ownership.entities(id),
    lender_entity      UUID REFERENCES condo_ownership.entities(id),
    amount             NUMERIC,
    recorded_date      DATE,
    maturity_date      DATE,                       -- parsed from doc when available; null otherwise
    status             TEXT,                       -- 'active', 'satisfied', 'assigned', 'unknown'
    mortgage_type      TEXT,                       -- 'first', 'second', 'cema', 'consolidated', etc.
    raw                JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mortgages_building ON condo_ownership.mortgages (building_id);
CREATE INDEX idx_mortgages_lender ON condo_ownership.mortgages (lender_entity);
CREATE INDEX idx_mortgages_maturity ON condo_ownership.mortgages (maturity_date)
    WHERE maturity_date IS NOT NULL AND status = 'active';

CREATE TABLE condo_ownership.tax_liens (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             TEXT NOT NULL,
    building_id        UUID NOT NULL REFERENCES condo_ownership.buildings(id),
    lien_type          TEXT,                       -- 'tax', 'water', 'emergency_repair', etc.
    amount             NUMERIC,
    filed_date         DATE,
    status             TEXT,                       -- 'active', 'satisfied', 'sold'
    sale_year          INT,
    cycle              TEXT,                       -- '90 Day Notice', 'Lien Sale', etc. (from Socrata 9rz4-mjek)
    raw                JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tax_liens_building_status ON condo_ownership.tax_liens (building_id, status);
