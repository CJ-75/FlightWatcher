-- Manual migration: passengers on saved_searches (Alertes)
-- Run in Supabase SQL editor. Do NOT use `npx supabase db push`.

ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS passengers INTEGER NOT NULL DEFAULT 1;

ALTER TABLE saved_searches
  DROP CONSTRAINT IF EXISTS valid_passengers;

ALTER TABLE saved_searches
  ADD CONSTRAINT valid_passengers CHECK (passengers >= 1 AND passengers <= 6);

COMMENT ON COLUMN saved_searches.passengers IS 'Adult passengers for scan / auto-check (1-6)';
