-- Phase 1, Migration 05: ACRIS mirror tables
-- Mirrored ACRIS Master, Legals, Parties with corrected PK for parties (party_sequence).
-- Generated BBL column on legals for efficient joins.

CREATE TABLE condo_ownership.acris_master (
    document_id        TEXT PRIMARY KEY,
    record_type        TEXT,
    crfn               TEXT,
    recorded_borough   SMALLINT,
    doc_type           TEXT,
    document_date      DATE,
    document_amount    NUMERIC,
    recorded_datetime  TIMESTAMPTZ,
    modified_date      TIMESTAMPTZ,
    good_through_date  DATE,
    raw                JSONB
);

CREATE INDEX idx_acris_master_doctype_date ON condo_ownership.acris_master (doc_type, document_date DESC);
CREATE INDEX idx_acris_master_modified ON condo_ownership.acris_master (modified_date);

CREATE TABLE condo_ownership.acris_legals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         TEXT NOT NULL,
    record_type         TEXT,
    borough             SMALLINT,
    block               INT,
    lot                 INT,
    -- Generated BBL column: {boro}{block:5}{lot:4} for efficient joins
    bbl                 TEXT GENERATED ALWAYS AS (
        LPAD(borough::TEXT, 1, '0') || LPAD(block::TEXT, 5, '0') || LPAD(lot::TEXT, 4, '0')
    ) STORED,
    easement            TEXT,
    partial_lot         TEXT,
    air_rights          TEXT,
    subterranean_rights TEXT,
    property_type       TEXT,
    street_number       TEXT,
    street_name         TEXT,
    unit                TEXT,
    UNIQUE (document_id, borough, block, lot, COALESCE(unit, ''))
);

CREATE INDEX idx_acris_legals_bbl ON condo_ownership.acris_legals (bbl);
CREATE INDEX idx_acris_legals_doc ON condo_ownership.acris_legals (document_id);

CREATE TABLE condo_ownership.acris_parties (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         TEXT NOT NULL,
    party_sequence      INT NOT NULL,           -- synthetic from Socrata row order; fixes original PK collision
    party_type          SMALLINT,               -- 1 = grantor/seller, 2 = grantee/buyer
    name                TEXT,
    address_1           TEXT,
    address_2           TEXT,
    country             TEXT,
    city                TEXT,
    state               TEXT,
    zip                 TEXT,
    entity_id           UUID REFERENCES condo_ownership.entities(id),
    UNIQUE (document_id, party_type, party_sequence)
);

CREATE INDEX idx_acris_parties_doc ON condo_ownership.acris_parties (document_id);
CREATE INDEX idx_acris_parties_entity ON condo_ownership.acris_parties (entity_id);
CREATE INDEX idx_acris_parties_name ON condo_ownership.acris_parties USING GIN (to_tsvector('simple', name));
