-- Phase 1, Migration 09: distress & signal tables
-- Per Deep Dive #3. Lis pendens table SKIPPED (deferred per corrected Phase 3 plan —
-- ACRIS does not contain LP/NOP/JPDN doc types; substitute distress proxy in Phase 5).

-- FFIEC Call Report bank stress metrics (Phase 3 FFIEC ingest target)
CREATE TABLE condo_ownership.lender_stress_metrics (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ffiec_id                 TEXT NOT NULL,
    fdic_cert_number         TEXT,
    bank_name_canonical      TEXT NOT NULL,
    quarter_end_date         DATE NOT NULL,
    total_assets             NUMERIC,
    real_estate_loans_pct    NUMERIC,              -- % of assets in real estate loans
    loan_loss_reserves_pct   NUMERIC,              -- % of loans in reserves
    tier_1_capital_ratio     NUMERIC,
    camels_score             TEXT,
    stress_flag              BOOLEAN NOT NULL DEFAULT FALSE,
    stress_reason            TEXT[],               -- list of triggered conditions
    raw                      JSONB,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ffiec_id, quarter_end_date)
);

CREATE INDEX idx_lender_stress_bank ON condo_ownership.lender_stress_metrics (bank_name_canonical, quarter_end_date DESC);
CREATE INDEX idx_lender_stress_flag ON condo_ownership.lender_stress_metrics (stress_flag) WHERE stress_flag = TRUE;

-- Per-building computed signals (Plays 11, 13 outputs; extensible)
CREATE TABLE condo_ownership.building_signals (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             TEXT NOT NULL,
    building_id        UUID NOT NULL REFERENCES condo_ownership.buildings(id) ON DELETE CASCADE,
    signal_type        TEXT NOT NULL,             -- 'forced_sale_candidate' | 'lender_stress_exposure' |
                                                  -- 'operator_cluster_distress' | etc.
    score              NUMERIC NOT NULL,          -- 0-100
    confidence         TEXT NOT NULL,             -- 'high' | 'medium' | 'low'
    evidence           JSONB,                     -- contributing factors
    computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, building_id, signal_type, computed_at)
);

CREATE INDEX idx_signals_org_type_score ON condo_ownership.building_signals (org_id, signal_type, score DESC);
CREATE INDEX idx_signals_building ON condo_ownership.building_signals (building_id, signal_type, computed_at DESC);

-- Unresolved-records dump for orphaned ingest rows (per non-negotiable constraint #15)
CREATE TABLE condo_ownership.unresolved_records (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table     TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    reason           TEXT NOT NULL,               -- 'no_bbl_match' | 'no_address_match' | 'invalid_payload' | etc.
    raw              JSONB NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_unresolved_source ON condo_ownership.unresolved_records (source_table, created_at DESC);
