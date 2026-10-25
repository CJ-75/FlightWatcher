-- Deals v4 Occasions Lot B — tags written at materialize
-- Apply manually in Supabase SQL editor (never supabase db push).

ALTER TABLE deals_active
    ADD COLUMN IF NOT EXISTS occasion_tags TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS occasion_badge TEXT;

CREATE INDEX IF NOT EXISTS idx_deals_active_occasion_tags
    ON deals_active USING GIN (occasion_tags);

COMMENT ON COLUMN deals_active.occasion_tags IS
  'v4 occasions: all matching slugs (computed at materialize).';
COMMENT ON COLUMN deals_active.occasion_badge IS
  'v4 occasions: single highest-priority slug for card badge (null if discount badge wins in UI).';
