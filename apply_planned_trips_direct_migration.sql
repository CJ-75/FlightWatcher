-- Manual migration: direct-only flag on planned_trips
-- Apply in Supabase SQL editor (do not use `supabase db push`).

ALTER TABLE planned_trips
  ADD COLUMN IF NOT EXISTS direct BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN planned_trips.direct IS
  'When true, scan prefers non-stop flights only (same as Search direct)';
