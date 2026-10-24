-- Deals v3 community (D0–D4 foundations)
-- Apply manually in Supabase SQL editor (never supabase db push).

-- ============================================
-- 1. Served cities + airport → city mapping (L12 / D0)
-- ============================================
CREATE TABLE IF NOT EXISTS served_cities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    city_name TEXT NOT NULL,
    country_code TEXT NOT NULL DEFAULT '',
    center_lat DOUBLE PRECISION,
    center_lng DOUBLE PRECISION,
    timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
    primary_iata TEXT,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_served_cities_verified
    ON served_cities(verified, city_name);

CREATE TABLE IF NOT EXISTS airport_city_mapping (
    iata TEXT PRIMARY KEY,
    served_city_id UUID NOT NULL REFERENCES served_cities(id) ON DELETE CASCADE,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_airport_city_mapping_city
    ON airport_city_mapping(served_city_id);

-- ============================================
-- 2. Price observations (D1) — no user_id
-- ============================================
CREATE TABLE IF NOT EXISTS price_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source TEXT NOT NULL,  -- organic_search | planner | seed_batch | revalidation
    origin_iata TEXT NOT NULL,
    dest_iata TEXT NOT NULL,
    served_city_id UUID REFERENCES served_cities(id) ON DELETE SET NULL,
    out_date DATE NOT NULL,
    ret_date DATE NOT NULL,
    nights INTEGER NOT NULL DEFAULT 1,
    trip_type TEXT NOT NULL DEFAULT 'OTHER',  -- WEEKEND | SHORT | WEEK | OTHER
    out_dep_local TEXT,
    out_arr_local TEXT,
    ret_dep_local TEXT,
    price_pp_eur NUMERIC(10, 2) NOT NULL,
    direct BOOLEAN NOT NULL DEFAULT true,
    carrier TEXT,
    provider TEXT,
    booking_url TEXT,
    search_fingerprint TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_price_obs_route_time
    ON price_observations(origin_iata, dest_iata, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_obs_city_time
    ON price_observations(served_city_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_obs_source_time
    ON price_observations(source, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_obs_fingerprint
    ON price_observations(search_fingerprint, observed_at DESC);

COMMENT ON TABLE price_observations IS
  'Market price samples from scans. No user_id. Fingerprint is salted daily hash only.';

-- ============================================
-- 3. Route price baselines (D3)
-- ============================================
CREATE TABLE IF NOT EXISTS route_price_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_iata TEXT NOT NULL,
    served_city_id UUID NOT NULL REFERENCES served_cities(id) ON DELETE CASCADE,
    trip_type TEXT NOT NULL,
    horizon_bucket TEXT NOT NULL,  -- le14 | d15_45 | d46_120
    p20 NUMERIC(10, 2),
    median NUMERIC(10, 2),
    p80 NUMERIC(10, 2),
    n_obs INTEGER NOT NULL DEFAULT 0,
    n_distinct_dates INTEGER NOT NULL DEFAULT 0,
    baseline_kind TEXT NOT NULL DEFAULT 'observed',  -- observed | estimated
    expected_pp_eur NUMERIC(10, 2),
    reliable BOOLEAN NOT NULL DEFAULT false,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (origin_iata, served_city_id, trip_type, horizon_bucket)
);

CREATE INDEX IF NOT EXISTS idx_route_baselines_origin
    ON route_price_baselines(origin_iata, reliable);

-- ============================================
-- 4. Active community deals (D4)
-- ============================================
CREATE TABLE IF NOT EXISTS deals_active (
    deal_key TEXT PRIMARY KEY,
    origin_iata TEXT NOT NULL,
    served_city_id UUID NOT NULL REFERENCES served_cities(id) ON DELETE CASCADE,
    dest_iata TEXT NOT NULL,
    out_date DATE NOT NULL,
    ret_date DATE NOT NULL,
    nights INTEGER NOT NULL DEFAULT 2,
    trip_type TEXT NOT NULL DEFAULT 'WEEKEND',
    flight_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    baseline_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    hotel_top3 JSONB,
    deal_score NUMERIC(8, 4) NOT NULL DEFAULT 0,
    discount_pct NUMERIC(6, 2),
    source_mix TEXT NOT NULL DEFAULT 'organic',  -- organic | seed | mixed
    status TEXT NOT NULL DEFAULT 'active',  -- active | expired | stale
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deals_active_origin_status
    ON deals_active(origin_iata, status, deal_score DESC);

CREATE INDEX IF NOT EXISTS idx_deals_active_city
    ON deals_active(served_city_id, status);

CREATE INDEX IF NOT EXISTS idx_deals_active_verified
    ON deals_active(last_verified_at);

-- ============================================
-- 5. Seed catalog (D2)
-- ============================================
CREATE TABLE IF NOT EXISTS seed_catalog_cities (
    served_city_id UUID PRIMARY KEY REFERENCES served_cities(id) ON DELETE CASCADE,
    seed_rank NUMERIC(8, 4) NOT NULL DEFAULT 0,
    n_origins_fr INTEGER NOT NULL DEFAULT 0,
    hotel_supply INTEGER NOT NULL DEFAULT 0,
    pinned BOOLEAN NOT NULL DEFAULT false,
    excluded BOOLEAN NOT NULL DEFAULT false,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 6. Anonymous « Mon voyage » drafts (D6)
-- ============================================
CREATE TABLE IF NOT EXISTS my_trip_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_token TEXT NOT NULL UNIQUE,
    user_id UUID,  -- null while anonymous
    status TEXT NOT NULL DEFAULT 'draft',  -- draft | active | archived
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    deal_key TEXT,
    origin_iata TEXT,
    dest_iata TEXT,
    city_name TEXT,
    out_date DATE,
    ret_date DATE,
    adults INTEGER NOT NULL DEFAULT 2,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_my_trip_drafts_token
    ON my_trip_drafts(draft_token);

CREATE INDEX IF NOT EXISTS idx_my_trip_drafts_user
    ON my_trip_drafts(user_id, status);

CREATE INDEX IF NOT EXISTS idx_my_trip_drafts_expires
    ON my_trip_drafts(expires_at)
    WHERE status = 'draft';

COMMENT ON TABLE my_trip_drafts IS
  'Anonymous booking-oriented trip drafts from Deals. Auto-archive via expires_at.';
