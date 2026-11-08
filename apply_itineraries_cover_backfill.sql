-- Backfill cover_image for demo parcours (Wikimedia city photos).
-- Safe to re-run. Manual apply only (never supabase db push).

UPDATE itineraries SET cover_image = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/1280px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg'
WHERE slug = 'balade-romantique-paris'
  AND (cover_image IS NULL OR btrim(cover_image) = '');

UPDATE itineraries SET cover_image = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Paris_-_Eiffelturm_und_Marsfeld2.jpg/1280px-Paris_-_Eiffelturm_und_Marsfeld2.jpg'
WHERE slug = 'ferie-11-novembre-paris'
  AND (cover_image IS NULL OR btrim(cover_image) = '');

UPDATE itineraries SET cover_image = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Notre-Dame_de_la_Garde_aerial_view_2020.jpeg/1280px-Notre-Dame_de_la_Garde_aerial_view_2020.jpeg'
WHERE slug = 'marseille-au-soleil'
  AND (cover_image IS NULL OR btrim(cover_image) = '');

UPDATE itineraries SET cover_image = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1a/Vieux-Port_de_Marseille.jpg/1280px-Vieux-Port_de_Marseille.jpg'
WHERE slug = 'marseille-en-amoureux'
  AND (cover_image IS NULL OR btrim(cover_image) = '');

UPDATE itineraries SET cover_image = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/Lisboa_-_Portugal_%2852597836992%29.jpg/1280px-Lisboa_-_Portugal_%2852597836992%29.jpg'
WHERE slug = 'lisbonne-week-end'
  AND (cover_image IS NULL OR btrim(cover_image) = '');

UPDATE itineraries SET cover_image = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e5/Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG/1280px-Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG'
WHERE slug = 'porto-tout-doux'
  AND (cover_image IS NULL OR btrim(cover_image) = '');

-- City-level fallback for any other published parcours still without cover
UPDATE itineraries i
SET cover_image = c.url
FROM (VALUES
    ('paris', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/1280px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg'),
    ('marseille', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Notre-Dame_de_la_Garde_aerial_view_2020.jpeg/1280px-Notre-Dame_de_la_Garde_aerial_view_2020.jpeg'),
    ('lisbon', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/Lisboa_-_Portugal_%2852597836992%29.jpg/1280px-Lisboa_-_Portugal_%2852597836992%29.jpg'),
    ('lisbonne', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/Lisboa_-_Portugal_%2852597836992%29.jpg/1280px-Lisboa_-_Portugal_%2852597836992%29.jpg'),
    ('porto', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e5/Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG/1280px-Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG'),
    ('lyon', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/97/Lyon-part-dieu-2023.jpg/1280px-Lyon-part-dieu-2023.jpg'),
    ('nice', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/ba/Promenade_des_Anglais_Nice_IMG_1255.jpg/1280px-Promenade_des_Anglais_Nice_IMG_1255.jpg'),
    ('bordeaux', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e1/Bordeaux_Place_de_la_Bourse_de_nuit.jpg/1280px-Bordeaux_Place_de_la_Bourse_de_nuit.jpg'),
    ('barcelona', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Evening_light_over_Barcelona.jpg/1280px-Evening_light_over_Barcelona.jpg'),
    ('rome', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7e/Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg/1280px-Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg'),
    ('madrid', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Madrid_-_Sky_Bar_360%C2%BA_%28Hotel_Riu_Plaza_Espa%C3%B1a%29%2C_vistas_19.jpg/1280px-Madrid_-_Sky_Bar_360%C2%BA_%28Hotel_Riu_Plaza_Espa%C3%B1a%29%2C_vistas_19.jpg')
) AS c(city_slug, url)
WHERE lower(i.city_slug) = c.city_slug
  AND (i.cover_image IS NULL OR btrim(i.cover_image) = '');

INSERT INTO schema_migrations (id)
VALUES ('apply_itineraries_cover_backfill.sql')
ON CONFLICT (id) DO NOTHING;
