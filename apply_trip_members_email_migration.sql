-- Trip members: store email for future Resend invites
-- Apply manually in Supabase SQL editor (never npx supabase db push).

ALTER TABLE trip_members
    ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN trip_members.email IS 'Guest invite email';
