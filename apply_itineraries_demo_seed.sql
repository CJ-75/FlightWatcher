-- Demo parcours (dev only — is_demo=true). Do not run in production.
-- Prerequisite: apply_itineraries_editorial_migration.sql (must succeed first)

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'itineraries'
          AND column_name = 'is_demo'
    ) THEN
        RAISE EXCEPTION
            'Missing itineraries.is_demo — apply apply_itineraries_editorial_migration.sql first, then re-run this seed.';
    END IF;
END $$;

-- Clear previous demo rows (safe on re-run)
DELETE FROM itinerary_items
WHERE itinerary_id IN (SELECT id FROM itineraries WHERE is_demo = true);
DELETE FROM itineraries WHERE is_demo = true;

WITH seeded AS (
    INSERT INTO itineraries (
        title, subtitle, intro, slug, city_slug,
        status, author_kind, duration_kind, occasions,
        cover_image, budget_estimate_eur, budget_basis,
        sort_weight, published_at, is_demo, visibility
    ) VALUES
    (
        'Balade romantique à Paris',
        'Quais, lumière dorée, une table pour deux.',
        'Une après-midi au fil de la Seine : une pause café, une vue, un dîner. Idéal à deux, sans précipitation.',
        'balade-romantique-paris',
        'paris',
        'published', 'admin', 'half_day',
        ARRAY['romantique', 'nuit'],
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/1280px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg',
        40, 'for_two', 10, now(), true, 'public'
    ),
    (
        'Férié du 11 novembre à Paris',
        'Profiter du jour off sans quitter la ville.',
        'Un parcours pensé pour un férié parisien : musée ou balade le matin, déjeuner, puis fin de journée au calme.',
        'ferie-11-novembre-paris',
        'paris',
        'published', 'admin', 'day',
        ARRAY['ferie', 'petit_budget'],
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Paris_-_Eiffelturm_und_Marsfeld2.jpg/1280px-Paris_-_Eiffelturm_und_Marsfeld2.jpg',
        55, 'per_person', 20, now(), true, 'public'
    ),
    (
        'Marseille au soleil',
        'Vieux-Port, calanques en vue, pastis optionnel.',
        'Une journée face à la mer : marché, panier, lumière. Pour ceux qui veulent la ville avant la plage.',
        'marseille-au-soleil',
        'marseille',
        'published', 'admin', 'day',
        ARRAY['soleil', 'amis'],
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Notre-Dame_de_la_Garde_aerial_view_2020.jpeg/1280px-Notre-Dame_de_la_Garde_aerial_view_2020.jpeg',
        35, 'per_person', 15, now(), true, 'public'
    ),
    (
        'Marseille en amoureux',
        'Coucher de soleil et table avec vue.',
        'Fin d’après-midi sur les hauteurs, puis dîner. Court, simple, mémorable.',
        'marseille-en-amoureux',
        'marseille',
        'published', 'admin', 'half_day',
        ARRAY['romantique', 'soleil'],
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1a/Vieux-Port_de_Marseille.jpg/1280px-Vieux-Port_de_Marseille.jpg',
        60, 'for_two', 12, now(), true, 'public'
    ),
    (
        'Lisbonne en un week-end',
        'Tram, miradouros, pastéis.',
        'Deux jours pour sentir la ville : belvédères, ruelles, et une soirée en fado ou en terrasse.',
        'lisbonne-week-end',
        'lisbon',
        'published', 'admin', 'weekend',
        ARRAY['amis', 'saison'],
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/Lisboa_-_Portugal_%2852597836992%29.jpg/1280px-Lisboa_-_Portugal_%2852597836992%29.jpg',
        80, 'per_person', 8, now(), true, 'public'
    ),
    (
        'Porto tout doux',
        'Ribeira, caves, lumière du Douro.',
        'Une journée pour flâner entre rive et ponts. Rythme lent, photos faciles, bonne table le soir.',
        'porto-tout-doux',
        'porto',
        'published', 'admin', 'day',
        ARRAY['petit_budget', 'romantique'],
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e5/Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG/1280px-Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG',
        45, 'for_two', 5, now(), true, 'public'
    )
    RETURNING id, slug
)
INSERT INTO itinerary_items (
    itinerary_id, kind, item_type, position, title, note, duration_minutes, day_offset, moment, sort_key
)
SELECT s.id, v.kind, v.item_type, v.position, v.title, v.note, v.duration_minutes, v.day_offset, v.moment, v.sort_key
FROM seeded s
JOIN (
    VALUES
        -- balade-romantique : étapes lieu via apply_balade_romantique_7_places.sql
        ('ferie-11-novembre-paris', 'free', 'free', 0, 'Matinée libre', 'Musée ou marché selon la météo.', 120, 0, 'morning', 'a0'),
        ('ferie-11-novembre-paris', 'free', 'free', 1, 'Déjeuner de férié', 'Quartier calme, pas touristique.', 75, 0, 'afternoon', 'a1'),
        ('ferie-11-novembre-paris', 'free', 'free', 2, 'Fin de journée', 'Parc ou terrasse.', 60, 0, 'evening', 'a2'),
        ('marseille-au-soleil', 'free', 'free', 0, 'Vieux-Port', 'Tour du port, café.', 60, 0, 'morning', 'a0'),
        ('marseille-au-soleil', 'free', 'free', 1, 'Panier / Le Panier', 'Ruelles et vue.', 90, 0, 'afternoon', 'a1'),
        ('marseille-au-soleil', 'free', 'free', 2, 'Coucher de soleil', 'Point de vue face mer.', 45, 0, 'evening', 'a2'),
        ('marseille-en-amoureux', 'free', 'free', 0, 'Belvédère', 'Arrivée avant le crépuscule.', 40, 0, 'afternoon', 'a0'),
        ('marseille-en-amoureux', 'free', 'free', 1, 'Apéro', 'Pastis ou verre avec vue.', 45, 0, 'evening', 'a1'),
        ('marseille-en-amoureux', 'free', 'free', 2, 'Dîner', 'Table pour deux.', 90, 0, 'evening', 'a2'),
        ('lisbonne-week-end', 'free', 'free', 0, 'Miradouro', 'Premier point de vue.', 50, 0, 'morning', 'a0'),
        ('lisbonne-week-end', 'free', 'free', 1, 'Tram & ruelles', 'Sans forcer le rythme.', 90, 0, 'afternoon', 'a1'),
        ('lisbonne-week-end', 'free', 'free', 2, 'Soirée', 'Terrasse ou fado.', 120, 0, 'evening', 'a2'),
        ('lisbonne-week-end', 'free', 'free', 3, 'Dimanche doux', 'Pastéis et flânerie.', 90, 1, 'morning', 'b0'),
        ('porto-tout-doux', 'free', 'free', 0, 'Ribeira', 'Balade au bord de l’eau.', 60, 0, 'morning', 'a0'),
        ('porto-tout-doux', 'free', 'free', 1, 'Pont & rive', 'Photos et pause.', 75, 0, 'afternoon', 'a1'),
        ('porto-tout-doux', 'free', 'free', 2, 'Cave ou dîner', 'Selon l’envie.', 90, 0, 'evening', 'a2')
) AS v(slug, kind, item_type, position, title, note, duration_minutes, day_offset, moment, sort_key)
  ON s.slug = v.slug;

-- Fenêtre À la une ouverte avant le férié ; featured_to = jour du férié (mercredi)
UPDATE itineraries
SET featured_from = '2026-11-01',
    featured_to = '2026-11-11'
WHERE slug = 'ferie-11-novembre-paris' AND is_demo = true;

INSERT INTO schema_migrations (id)
VALUES ('apply_itineraries_demo_seed.sql')
ON CONFLICT (id) DO NOTHING;

-- Après ce seed : appliquer apply_balade_romantique_7_places.sql
-- (7 lieux Maps + « Lancer le parcours » multi-étapes).
