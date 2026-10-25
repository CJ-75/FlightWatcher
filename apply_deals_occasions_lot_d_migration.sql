-- Deals v4 Occasions Lot D — LiteAPI weather cache (6h TTL)
-- Apply manually in Supabase SQL editor (never supabase db push).

CREATE TABLE IF NOT EXISTS deal_weather_cache (
    cache_key TEXT PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    days_with_temp INT NOT NULL DEFAULT 0,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_weather_cache_fetched
    ON deal_weather_cache (fetched_at DESC);

COMMENT ON TABLE deal_weather_cache IS
  'v4 Lot D: LiteAPI /data/weather responses (TTL ~6h). No Open-Meteo.';
