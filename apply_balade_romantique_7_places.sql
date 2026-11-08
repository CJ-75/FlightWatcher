-- Balade romantique à Paris : 7 étapes lieu (coords Maps) pour « Lancer le parcours ».
-- Manual apply only (never supabase db push). Safe to re-run.

-- 1) Places (stable via place_refs.external_id)
WITH wanted(ext_id, name, kind, lat, lng) AS (
  VALUES
    ('seed:balade-romantique:1', 'Café Saint-Régis', 'cafe', 48.85185, 2.35585),
    ('seed:balade-romantique:2', 'Pont Saint-Louis', 'attraction', 48.85255, 2.35255),
    ('seed:balade-romantique:3', 'Parvis Notre-Dame', 'attraction', 48.85300, 2.34990),
    ('seed:balade-romantique:4', 'Pont Neuf', 'attraction', 48.85660, 2.34120),
    ('seed:balade-romantique:5', 'Square du Vert-Galant', 'attraction', 48.85750, 2.34000),
    ('seed:balade-romantique:6', 'Pont des Arts', 'attraction', 48.85830, 2.33750),
    ('seed:balade-romantique:7', 'Café Marly', 'restaurant', 48.86110, 2.33550)
)
INSERT INTO places (kind, name, city_slug, geom, location_precision, meta)
SELECT
  w.kind,
  w.name,
  'paris',
  ST_SetSRID(ST_MakePoint(w.lng, w.lat), 4326)::geography,
  'exact',
  jsonb_build_object('lat', w.lat, 'lng', w.lng, 'seed', 'balade-romantique')
FROM wanted w
WHERE NOT EXISTS (
  SELECT 1 FROM place_refs r
  WHERE r.provider = 'other' AND r.external_id = w.ext_id
);

INSERT INTO place_refs (place_id, provider, external_id, meta)
SELECT pl.id, 'other', w.ext_id, '{}'::jsonb
FROM (
  VALUES
    ('seed:balade-romantique:1', 'Café Saint-Régis'),
    ('seed:balade-romantique:2', 'Pont Saint-Louis'),
    ('seed:balade-romantique:3', 'Parvis Notre-Dame'),
    ('seed:balade-romantique:4', 'Pont Neuf'),
    ('seed:balade-romantique:5', 'Square du Vert-Galant'),
    ('seed:balade-romantique:6', 'Pont des Arts'),
    ('seed:balade-romantique:7', 'Café Marly')
) AS w(ext_id, name)
JOIN places pl
  ON pl.name = w.name
 AND pl.city_slug = 'paris'
 AND pl.meta->>'seed' = 'balade-romantique'
WHERE NOT EXISTS (
  SELECT 1 FROM place_refs r
  WHERE r.provider = 'other' AND r.external_id = w.ext_id
);

-- Refresh coords if places already existed
UPDATE places pl
SET
  geom = ST_SetSRID(ST_MakePoint(w.lng, w.lat), 4326)::geography,
  location_precision = 'exact',
  meta = COALESCE(pl.meta, '{}'::jsonb) || jsonb_build_object('lat', w.lat, 'lng', w.lng),
  updated_at = now()
FROM place_refs r
JOIN (
  VALUES
    ('seed:balade-romantique:1', 48.85185, 2.35585),
    ('seed:balade-romantique:2', 48.85255, 2.35255),
    ('seed:balade-romantique:3', 48.85300, 2.34990),
    ('seed:balade-romantique:4', 48.85660, 2.34120),
    ('seed:balade-romantique:5', 48.85750, 2.34000),
    ('seed:balade-romantique:6', 48.85830, 2.33750),
    ('seed:balade-romantique:7', 48.86110, 2.33550)
) AS w(ext_id, lat, lng) ON w.ext_id = r.external_id
WHERE r.provider = 'other'
  AND r.place_id = pl.id;

-- 2) Replace itinerary items for balade-romantique-paris
DELETE FROM itinerary_items
WHERE itinerary_id IN (
  SELECT id FROM itineraries WHERE slug = 'balade-romantique-paris'
);

INSERT INTO itinerary_items (
  itinerary_id, kind, item_type, position, title, note,
  duration_minutes, day_offset, moment, sort_key, place_id
)
SELECT
  i.id,
  'place',
  'place',
  v.position,
  v.title,
  v.note,
  v.duration_minutes,
  0,
  v.moment,
  v.sort_key,
  r.place_id
FROM itineraries i
CROSS JOIN (
  VALUES
    (0, 'seed:balade-romantique:1', 'Café Saint-Régis',
     'Un café face à Notre-Dame, table près de la fenêtre.', 40, 'afternoon', 'a0'),
    (1, 'seed:balade-romantique:2', 'Pont Saint-Louis',
     'Traversée vers l’île, vue sur la Seine.', 20, 'afternoon', 'a1'),
    (2, 'seed:balade-romantique:3', 'Parvis Notre-Dame',
     'Pause photo, puis direction les quais.', 25, 'afternoon', 'a2'),
    (3, 'seed:balade-romantique:4', 'Pont Neuf',
     'Le plus vieux pont — lumière dorée en fin d’après-midi.', 30, 'afternoon', 'a3'),
    (4, 'seed:balade-romantique:5', 'Square du Vert-Galant',
     'Bout de l’île : bancs, eau, calme.', 35, 'afternoon', 'a4'),
    (5, 'seed:balade-romantique:6', 'Pont des Arts',
     'Coucher de soleil éventuel, vue Louvre.', 30, 'evening', 'a5'),
    (6, 'seed:balade-romantique:7', 'Café Marly',
     'Dîner / verre sous les arcades, face à la pyramide.', 90, 'evening', 'a6')
) AS v(position, ext_id, title, note, duration_minutes, moment, sort_key)
JOIN place_refs r
  ON r.provider = 'other'
 AND r.external_id = v.ext_id
WHERE i.slug = 'balade-romantique-paris';

INSERT INTO schema_migrations (id)
VALUES ('apply_balade_romantique_7_places.sql')
ON CONFLICT (id) DO NOTHING;
