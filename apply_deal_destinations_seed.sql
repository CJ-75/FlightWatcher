-- Seed 10 curated deal destinations (FR-friendly week-ends).
-- Apply AFTER apply_liteapi_deals_migration.sql (never supabase db push).
-- Idempotent via ON CONFLICT (slug).

INSERT INTO deal_destinations (
    slug, city_name, country_code, iata_arrival,
    center_lat, center_lng, pool_radius_m, timezone, active, priority
) VALUES
    ('lisbonne',  'Lisbonne',  'PT', 'LIS', 38.7139,  -9.1394, 2200, 'Europe/Lisbon',   true, 10),
    ('porto',     'Porto',     'PT', 'OPO', 41.1409,  -8.6135, 2000, 'Europe/Lisbon',   true, 20),
    ('barcelone', 'Barcelone', 'ES', 'BCN', 41.3833,   2.1767, 2000, 'Europe/Madrid',   true, 30),
    ('rome',      'Rome',      'IT', 'CIA', 41.8986,  12.4768, 2200, 'Europe/Rome',     true, 40),
    ('milan',     'Milan',     'IT', 'BGY', 45.4642,   9.1900, 2000, 'Europe/Rome',     true, 50),
    ('madrid',    'Madrid',    'ES', 'MAD', 40.4168,  -3.7038, 2000, 'Europe/Madrid',   true, 60),
    ('dublin',    'Dublin',    'IE', 'DUB', 53.3456,  -6.2641, 2000, 'Europe/Dublin',   true, 70),
    ('budapest',  'Budapest',  'HU', 'BUD', 47.4979,  19.0402, 2000, 'Europe/Budapest', true, 80),
    ('prague',    'Prague',    'CZ', 'PRG', 50.0875,  14.4213, 2000, 'Europe/Prague',   true, 90),
    ('cracovie',  'Cracovie',  'PL', 'KRK', 50.0619,  19.9368, 1800, 'Europe/Warsaw',   true, 100)
ON CONFLICT (slug) DO UPDATE SET
    city_name = EXCLUDED.city_name,
    country_code = EXCLUDED.country_code,
    iata_arrival = EXCLUDED.iata_arrival,
    center_lat = EXCLUDED.center_lat,
    center_lng = EXCLUDED.center_lng,
    pool_radius_m = EXCLUDED.pool_radius_m,
    timezone = EXCLUDED.timezone,
    active = EXCLUDED.active,
    priority = EXCLUDED.priority,
    updated_at = now();
