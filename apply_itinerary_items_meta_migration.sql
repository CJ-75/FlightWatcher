-- itinerary_items.meta — Maps URL + photo galleries for parcours create V1
-- Apply manually in Supabase SQL editor (never npx supabase db push).

ALTER TABLE itinerary_items
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN itinerary_items.meta IS
  'Extra step data: maps_url, lat, lng, photos[] (gallery URLs; photo column = cover thumb)';
