-- Activities / parcours Lot A — places, cache, trip_items, events, itineraries skeleton
-- Apply manually in Supabase SQL editor (never supabase db push).
-- Requires: my_trip_drafts, planned_trips already exist.

-- Track applied migrations (create first so this file can register itself)
CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checksum TEXT
);

CREATE EXTENSION IF NOT EXISTS postgis;

-- Permanent place registry (hotels, activities, restaurants, airports)
CREATE TABLE IF NOT EXISTS places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL
        CHECK (kind IN ('activity', 'hotel', 'restaurant', 'airport')),
    name TEXT NOT NULL,
    served_city_id UUID,
    city_slug TEXT,
    geom geography(Point, 4326),
    location_precision TEXT NOT NULL DEFAULT 'city'
        CHECK (location_precision IN ('exact', 'city')),
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_places_kind ON places(kind);
CREATE INDEX IF NOT EXISTS idx_places_city_slug ON places(city_slug);
CREATE INDEX IF NOT EXISTS idx_places_served_city ON places(served_city_id);
CREATE INDEX IF NOT EXISTS idx_places_geom ON places USING GIST (geom);

CREATE TABLE IF NOT EXISTS place_refs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    provider TEXT NOT NULL
        CHECK (provider IN ('viator', 'liteapi', 'ryanair', 'other')),
    external_id TEXT NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_place_refs_place ON place_refs(place_id);

CREATE TABLE IF NOT EXISTS provider_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    resource TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    license_class TEXT NOT NULL DEFAULT 'basic_ephemeral'
        CHECK (license_class IN ('basic_ephemeral', 'basic_weekly', 'reference')),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE (provider, resource, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_provider_cache_expires ON provider_cache(expires_at);

CREATE TABLE IF NOT EXISTS trip_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planned_trip_id UUID REFERENCES planned_trips(id) ON DELETE CASCADE,
    draft_id UUID REFERENCES my_trip_drafts(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL
        CHECK (item_type IN ('activity', 'hotel', 'restaurant')),
    place_id UUID REFERENCES places(id) ON DELETE SET NULL,
    day_offset INTEGER NOT NULL DEFAULT 0,
    moment TEXT
        CHECK (moment IS NULL OR moment IN ('morning', 'afternoon', 'evening')),
    sort_key TEXT NOT NULL DEFAULT 'a0',
    status TEXT NOT NULL DEFAULT 'idea'
        CHECK (status IN ('idea', 'validated', 'booked', 'skipped')),
    availability_state TEXT NOT NULL DEFAULT 'ok'
        CHECK (availability_state IN ('ok', 'needs_check', 'unavailable')),
    added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    booked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT trip_items_exactly_one_owner CHECK (
        (planned_trip_id IS NOT NULL) <> (draft_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_trip_items_planned ON trip_items(planned_trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_items_draft ON trip_items(draft_id);
CREATE INDEX IF NOT EXISTS idx_trip_items_place ON trip_items(place_id);
CREATE INDEX IF NOT EXISTS idx_trip_items_sort ON trip_items(planned_trip_id, day_offset, sort_key);

CREATE TABLE IF NOT EXISTS trip_item_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_item_id UUID NOT NULL REFERENCES trip_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    value TEXT NOT NULL CHECK (value IN ('up', 'down', 'accept', 'reject')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (trip_item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_item_votes_item ON trip_item_votes(trip_item_id);

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL,
    event TEXT NOT NULL,
    surface TEXT,
    platform TEXT
        CHECK (platform IS NULL OR platform IN ('web', 'ios', 'android')),
    place_id UUID REFERENCES places(id) ON DELETE SET NULL,
    trip_item_id UUID REFERENCES trip_items(id) ON DELETE SET NULL,
    draft_id UUID REFERENCES my_trip_drafts(id) ON DELETE SET NULL,
    planned_trip_id UUID REFERENCES planned_trips(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_domain_created ON events(domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_surface_created ON events(surface, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_platform_created ON events(platform, created_at DESC);

-- Parcours skeleton (logic Lot G)
CREATE TABLE IF NOT EXISTS itineraries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    city_slug TEXT,
    served_city_id UUID,
    visibility TEXT NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('private', 'link', 'public')),
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    duration_nights INTEGER,
    notes TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS itinerary_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
    place_id UUID REFERENCES places(id) ON DELETE SET NULL,
    item_type TEXT NOT NULL
        CHECK (item_type IN ('activity', 'hotel', 'restaurant')),
    day_offset INTEGER NOT NULL DEFAULT 0,
    moment TEXT
        CHECK (moment IS NULL OR moment IN ('morning', 'afternoon', 'evening')),
    sort_key TEXT NOT NULL DEFAULT 'a0',
    notes TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itinerary_items_itin ON itinerary_items(itinerary_id, day_offset, sort_key);

-- Viator destination ↔ served_city mapping (filled Lot B)
CREATE TABLE IF NOT EXISTS viator_destination_map (
    viator_destination_id TEXT PRIMARY KEY,
    served_city_id UUID,
    city_slug TEXT,
    name TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_item_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE viator_destination_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

-- Places / refs / cache / map / events / schema_migrations: service role only (no anon policies)

DROP POLICY IF EXISTS "Members read trip_items" ON trip_items;
CREATE POLICY "Members read trip_items" ON trip_items
    FOR SELECT USING (
        planned_trip_id IS NOT NULL AND (
            EXISTS (
                SELECT 1 FROM planned_trips t
                WHERE t.id = trip_items.planned_trip_id AND t.organizer_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM trip_members m
                WHERE m.trip_id = trip_items.planned_trip_id AND m.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Members write trip_items" ON trip_items;
CREATE POLICY "Members write trip_items" ON trip_items
    FOR ALL USING (
        planned_trip_id IS NOT NULL AND (
            EXISTS (
                SELECT 1 FROM planned_trips t
                WHERE t.id = trip_items.planned_trip_id AND t.organizer_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM trip_members m
                WHERE m.trip_id = trip_items.planned_trip_id AND m.user_id = auth.uid()
            )
        )
    )
    WITH CHECK (
        planned_trip_id IS NOT NULL AND (
            EXISTS (
                SELECT 1 FROM planned_trips t
                WHERE t.id = trip_items.planned_trip_id AND t.organizer_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM trip_members m
                WHERE m.trip_id = trip_items.planned_trip_id AND m.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Members manage trip_item_votes" ON trip_item_votes;
CREATE POLICY "Members manage trip_item_votes" ON trip_item_votes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM trip_items i
            JOIN planned_trips t ON t.id = i.planned_trip_id
            WHERE i.id = trip_item_votes.trip_item_id
              AND (
                  t.organizer_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM trip_members m
                      WHERE m.trip_id = t.id AND m.user_id = auth.uid()
                  )
              )
        )
    )
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners manage private itineraries" ON itineraries;
CREATE POLICY "Owners manage private itineraries" ON itineraries
    FOR ALL USING (
        owner_user_id = auth.uid() OR visibility IN ('public', 'link')
    )
    WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Read itinerary_items" ON itinerary_items;
CREATE POLICY "Read itinerary_items" ON itinerary_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM itineraries it
            WHERE it.id = itinerary_items.itinerary_id
              AND (it.owner_user_id = auth.uid() OR it.visibility IN ('public', 'link'))
        )
    );

DROP POLICY IF EXISTS "Owners write itinerary_items" ON itinerary_items;
CREATE POLICY "Owners write itinerary_items" ON itinerary_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM itineraries it
            WHERE it.id = itinerary_items.itinerary_id AND it.owner_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM itineraries it
            WHERE it.id = itinerary_items.itinerary_id AND it.owner_user_id = auth.uid()
        )
    );

INSERT INTO schema_migrations (id)
VALUES ('apply_activities_lot_a_migration.sql')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE places IS 'Lot A activities: permanent places (PostGIS)';
COMMENT ON TABLE trip_items IS 'Lot A: activity/hotel/restaurant steps; XOR planned_trip_id|draft_id';
COMMENT ON TABLE events IS 'Lot A: generic analytics with domain + platform';
