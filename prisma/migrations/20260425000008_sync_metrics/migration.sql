-- Phase 1, Migration 08: sync_metrics
-- Extends Terminal's IngestionState pattern with lag instrumentation per dataset.

CREATE TABLE condo_ownership.sync_metrics (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id          TEXT NOT NULL,
    run_started_at      TIMESTAMPTZ NOT NULL,
    run_completed_at    TIMESTAMPTZ,
    rows_fetched        INT,
    rows_upserted       INT,
    rows_failed         INT,
    lag_p50_days        NUMERIC,                  -- recording-date to fetch-date P50
    lag_p95_days        NUMERIC,
    errors              JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_metrics_dataset_time ON condo_ownership.sync_metrics (dataset_id, run_started_at DESC);
