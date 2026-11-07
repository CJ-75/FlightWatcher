-- Organic destinations ledger — completed progressively via user searches.
-- Seeded/top destinations stay in DESTINATIONS_SEED; this table tracks
-- on-demand (2-phase) destinations outside the curated catalogue.
-- Apply manually in Supabase SQL editor (never supabase db push).

CREATE TABLE IF NOT EXISTS organic_destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    iata_arrival TEXT NOT NULL,
    slug TEXT,
    city_name TEXT NOT NULL DEFAULT '',
    country_code TEXT NOT NULL DEFAULT '',
    destination_id UUID REFERENCES deal_destinations(id) ON DELETE SET NULL,
    served_city_id UUID REFERENCES served_cities(id) ON DELETE SET NULL,
    -- pending: row seen, no dest yet
    -- created: deal_destinations inserted (coords may still be null)
    -- partial: dest exists but missing center and/or hotel_pool
    -- ready: center + pool present
    -- failed: last bootstrap/lookup failed (retry on next search)
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'created', 'partial', 'ready', 'failed')),
    has_center BOOLEAN NOT NULL DEFAULT false,
    pool_size INTEGER NOT NULL DEFAULT 0,
    search_hits INTEGER NOT NULL DEFAULT 0,
    last_searched_at TIMESTAMPTZ,
    last_bootstrap_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_organic_destinations_iata UNIQUE (iata_arrival)
);

CREATE INDEX IF NOT EXISTS idx_organic_destinations_status
    ON organic_destinations(status, search_hits DESC);

CREATE INDEX IF NOT EXISTS idx_organic_destinations_incomplete
    ON organic_destinations(search_hits DESC, last_searched_at DESC)
    WHERE status IN ('pending', 'created', 'partial', 'failed');

CREATE INDEX IF NOT EXISTS idx_organic_destinations_destination
    ON organic_destinations(destination_id)
    WHERE destination_id IS NOT NULL;

COMMENT ON TABLE organic_destinations IS
  'On-demand destinations discovered via user hotel upsell/search. '
  'Phase 1 creates deal_destinations without centre; phase 2 fills coords+pool. '
  'Each user search increments search_hits and retries completion.';

-- Optional marker on deal_destinations (seed vs organic insert path)
ALTER TABLE deal_destinations
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'seed';

ALTER TABLE deal_destinations
    DROP CONSTRAINT IF EXISTS deal_destinations_source_check;

ALTER TABLE deal_destinations
    ADD CONSTRAINT deal_destinations_source_check
    CHECK (source IN ('seed', 'organic'));

UPDATE deal_destinations
SET source = 'organic'
WHERE source = 'seed'
  AND priority >= 900;

COMMENT ON COLUMN deal_destinations.source IS
  'seed = curated catalogue; organic = created on-demand from user search (2-phase).';
