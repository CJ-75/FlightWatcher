-- Parcours catalogue éditorial (Lot 1)
-- Apply manually in Supabase SQL editor (never supabase db push).
-- Prerequisite: apply_activities_lot_a_migration.sql

CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checksum TEXT
);

-- —— itineraries: editorial columns (one ALTER each — clearer errors / partial apply) ——
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS author_kind TEXT NOT NULL DEFAULT 'user';
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS intro TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS duration_kind TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS occasions TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS featured_from DATE;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS featured_to DATE;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS budget_estimate_eur NUMERIC(10, 2);
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS budget_basis TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS sort_weight INTEGER NOT NULL DEFAULT 0;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Backfill status from legacy visibility for existing rows
UPDATE itineraries
SET status = CASE
    WHEN visibility = 'public' THEN 'published'
    ELSE 'draft'
END
WHERE status = 'draft' AND visibility = 'public';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'itineraries_status_check'
    ) THEN
        ALTER TABLE itineraries
            ADD CONSTRAINT itineraries_status_check
            CHECK (status IN ('draft', 'published', 'retired'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'itineraries_author_kind_check'
    ) THEN
        ALTER TABLE itineraries
            ADD CONSTRAINT itineraries_author_kind_check
            CHECK (author_kind IN ('admin', 'user'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'itineraries_duration_kind_check'
    ) THEN
        ALTER TABLE itineraries
            ADD CONSTRAINT itineraries_duration_kind_check
            CHECK (
                duration_kind IS NULL
                OR duration_kind IN ('2h', 'half_day', 'day', 'weekend')
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'itineraries_budget_basis_check'
    ) THEN
        ALTER TABLE itineraries
            ADD CONSTRAINT itineraries_budget_basis_check
            CHECK (
                budget_basis IS NULL
                OR budget_basis IN ('for_two', 'per_person')
            );
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_itineraries_slug_unique
    ON itineraries (slug)
    WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_itineraries_status_city
    ON itineraries (status, city_slug);

CREATE INDEX IF NOT EXISTS idx_itineraries_featured
    ON itineraries (featured_from, featured_to)
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_itineraries_occasions
    ON itineraries USING GIN (occasions);

-- —— itinerary_items: editorial columns ——
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS photo TEXT;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS viator_product_code TEXT;

-- Backfill kind from legacy item_type
UPDATE itinerary_items
SET kind = CASE
    WHEN item_type = 'activity' THEN 'activity'
    WHEN item_type IN ('hotel', 'restaurant') THEN 'place'
    ELSE 'place'
END
WHERE kind IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'itinerary_items'
          AND column_name = 'notes'
    ) THEN
        UPDATE itinerary_items
        SET note = notes
        WHERE note IS NULL AND notes IS NOT NULL;
    END IF;
END $$;

ALTER TABLE itinerary_items
    ALTER COLUMN kind SET DEFAULT 'place';

ALTER TABLE itinerary_items
    ALTER COLUMN kind SET NOT NULL;

-- Expand item_type to allow free-text steps (legacy CHECK was activity|hotel|restaurant)
ALTER TABLE itinerary_items DROP CONSTRAINT IF EXISTS itinerary_items_item_type_check;
ALTER TABLE itinerary_items
    ADD CONSTRAINT itinerary_items_item_type_check
    CHECK (item_type IN ('activity', 'hotel', 'restaurant', 'place', 'free'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'itinerary_items_kind_check'
    ) THEN
        ALTER TABLE itinerary_items
            ADD CONSTRAINT itinerary_items_kind_check
            CHECK (kind IN ('place', 'activity', 'free'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_itinerary_items_position
    ON itinerary_items (itinerary_id, position);

-- —— Favoris parcours ——
CREATE TABLE IF NOT EXISTS liked_itineraries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
    itinerary_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, itinerary_id)
);

CREATE INDEX IF NOT EXISTS idx_liked_itineraries_user ON liked_itineraries(user_id);
CREATE INDEX IF NOT EXISTS idx_liked_itineraries_created ON liked_itineraries(created_at DESC);

ALTER TABLE liked_itineraries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own liked itineraries" ON liked_itineraries;
CREATE POLICY "Users see own liked itineraries"
    ON liked_itineraries FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own liked itineraries" ON liked_itineraries;
CREATE POLICY "Users insert own liked itineraries"
    ON liked_itineraries FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own liked itineraries" ON liked_itineraries;
CREATE POLICY "Users delete own liked itineraries"
    ON liked_itineraries FOR DELETE
    USING (auth.uid() = user_id);

-- Public read of published editorial itineraries (service role still used by API)
DROP POLICY IF EXISTS "Public read published itineraries" ON itineraries;
CREATE POLICY "Public read published itineraries" ON itineraries
    FOR SELECT
    USING (
        status = 'published'
        OR visibility = 'public'
        OR owner_user_id = auth.uid()
    );

DROP POLICY IF EXISTS "Public read published itinerary_items" ON itinerary_items;
CREATE POLICY "Public read published itinerary_items" ON itinerary_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM itineraries it
            WHERE it.id = itinerary_items.itinerary_id
              AND (
                  it.status = 'published'
                  OR it.visibility = 'public'
                  OR it.owner_user_id = auth.uid()
              )
        )
    );

INSERT INTO schema_migrations (id)
VALUES ('apply_itineraries_editorial_migration.sql')
ON CONFLICT (id) DO NOTHING;
