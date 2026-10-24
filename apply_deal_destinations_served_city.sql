-- Link deal_destinations → served_cities (hotel catalogue = arrival city).
-- Apply manually in Supabase SQL editor (never supabase db push).

ALTER TABLE deal_destinations
    ADD COLUMN IF NOT EXISTS served_city_id UUID REFERENCES served_cities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deal_destinations_served_city
    ON deal_destinations(served_city_id)
    WHERE served_city_id IS NOT NULL;

-- At most one active hotel-catalogue destination per served city.
CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_destinations_active_served_city
    ON deal_destinations(served_city_id)
    WHERE active = true AND served_city_id IS NOT NULL;

-- Backfill by slug match
UPDATE deal_destinations d
SET served_city_id = sc.id,
    updated_at = now()
FROM served_cities sc
WHERE d.served_city_id IS NULL
  AND lower(d.slug) = lower(sc.slug);

-- Backfill by primary_iata = iata_arrival
UPDATE deal_destinations d
SET served_city_id = sc.id,
    updated_at = now()
FROM served_cities sc
WHERE d.served_city_id IS NULL
  AND sc.primary_iata IS NOT NULL
  AND upper(d.iata_arrival) = upper(sc.primary_iata);

-- Backfill by city_name (case-insensitive)
UPDATE deal_destinations d
SET served_city_id = sc.id,
    updated_at = now()
FROM served_cities sc
WHERE d.served_city_id IS NULL
  AND lower(d.city_name) = lower(sc.city_name);
