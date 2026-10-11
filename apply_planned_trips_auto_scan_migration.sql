-- Manual migration: auto price watch on planned_trips
-- Run in Supabase SQL editor. Do NOT use `npx supabase db push`.

ALTER TABLE planned_trips
  ADD COLUMN IF NOT EXISTS auto_scan_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE planned_trips
  ADD COLUMN IF NOT EXISTS auto_scan_interval_seconds INTEGER NOT NULL DEFAULT 3600;

ALTER TABLE planned_trips
  ADD COLUMN IF NOT EXISTS last_scan_at TIMESTAMPTZ;

ALTER TABLE planned_trips
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

ALTER TABLE planned_trips
  ADD COLUMN IF NOT EXISTS last_notified_cheapest NUMERIC;

ALTER TABLE planned_trips
  DROP CONSTRAINT IF EXISTS valid_auto_scan_interval;

ALTER TABLE planned_trips
  ADD CONSTRAINT valid_auto_scan_interval
  CHECK (auto_scan_interval_seconds >= 900);

CREATE INDEX IF NOT EXISTS idx_planned_trips_auto_scan
  ON planned_trips (auto_scan_enabled, status, last_scan_at)
  WHERE auto_scan_enabled = TRUE AND status = 'planning';

COMMENT ON COLUMN planned_trips.auto_scan_enabled IS 'Watch prices periodically (server cron)';
COMMENT ON COLUMN planned_trips.auto_scan_interval_seconds IS 'Min seconds between auto scans ( >= 900 )';
COMMENT ON COLUMN planned_trips.last_notified_cheapest IS 'Last per-person price emailed to travelers';
