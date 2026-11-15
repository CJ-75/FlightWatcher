-- Pop page SEO (Lot 1) — nullable editorial + licence photos + indexation villes
-- Apply manually in Supabase SQL editor (never supabase db push).
-- Prerequisite: apply_itineraries_editorial_migration.sql

CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checksum TEXT
);

-- —— Photo licence (prioritaire : sans licence, cover hors seuil) ——
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS photo_source TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS photo_license TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS photo_author TEXT;

ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS photo_source TEXT;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS photo_license TEXT;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS photo_author TEXT;

-- —— Editorial / SEO fields (all nullable) ——
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS pace TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS transport_modes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS ideal_for TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS faq JSONB;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS tips JSONB;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS stay JSONB;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS target_query TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS color_key TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS indexable_override BOOLEAN;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS canonical_itinerary_id UUID
  REFERENCES itineraries (id) ON DELETE SET NULL;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS slug_history TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'itineraries_pace_check'
  ) THEN
    ALTER TABLE itineraries
      ADD CONSTRAINT itineraries_pace_check
      CHECK (
        pace IS NULL
        OR pace IN ('slow', 'moderate', 'packed')
      );
  END IF;
END $$;

-- Unique target_query per city when set (blocks duplicate SEO keywords)
CREATE UNIQUE INDEX IF NOT EXISTS idx_itineraries_city_target_query
  ON itineraries (city_slug, target_query)
  WHERE target_query IS NOT NULL AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_itineraries_featured
  ON itineraries (featured)
  WHERE featured = true AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_itineraries_canonical
  ON itineraries (canonical_itinerary_id)
  WHERE canonical_itinerary_id IS NOT NULL;

-- —— Redirections d’anciens slugs ——
CREATE TABLE IF NOT EXISTS itinerary_slug_redirects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_slug TEXT NOT NULL,
  old_slug TEXT NOT NULL,
  itinerary_id UUID NOT NULL REFERENCES itineraries (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city_slug, old_slug)
);

CREATE INDEX IF NOT EXISTS idx_itinerary_slug_redirects_itin
  ON itinerary_slug_redirects (itinerary_id);

-- —— Ouverture indexation ville par ville ——
CREATE TABLE IF NOT EXISTS pop_index_cities (
  city_slug TEXT PRIMARY KEY,
  indexable BOOLEAN NOT NULL DEFAULT false,
  opened_at TIMESTAMPTZ,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Paris closed by default until pilot passes threshold
INSERT INTO pop_index_cities (city_slug, indexable, notes)
VALUES ('paris', false, 'Pilot — open when intro+licence+notes meet threshold')
ON CONFLICT (city_slug) DO NOTHING;

-- Backfill ideal_for from occasions (best-effort, non-destructive)
UPDATE itineraries
SET ideal_for = occasions
WHERE (ideal_for IS NULL OR cardinality(ideal_for) = 0)
  AND occasions IS NOT NULL
  AND cardinality(occasions) > 0;

INSERT INTO schema_migrations (id)
VALUES ('apply_pop_page_seo_migration.sql')
ON CONFLICT (id) DO NOTHING;
