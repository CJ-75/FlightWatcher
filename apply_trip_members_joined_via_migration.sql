-- Manual migration: trace how a member entered the trip (invite vs organizer).
-- À exécuter manuellement dans l'éditeur SQL Supabase
-- NEVER: npx supabase db push

ALTER TABLE trip_members
  ADD COLUMN IF NOT EXISTS joined_via TEXT;

ALTER TABLE trip_members
  DROP CONSTRAINT IF EXISTS trip_members_joined_via_check;

ALTER TABLE trip_members
  ADD CONSTRAINT trip_members_joined_via_check
  CHECK (
    joined_via IS NULL
    OR joined_via IN ('created', 'invite', 'manual')
  );

-- Backfill from existing roles/status
UPDATE trip_members
SET joined_via = 'created'
WHERE role = 'organizer'
  AND (joined_via IS NULL OR joined_via = '');

UPDATE trip_members
SET joined_via = 'invite'
WHERE role = 'traveler'
  AND status = 'joined'
  AND user_id IS NOT NULL
  AND (joined_via IS NULL OR joined_via = '');

UPDATE trip_members
SET joined_via = 'manual'
WHERE status = 'guest'
  AND (joined_via IS NULL OR joined_via = '');

COMMENT ON COLUMN trip_members.joined_via IS
  'created = orga; invite = join via /planner/invite; manual = placeholder hors app (guest)';

CREATE INDEX IF NOT EXISTS idx_trip_members_joined_via
  ON trip_members (joined_via)
  WHERE joined_via IS NOT NULL;
