-- L8: calendrier « meilleur week-end » (min-rates batch, TTL 12 h)
-- Apply manually in Supabase SQL editor (never supabase db push).

CREATE TABLE IF NOT EXISTS deal_calendar_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destination_id UUID NOT NULL REFERENCES deal_destinations(id) ON DELETE CASCADE,
    origin_iata TEXT NOT NULL,
    adults INTEGER NOT NULL DEFAULT 2,
    window_kind TEXT NOT NULL DEFAULT 'FRI_SUN',
    -- [{window_id, checkin, checkout, hotel_min_public, hotel_id, flight_pp, price_pp, status}]
    cells JSONB NOT NULL DEFAULT '[]'::jsonb,
    weekends_requested INTEGER,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'ok',  -- ok | partial | empty | error
    UNIQUE (destination_id, origin_iata, adults, window_kind)
);

CREATE INDEX IF NOT EXISTS idx_deal_calendar_cache_lookup
    ON deal_calendar_cache(destination_id, origin_iata, adults, window_kind);
CREATE INDEX IF NOT EXISTS idx_deal_calendar_cache_expires
    ON deal_calendar_cache(expires_at);

ALTER TABLE deal_calendar_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read deal calendar cache" ON deal_calendar_cache;
CREATE POLICY "Anyone can read deal calendar cache"
    ON deal_calendar_cache FOR SELECT
    USING (true);

-- Writes: service role only
