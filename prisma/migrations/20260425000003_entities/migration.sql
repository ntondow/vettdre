-- Phase 1, Migration 03: canonical entities table
-- Every owner ever seen — humans, LLCs, corps, trusts, nonprofits, estates.

CREATE TABLE condo_ownership.entities (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            TEXT NOT NULL,
    canonical_name    TEXT NOT NULL,
    name_normalized   TEXT NOT NULL,             -- via entity-resolver normalizeName()
    entity_type       TEXT NOT NULL CHECK (entity_type IN (
        'individual', 'llc', 'corp', 'trust', 'nonprofit', 'partnership', 'estate', 'unknown'
    )),
    dos_id            TEXT,                      -- NY DOS ID if matched
    fl_doc_number     TEXT,                      -- Florida Sunbiz if matched
    ein               TEXT,                      -- IRS EIN for nonprofits
    icij_node_id      TEXT,                      -- ICIJ Offshore Leaks ID if matched
    ofac_sdn_id       TEXT,                      -- OFAC sanctions match ID
    primary_address   TEXT,
    mailing_addresses TEXT[],                    -- all known mailing addresses across documents
    phone             TEXT,
    email             TEXT,
    metadata          JSONB,                     -- extensible: officers, members, dates, raw source data
    confidence        NUMERIC NOT NULL DEFAULT 0.5,
    sources           TEXT[] NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_org_name ON condo_ownership.entities (org_id, name_normalized);
CREATE INDEX idx_entities_org_type ON condo_ownership.entities (org_id, entity_type);
CREATE INDEX idx_entities_dos ON condo_ownership.entities (dos_id);
CREATE INDEX idx_entities_mailing ON condo_ownership.entities USING GIN (mailing_addresses);
CREATE INDEX idx_entities_name_search ON condo_ownership.entities USING GIN (to_tsvector('simple', canonical_name));
