-- Travel workspaces — provenance Planner -> MyTrip -> hotel booking.
-- Apply manually in Supabase SQL Editor. Never run automatically.

BEGIN;

ALTER TABLE my_trip_drafts
    ADD COLUMN IF NOT EXISTS source_planned_trip_id UUID
        REFERENCES planned_trips(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_proposal_id UUID
        REFERENCES trip_proposals(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_kind TEXT;

ALTER TABLE my_trip_drafts
    DROP CONSTRAINT IF EXISTS my_trip_drafts_source_kind_check;

ALTER TABLE my_trip_drafts
    ADD CONSTRAINT my_trip_drafts_source_kind_check
    CHECK (
        source_kind IS NULL
        OR source_kind IN ('planner', 'deal', 'legacy_unlinked')
    );

-- Existing rows keep their data untouched and are explicitly marked as unlinked.
UPDATE my_trip_drafts
SET source_kind = 'legacy_unlinked'
WHERE source_kind IS NULL
  AND source_planned_trip_id IS NULL
  AND source_proposal_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_my_trip_drafts_source_trip
    ON my_trip_drafts(source_planned_trip_id)
    WHERE source_planned_trip_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_my_trip_drafts_source_proposal
    ON my_trip_drafts(source_proposal_id)
    WHERE source_proposal_id IS NOT NULL;

-- One personal execution draft per accepted proposal and authenticated user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_my_trip_drafts_proposal_user
    ON my_trip_drafts(source_proposal_id, user_id)
    WHERE source_proposal_id IS NOT NULL
      AND user_id IS NOT NULL
      AND status <> 'archived';

ALTER TABLE hotel_bookings
    ADD COLUMN IF NOT EXISTS draft_id UUID
        REFERENCES my_trip_drafts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hotel_bookings_draft_id
    ON hotel_bookings(draft_id)
    WHERE draft_id IS NOT NULL;

-- Exact token equality is the only safe automatic historical link.
UPDATE hotel_bookings AS booking
SET draft_id = draft.id
FROM my_trip_drafts AS draft
WHERE booking.draft_id IS NULL
  AND booking.draft_token IS NOT NULL
  AND draft.draft_token = booking.draft_token;

COMMENT ON COLUMN my_trip_drafts.source_planned_trip_id IS
  'Collaborative Planner that originated this personal execution draft.';
COMMENT ON COLUMN my_trip_drafts.source_proposal_id IS
  'Accepted flight proposal used to create this personal execution draft.';
COMMENT ON COLUMN my_trip_drafts.source_kind IS
  'Origin of the draft: planner, deal, or legacy_unlinked.';
COMMENT ON COLUMN hotel_bookings.draft_id IS
  'Stable relation to my_trip_drafts; draft_token remains for guest access compatibility.';

COMMIT;
