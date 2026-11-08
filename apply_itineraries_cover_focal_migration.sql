-- Ancien « cover_focal » : abandonné (pas de point focal couverture).
-- Ce fichier ne crée plus de colonne — uniquement la fenêtre À la une du férié démo.
-- Manual apply only (never supabase db push).
-- Safe to re-run.

-- Fenêtre ouverte avant le jour ; featured_to = 11 nov. 2026 (mercredi)
-- → titres « Pour le férié de mercredi » / « Mercredi 11 novembre »
UPDATE itineraries
SET featured_from = '2026-11-01',
    featured_to = '2026-11-11'
WHERE slug = 'ferie-11-novembre-paris'
  AND is_demo = true;

INSERT INTO schema_migrations (id)
VALUES ('apply_itineraries_cover_focal_migration.sql')
ON CONFLICT (id) DO NOTHING;
