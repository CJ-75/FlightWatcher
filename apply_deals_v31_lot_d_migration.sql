-- Deals v3.1 Lot D — baggage policies + airport distance to city centre
-- Apply manually in Supabase SQL editor (never supabase db push).

CREATE TABLE IF NOT EXISTS carrier_baggage_policy (
    carrier_code TEXT PRIMARY KEY,
    carrier_name TEXT NOT NULL DEFAULT '',
    included_text TEXT NOT NULL,
    cabin_bag_text TEXT NOT NULL DEFAULT '',
    source_url TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE carrier_baggage_policy IS
  'Lot D: short static baggage copy. No price estimates. Verify on airline site before seed updates.';

ALTER TABLE airport_city_mapping
    ADD COLUMN IF NOT EXISTS distance_km_to_center DOUBLE PRECISION;

COMMENT ON COLUMN airport_city_mapping.distance_km_to_center IS
  'Approx. km airport → served city centre. Show label only if > 25.';
