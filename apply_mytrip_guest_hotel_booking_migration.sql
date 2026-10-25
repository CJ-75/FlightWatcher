-- Mon voyage Lot D — guest hotel checkout (draft_token as access proof)
-- Apply manually in Supabase SQL editor (never supabase db push).

-- 1) hotel_bookings: allow anonymous rows keyed by draft_token
ALTER TABLE hotel_bookings
    ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE hotel_bookings
    ADD COLUMN IF NOT EXISTS draft_token TEXT;

CREATE INDEX IF NOT EXISTS idx_hotel_bookings_draft_token
    ON hotel_bookings(draft_token)
    WHERE draft_token IS NOT NULL;

COMMENT ON COLUMN hotel_bookings.draft_token IS
  'Lot D: anonymous MyTrip checkout — service role only; no JWT required when set.';

-- 2) Draft column for hotel booked (mirrors flight_booked_at)
ALTER TABLE my_trip_drafts
    ADD COLUMN IF NOT EXISTS hotel_booked_at TIMESTAMPTZ;

COMMENT ON COLUMN my_trip_drafts.hotel_booked_at IS
  'Lot D: set when guest completes in-app hotel payment.';
