-- Manual migration: account hard-delete keeps stay/booking rows (dates).
-- À exécuter manuellement dans l'éditeur SQL Supabase
-- NEVER: npx supabase db push
--
-- Before auth.users delete, FKs must SET NULL (not CASCADE) on operational data.

-- hotel_bookings.user_id : keep rows, detach user
ALTER TABLE hotel_bookings
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE hotel_bookings
  DROP CONSTRAINT IF EXISTS hotel_bookings_user_id_fkey;

ALTER TABLE hotel_bookings
  ADD CONSTRAINT hotel_bookings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- planned_trips.organizer_id : keep trip + dates, detach organizer
ALTER TABLE planned_trips
  ALTER COLUMN organizer_id DROP NOT NULL;

ALTER TABLE planned_trips
  DROP CONSTRAINT IF EXISTS planned_trips_organizer_id_fkey;

ALTER TABLE planned_trips
  ADD CONSTRAINT planned_trips_organizer_id_fkey
  FOREIGN KEY (organizer_id) REFERENCES auth.users(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN hotel_bookings.user_id IS
  'Nullable after account delete — booking + dates stay for ops/history.';
COMMENT ON COLUMN planned_trips.organizer_id IS
  'Nullable after account delete — trip calendar dates stay.';
