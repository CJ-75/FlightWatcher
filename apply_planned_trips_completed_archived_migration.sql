-- Manual migration: allow completed (Terminé) + archived (soft-delete)
-- À exécuter manuellement dans l'éditeur SQL Supabase
-- NEVER: npx supabase db push

ALTER TABLE planned_trips
  DROP CONSTRAINT IF EXISTS planned_trips_status_check;

ALTER TABLE planned_trips
  ADD CONSTRAINT planned_trips_status_check
  CHECK (
    status IN (
      'draft',
      'scanning',
      'planning',
      'locked',
      'completed',
      'archived'
    )
  );

COMMENT ON COLUMN planned_trips.status IS
  'draft|scanning|planning|locked|completed (Terminé)|archived (soft-delete, hidden)';
