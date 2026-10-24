-- Deals v3.1 Lot A — job run ledger (scheduler / bootstrap / baseline guard)
-- Apply manually in Supabase SQL editor (never supabase db push).

CREATE TABLE IF NOT EXISTS deals_job_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ok',  -- ok | error | skipped
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_deals_job_runs_name_finished
    ON deals_job_runs(job_name, finished_at DESC);

COMMENT ON TABLE deals_job_runs IS
  'Ledger of community deals jobs (bootstrap + scheduler). Used for baseline age guard.';
