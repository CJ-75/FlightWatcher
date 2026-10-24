-- L9: cache on-demand hotel upsell (hors fenêtre canonique / miss rates)
-- Apply manually in Supabase SQL editor (never supabase db push).
-- TTL applicatif 3 h (expires_at).

CREATE TABLE IF NOT EXISTS hotel_upsell_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destination_id UUID NOT NULL REFERENCES deal_destinations(id) ON DELETE CASCADE,
    checkin DATE NOT NULL,
    checkout DATE NOT NULL,
    adults INTEGER NOT NULL DEFAULT 2,
    -- top-1 style: public_hotel_price, hotel_id, name, …
    offer JSONB,
    status TEXT NOT NULL DEFAULT 'pending',
    -- pending | ok | no_rates | error | unavailable
    error TEXT,
    fetched_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (destination_id, checkin, checkout, adults)
);

CREATE INDEX IF NOT EXISTS idx_hotel_upsell_cache_lookup
    ON hotel_upsell_cache(destination_id, checkin, checkout, adults);
CREATE INDEX IF NOT EXISTS idx_hotel_upsell_cache_expires
    ON hotel_upsell_cache(expires_at);

ALTER TABLE hotel_upsell_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read hotel upsell cache" ON hotel_upsell_cache;
CREATE POLICY "Anyone can read hotel upsell cache"
    ON hotel_upsell_cache FOR SELECT
    USING (true);

-- Writes: service role only
