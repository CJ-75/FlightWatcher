-- Mon voyage Lot E — conversion funnel events
-- Apply manually in Supabase SQL editor (never supabase db push).

CREATE TABLE IF NOT EXISTS my_trip_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_token TEXT NOT NULL,
    event TEXT NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_my_trip_events_token_created
    ON my_trip_events(draft_token, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_my_trip_events_event_created
    ON my_trip_events(event, created_at DESC);

COMMENT ON TABLE my_trip_events IS
  'Lot E: view | company_click | flight_booked_yes | flight_booked_no | hotel_checkout_open | hotel_paid | account_cta';

-- Service role only (API uses service client). No anon RLS policies.
ALTER TABLE my_trip_events ENABLE ROW LEVEL SECURITY;
