-- LiteAPI Deals (vol + hôtel) — schema L1
-- Apply manually in Supabase SQL editor (never supabase db push).

-- ============================================
-- 1. Catalogue destinations curaté
-- ============================================
CREATE TABLE IF NOT EXISTS deal_destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    city_name TEXT NOT NULL,
    country_code TEXT NOT NULL,
    iata_arrival TEXT NOT NULL,
    center_lat DOUBLE PRECISION NOT NULL,
    center_lng DOUBLE PRECISION NOT NULL,
    pool_radius_m INTEGER NOT NULL DEFAULT 2000,
    timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
    active BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_destinations_active
    ON deal_destinations(active, priority);

-- ============================================
-- 2. Pool d'hôtels curaté par destination
-- ============================================
CREATE TABLE IF NOT EXISTS hotel_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destination_id UUID NOT NULL REFERENCES deal_destinations(id) ON DELETE CASCADE,
    hotel_id TEXT NOT NULL,
    name TEXT,
    stars NUMERIC(3, 1),
    rating NUMERIC(4, 2),
    rating_scale NUMERIC(4, 1) DEFAULT 10,
    review_count INTEGER DEFAULT 0,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    distance_m INTEGER,
    hotel_type TEXT,
    has_24h_reception BOOLEAN DEFAULT false,
    main_photo TEXT,
    thumbnail TEXT,
    address TEXT,
    raw JSONB,
    pool_rank INTEGER DEFAULT 0,
    refreshed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (destination_id, hotel_id)
);

CREATE INDEX IF NOT EXISTS idx_hotel_pool_dest_rank
    ON hotel_pool(destination_id, pool_rank);

-- ============================================
-- 3. Fenêtres canoniques (week-ends)
-- ============================================
CREATE TABLE IF NOT EXISTS deal_windows (
    id TEXT PRIMARY KEY,              -- ex. 2026-W42-FRI_SUN
    kind TEXT NOT NULL,               -- FRI_SUN | SAT_MON
    checkin DATE NOT NULL,
    checkout DATE NOT NULL,
    nights INTEGER NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (kind, checkin, checkout)
);

CREATE INDEX IF NOT EXISTS idx_deal_windows_checkin
    ON deal_windows(checkin);

-- ============================================
-- 4. Cache tarifs hôtels (jointure à la lecture)
-- ============================================
CREATE TABLE IF NOT EXISTS hotel_rates_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destination_id UUID NOT NULL REFERENCES deal_destinations(id) ON DELETE CASCADE,
    window_id TEXT NOT NULL REFERENCES deal_windows(id) ON DELETE CASCADE,
    checkin DATE NOT NULL,
    checkout DATE NOT NULL,
    adults INTEGER NOT NULL DEFAULT 2,
    top JSONB NOT NULL DEFAULT '[]'::jsonb,
    pool_size_requested INTEGER,
    hotels_returned INTEGER,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'ok',  -- ok | no_rates | timeout | error | skipped_no_flight
    UNIQUE (destination_id, window_id, adults)
);

CREATE INDEX IF NOT EXISTS idx_hotel_rates_cache_expires
    ON hotel_rates_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_hotel_rates_cache_dest
    ON hotel_rates_cache(destination_id, adults);

-- ============================================
-- 5. Projection cache vols pour deals
--    (indépendant de search_results_cache)
-- ============================================
CREATE TABLE IF NOT EXISTS deal_flight_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_iata TEXT NOT NULL,
    destination_id UUID NOT NULL REFERENCES deal_destinations(id) ON DELETE CASCADE,
    iata_arrival TEXT NOT NULL,
    window_id TEXT NOT NULL REFERENCES deal_windows(id) ON DELETE CASCADE,
    checkin DATE NOT NULL,
    checkout DATE NOT NULL,
    -- best A/R under budget for this origin×dest×window
    flight JSONB,                     -- null if none
    price_pp NUMERIC(10, 2),
    direct BOOLEAN,
    late_arrival BOOLEAN DEFAULT false,
    late_departure BOOLEAN DEFAULT false,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'ok', -- ok | no_flight | error
    UNIQUE (origin_iata, destination_id, window_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_flight_cache_lookup
    ON deal_flight_cache(destination_id, window_id, origin_iata);
CREATE INDEX IF NOT EXISTS idx_deal_flight_cache_expires
    ON deal_flight_cache(expires_at);

-- ============================================
-- 6. Réservations hôtel in-app
-- ============================================
CREATE TABLE IF NOT EXISTS hotel_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    deal_key TEXT,
    deal_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    hotel_id TEXT,
    offer_id TEXT,
    prebook_id TEXT,
    transaction_id TEXT,
    displayed_price NUMERIC(10, 2),
    charged_price NUMERIC(10, 2),
    margin_pct_used NUMERIC(6, 2),
    ssp_at_booking NUMERIC(10, 2),
    status TEXT NOT NULL DEFAULT 'draft',
    -- draft | prebooked | payment_pending | payment_succeeded |
    -- booking_pending | confirmed | failed | cancelled
    liteapi_booking_id TEXT,
    confirmation_code TEXT,
    raw_prebook JSONB,
    raw_book JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_bookings_user
    ON hotel_bookings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotel_bookings_prebook
    ON hotel_bookings(prebook_id);

-- ============================================
-- 7. Alertes prix deals likés (phase 2 / L10)
-- ============================================
CREATE TABLE IF NOT EXISTS deal_price_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    deal_key TEXT NOT NULL,
    last_price_pp NUMERIC(10, 2),
    threshold_pct NUMERIC(5, 2) NOT NULL DEFAULT 8.0,
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, deal_key)
);

CREATE INDEX IF NOT EXISTS idx_deal_price_alerts_user
    ON deal_price_alerts(user_id);

-- ============================================
-- 8. liked_deals : deal_key stable
-- ============================================
ALTER TABLE liked_deals
    ADD COLUMN IF NOT EXISTS deal_key TEXT;

CREATE INDEX IF NOT EXISTS idx_liked_deals_deal_key
    ON liked_deals(deal_key);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE deal_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_rates_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_flight_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_price_alerts ENABLE ROW LEVEL SECURITY;

-- Public read for catalogue / caches (assembled deals are public offers)
DROP POLICY IF EXISTS "Anyone can read deal destinations" ON deal_destinations;
CREATE POLICY "Anyone can read deal destinations"
    ON deal_destinations FOR SELECT
    USING (active = true);

DROP POLICY IF EXISTS "Anyone can read hotel pool" ON hotel_pool;
CREATE POLICY "Anyone can read hotel pool"
    ON hotel_pool FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Anyone can read deal windows" ON deal_windows;
CREATE POLICY "Anyone can read deal windows"
    ON deal_windows FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Anyone can read hotel rates cache" ON hotel_rates_cache;
CREATE POLICY "Anyone can read hotel rates cache"
    ON hotel_rates_cache FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Anyone can read deal flight cache" ON deal_flight_cache;
CREATE POLICY "Anyone can read deal flight cache"
    ON deal_flight_cache FOR SELECT
    USING (true);

-- Bookings: owner only
DROP POLICY IF EXISTS "Users see own hotel bookings" ON hotel_bookings;
CREATE POLICY "Users see own hotel bookings"
    ON hotel_bookings FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own hotel bookings" ON hotel_bookings;
CREATE POLICY "Users insert own hotel bookings"
    ON hotel_bookings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own hotel bookings" ON hotel_bookings;
CREATE POLICY "Users update own hotel bookings"
    ON hotel_bookings FOR UPDATE
    USING (auth.uid() = user_id);

-- Price alerts: owner only
DROP POLICY IF EXISTS "Users see own deal price alerts" ON deal_price_alerts;
CREATE POLICY "Users see own deal price alerts"
    ON deal_price_alerts FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own deal price alerts" ON deal_price_alerts;
CREATE POLICY "Users manage own deal price alerts"
    ON deal_price_alerts FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Writes to catalogue / caches: service role only (no anon policies for INSERT/UPDATE)
