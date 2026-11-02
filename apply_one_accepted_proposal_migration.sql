-- One accepted flight proposal per Planner trip.
-- Apply manually in Supabase SQL Editor. Never run automatically.

BEGIN;

-- Demote duplicates before enforcing uniqueness (keep newest accepted).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY trip_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM trip_proposals
  WHERE status = 'accepted'
)
UPDATE trip_proposals p
SET status = 'rejected'
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_trip_proposals_one_accepted
  ON trip_proposals (trip_id)
  WHERE status = 'accepted';

COMMENT ON INDEX uniq_trip_proposals_one_accepted IS
  'At most one accepted scanned flight per planned trip (boarding pass source).';

COMMIT;
