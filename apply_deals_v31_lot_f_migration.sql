-- Deals v3.1 Lot F — Mon voyage email + flight booked marker
-- Apply manually in Supabase SQL editor (never supabase db push).
-- Core state also lives in payload JSON; columns help admin / reporting.

ALTER TABLE my_trip_drafts
    ADD COLUMN IF NOT EXISTS flight_booked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS share_email TEXT;

COMMENT ON COLUMN my_trip_drafts.flight_booked_at IS
  'Lot F: user tapped « J''ai réservé mon vol ✓ ». Unlocks hotel step.';
COMMENT ON COLUMN my_trip_drafts.share_email IS
  'Lot F: email used only to send /trip/:token link (explicit consent).';
