-- Organic / on-demand destinations: allow missing tourist centre at insert time.
-- Seeded top destinations keep hand-picked center_lat/lng.
-- Bootstrap (LiteAPI city list → hotel centroid) fills coords later.
-- Apply manually in Supabase SQL editor (never supabase db push).

ALTER TABLE deal_destinations
    ALTER COLUMN center_lat DROP NOT NULL,
    ALTER COLUMN center_lng DROP NOT NULL;

COMMENT ON COLUMN deal_destinations.center_lat IS
    'Tourist centre lat. Seeded destinations always set; organic rows may be null until hotel-pool bootstrap.';
COMMENT ON COLUMN deal_destinations.center_lng IS
    'Tourist centre lng. Seeded destinations always set; organic rows may be null until hotel-pool bootstrap.';
