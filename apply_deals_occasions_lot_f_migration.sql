-- Deals v4 Occasions Lot F — seasonal notifs (email + Expo push)
-- Apply manually in Supabase SQL editor (never supabase db push).

CREATE TABLE IF NOT EXISTS deal_occasion_alert_sends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel TEXT NOT NULL CHECK (channel IN ('email', 'push')),
    recipient TEXT NOT NULL,
    occasion_slug TEXT NOT NULL,
    origin_iata TEXT NOT NULL DEFAULT '',
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deal_count INT NOT NULL DEFAULT 0,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_occasion_alert_lookup
    ON deal_occasion_alert_sends (channel, recipient, occasion_slug, origin_iata, sent_at DESC);

CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    token TEXT NOT NULL,
    platform TEXT,
    locale TEXT DEFAULT 'fr',
    origin_iata TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_active
    ON push_tokens (active) WHERE active = TRUE;

COMMENT ON TABLE deal_occasion_alert_sends IS
  'v4 Lot F: ≤1 send / week / recipient / occasion / origin.';
COMMENT ON TABLE push_tokens IS
  'v4 Lot F: Expo push tokens for seasonal occasion digests.';
