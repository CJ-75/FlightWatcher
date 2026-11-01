-- Restaurants / « Tes adresses » Lot A — places extensions, details, user_places, link_imports
-- Apply manually in Supabase SQL editor (never supabase db push).
-- Requires: apply_activities_lot_a_migration.sql
--
-- Advisor notes:
-- - DROP CONSTRAINT / DROP POLICY below are safe (no DROP TABLE / no data wipe).
-- - schema_migrations is ledger-only; RLS on, no anon/authenticated policies → service_role only.

CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checksum TEXT
);

ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

-- Extend places: origin + visibility + created_by
ALTER TABLE places ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'other'
    CHECK (origin IN ('osm', 'overture', 'viator', 'liteapi', 'user', 'google', 'other'));
ALTER TABLE places ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private'));
ALTER TABLE places ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Relax kind check to include bar / cafe / attraction (recreate constraint)
ALTER TABLE places DROP CONSTRAINT IF EXISTS places_kind_check;
ALTER TABLE places ADD CONSTRAINT places_kind_check
    CHECK (kind IN ('activity', 'hotel', 'restaurant', 'bar', 'cafe', 'attraction', 'airport'));

CREATE INDEX IF NOT EXISTS idx_places_origin ON places(origin);
CREATE INDEX IF NOT EXISTS idx_places_visibility ON places(visibility);
CREATE INDEX IF NOT EXISTS idx_places_created_by ON places(created_by);

-- Expand place_refs providers
ALTER TABLE place_refs DROP CONSTRAINT IF EXISTS place_refs_provider_check;
ALTER TABLE place_refs ADD CONSTRAINT place_refs_provider_check
    CHECK (provider IN (
        'viator', 'liteapi', 'ryanair', 'osm', 'overture',
        'google_place_id', 'google_cid', 'other'
    ));

CREATE TABLE IF NOT EXISTS restaurant_details (
    place_id UUID PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
    cuisine TEXT,
    opening_hours_raw TEXT,
    opening_hours_norm TEXT,
    vegetarian BOOLEAN,
    vegan BOOLEAN,
    terrace BOOLEAN,
    website TEXT,
    phone TEXT,
    menu_url TEXT,
    price_range TEXT,
    facts_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    refreshed_at TIMESTAMPTZ,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS attraction_details (
    place_id UUID PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
    category TEXT,
    opening_hours_raw TEXT,
    opening_hours_norm TEXT,
    website TEXT,
    facts_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    refreshed_at TIMESTAMPTZ,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Personal addresses (Favoris → Mes adresses) and draft-scoped saves
CREATE TABLE IF NOT EXISTS user_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    draft_token TEXT,
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'to_try'
        CHECK (status IN ('to_try', 'loved', 'meh')),
    note TEXT,
    rating SMALLINT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    source_url TEXT,
    city_slug TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_places_owner CHECK (
        user_id IS NOT NULL OR (draft_token IS NOT NULL AND length(trim(draft_token)) > 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_places_user_place
    ON user_places(user_id, place_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_places_draft_place
    ON user_places(draft_token, place_id) WHERE draft_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_places_user ON user_places(user_id);
CREATE INDEX IF NOT EXISTS idx_user_places_city ON user_places(city_slug);

CREATE TABLE IF NOT EXISTS user_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Mes adresses',
    share_token TEXT UNIQUE,
    visibility TEXT NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('private', 'link')),
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
    user_place_id UUID NOT NULL REFERENCES user_places(id) ON DELETE CASCADE,
    sort_key TEXT NOT NULL DEFAULT 'a0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (list_id, user_place_id)
);

CREATE TABLE IF NOT EXISTS link_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    draft_token TEXT,
    planned_trip_id UUID REFERENCES planned_trips(id) ON DELETE SET NULL,
    source TEXT NOT NULL
        CHECK (source IN ('google_maps', 'instagram', 'tiktok', 'unknown')),
    url_clean TEXT NOT NULL,
    parse_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    place_id UUID REFERENCES places(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending', 'recognized', 'needs_clarify', 'failed', 'added'
        )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_link_imports_user ON link_imports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_imports_draft ON link_imports(draft_token);

CREATE TABLE IF NOT EXISTS place_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL DEFAULT 'closed'
        CHECK (reason IN ('closed', 'wrong', 'other')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_place_reports_place ON place_reports(place_id);

-- Private notes on trip items (kept out of places / itineraries)
CREATE TABLE IF NOT EXISTS trip_item_private_notes (
    trip_item_id UUID PRIMARY KEY REFERENCES trip_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE restaurant_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE attraction_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_item_private_notes ENABLE ROW LEVEL SECURITY;

-- Public place facts readable; private places only by creator
DROP POLICY IF EXISTS "Read public places" ON places;
CREATE POLICY "Read public places" ON places
    FOR SELECT USING (
        visibility = 'public' OR created_by = auth.uid()
    );

DROP POLICY IF EXISTS "Users manage own user_places" ON user_places;
CREATE POLICY "Users manage own user_places" ON user_places
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage own lists" ON user_lists;
CREATE POLICY "Users manage own lists" ON user_lists
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Read list items" ON user_list_items;
CREATE POLICY "Read list items" ON user_list_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_lists l
            WHERE l.id = user_list_items.list_id
              AND (l.user_id = auth.uid() OR l.visibility = 'link')
        )
    );

DROP POLICY IF EXISTS "Owners write list items" ON user_list_items;
CREATE POLICY "Owners write list items" ON user_list_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_lists l
            WHERE l.id = user_list_items.list_id AND l.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_lists l
            WHERE l.id = user_list_items.list_id AND l.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users manage own link_imports" ON link_imports;
CREATE POLICY "Users manage own link_imports" ON link_imports
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert place_reports" ON place_reports;
CREATE POLICY "Users insert place_reports" ON place_reports
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage private trip notes" ON trip_item_private_notes;
CREATE POLICY "Users manage private trip notes" ON trip_item_private_notes
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Details follow place visibility (service role for writes)
DROP POLICY IF EXISTS "Read restaurant_details" ON restaurant_details;
CREATE POLICY "Read restaurant_details" ON restaurant_details
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM places p
            WHERE p.id = restaurant_details.place_id
              AND (p.visibility = 'public' OR p.created_by = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Read attraction_details" ON attraction_details;
CREATE POLICY "Read attraction_details" ON attraction_details
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM places p
            WHERE p.id = attraction_details.place_id
              AND (p.visibility = 'public' OR p.created_by = auth.uid())
        )
    );

INSERT INTO schema_migrations (id)
VALUES ('apply_restaurants_lot_a_migration.sql')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE user_places IS 'Tes adresses — notes/statuts perso (séparés des faits places)';
COMMENT ON TABLE link_imports IS 'Imports Instagram/TikTok/Google Maps — URL nettoyée sans trackers';
COMMENT ON TABLE trip_item_private_notes IS 'Notes privées trip_item — exclues des parcours publiables';
