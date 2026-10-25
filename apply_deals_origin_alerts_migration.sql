-- Deals v4 Lot E — weekly origin deal alerts (email, no account)
-- Apply manually in Supabase SQL editor (never supabase db push).

CREATE TABLE IF NOT EXISTS deal_origin_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    origin_iata TEXT NOT NULL,
    origin_label TEXT,
    locale TEXT NOT NULL DEFAULT 'fr',
    status TEXT NOT NULL DEFAULT 'active',  -- active | unsubscribed
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    last_sent_at TIMESTAMPTZ,
    UNIQUE (email, origin_iata)
);

CREATE INDEX IF NOT EXISTS idx_deal_origin_alerts_status
    ON deal_origin_alerts(status, origin_iata);

COMMENT ON TABLE deal_origin_alerts IS
  'v4 Lot E: Thursday digests of best deals from a departure city (Resend, no account).';
