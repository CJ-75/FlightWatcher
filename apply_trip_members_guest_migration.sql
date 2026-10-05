-- Trip members: allow guest placeholders (no app account yet)
-- Apply manually in Supabase SQL editor.

ALTER TABLE trip_members DROP CONSTRAINT IF EXISTS trip_members_status_check;
ALTER TABLE trip_members
    ADD CONSTRAINT trip_members_status_check
    CHECK (status IN ('joined', 'guest'));

-- Guests must have a display name; joined members should usually have a user_id
ALTER TABLE trip_members DROP CONSTRAINT IF EXISTS trip_members_identity_check;
ALTER TABLE trip_members
    ADD CONSTRAINT trip_members_identity_check
    CHECK (
        (status = 'guest' AND display_name IS NOT NULL AND length(trim(display_name)) > 0)
        OR (status = 'joined')
    );
