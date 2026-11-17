-- Manual migration: planned_trips.meta for Pop→Planner opt-ins
-- want_flight, want_hotel, source_itinerary_id, source_city_slug, …

ALTER TABLE planned_trips
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN planned_trips.meta IS
  'Soft flags: want_flight, want_hotel, source_itinerary_id, source_city_slug';

CREATE INDEX IF NOT EXISTS idx_planned_trips_meta_source
  ON planned_trips ((meta->>'source_itinerary_id'))
  WHERE meta ? 'source_itinerary_id';
