-- Flight booking lifecycle (manual confirmation + partner postback).
-- Apply manually in Supabase SQL Editor. Never run automatically.

BEGIN;

ALTER TABLE my_trip_drafts
    ADD COLUMN IF NOT EXISTS flight_booking_status TEXT
        NOT NULL DEFAULT 'not_started',
    ADD COLUMN IF NOT EXISTS flight_booking_provider TEXT,
    ADD COLUMN IF NOT EXISTS flight_booking_reference TEXT,
    ADD COLUMN IF NOT EXISTS flight_booking_updated_at TIMESTAMPTZ;

ALTER TABLE my_trip_drafts
    DROP CONSTRAINT IF EXISTS my_trip_drafts_flight_booking_status_check;

ALTER TABLE my_trip_drafts
    ADD CONSTRAINT my_trip_drafts_flight_booking_status_check
    CHECK (
        flight_booking_status IN (
            'not_started',
            'redirected',
            'pending_partner',
            'user_confirmed',
            'partner_confirmed',
            'cancelled'
        )
    );

UPDATE my_trip_drafts
SET flight_booking_status = 'user_confirmed',
    flight_booking_updated_at = COALESCE(flight_booking_updated_at, flight_booked_at)
WHERE flight_booked_at IS NOT NULL
  AND flight_booking_status = 'not_started';

CREATE INDEX IF NOT EXISTS idx_my_trip_drafts_flight_booking_status
    ON my_trip_drafts(flight_booking_status, flight_booking_updated_at);

COMMENT ON COLUMN my_trip_drafts.flight_booking_status IS
  'Flight lifecycle: redirected/pending, user-confirmed for airline flows, or partner-confirmed.';
COMMENT ON COLUMN my_trip_drafts.flight_booking_reference IS
  'External Travelpayouts action/booking identifier when supplied by postback.';

COMMIT;
