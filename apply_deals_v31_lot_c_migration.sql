-- Deals v3.1 Lot C — live/cached verification + click price checks + runtime flags
-- Apply manually in Supabase SQL editor (never supabase db push).

ALTER TABLE deals_active
    ADD COLUMN IF NOT EXISTS verification_level TEXT NOT NULL DEFAULT 'live';
    -- live | cached

CREATE INDEX IF NOT EXISTS idx_deals_active_verification
    ON deals_active(origin_iata, verification_level, status);

CREATE TABLE IF NOT EXISTS click_price_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_key TEXT NOT NULL,
    verification_level TEXT NOT NULL DEFAULT 'live',
    displayed_pp NUMERIC(10, 2),
    checked_pp NUMERIC(10, 2),
    delta_pct NUMERIC(8, 2),
    outcome TEXT,  -- ok | higher | unavailable | unknown | user_same | user_higher | user_gone
    source TEXT DEFAULT 'deals',  -- deals | search
    draft_token TEXT,
    partner TEXT,
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_feedback_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_click_price_checks_level_time
    ON click_price_checks(verification_level, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_click_price_checks_deal
    ON click_price_checks(deal_key, clicked_at DESC);

CREATE TABLE IF NOT EXISTS deals_runtime_flags (
    flag_key TEXT PRIMARY KEY,
    flag_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason TEXT
);

COMMENT ON TABLE click_price_checks IS
  'Lot C: outbound flight click price honesty + user feedback (cached deals).';

COMMENT ON COLUMN deals_active.verification_level IS
  'live = Ryanair revalidated path; cached = Travelpayouts prices_for_dates (no %).';
