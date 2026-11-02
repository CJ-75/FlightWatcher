-- Planner delete must never remove personal reservations.
-- Detaches draft provenance FKs to ON DELETE SET NULL (idempotent).
-- Apply manually in Supabase SQL Editor. Never run automatically.

BEGIN;

-- my_trip_drafts.source_planned_trip_id
ALTER TABLE my_trip_drafts
    DROP CONSTRAINT IF EXISTS my_trip_drafts_source_planned_trip_id_fkey;

ALTER TABLE my_trip_drafts
    ADD CONSTRAINT my_trip_drafts_source_planned_trip_id_fkey
    FOREIGN KEY (source_planned_trip_id)
    REFERENCES planned_trips(id)
    ON DELETE SET NULL;

-- my_trip_drafts.source_proposal_id
ALTER TABLE my_trip_drafts
    DROP CONSTRAINT IF EXISTS my_trip_drafts_source_proposal_id_fkey;

ALTER TABLE my_trip_drafts
    ADD CONSTRAINT my_trip_drafts_source_proposal_id_fkey
    FOREIGN KEY (source_proposal_id)
    REFERENCES trip_proposals(id)
    ON DELETE SET NULL;

-- hotel_bookings.draft_id stays; never cascade-delete bookings with a planner.
ALTER TABLE hotel_bookings
    DROP CONSTRAINT IF EXISTS hotel_bookings_draft_id_fkey;

ALTER TABLE hotel_bookings
    ADD CONSTRAINT hotel_bookings_draft_id_fkey
    FOREIGN KEY (draft_id)
    REFERENCES my_trip_drafts(id)
    ON DELETE SET NULL;

COMMENT ON CONSTRAINT my_trip_drafts_source_planned_trip_id_fkey ON my_trip_drafts IS
  'Deleting a Planner nulls provenance; drafts/bookings are kept.';

COMMIT;
