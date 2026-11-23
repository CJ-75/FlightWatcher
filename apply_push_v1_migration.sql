-- Push V1 — prefs, send log, presence (apply manually in Supabase SQL editor).
-- Never: npx supabase db push

ALTER TABLE push_tokens
  ADD COLUMN IF NOT EXISTS notif_group BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notif_pops BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN push_tokens.notif_group IS 'V1: push groupe (#1–4)';
COMMENT ON COLUMN push_tokens.notif_pops IS 'V1: push Pops et jour J (#5–6)';

CREATE TABLE IF NOT EXISTS push_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  channel TEXT NOT NULL DEFAULT 'push',
  kind TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  title TEXT,
  body TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_send_log_user_day
  ON push_send_log (user_id, kind, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_send_log_entity
  ON push_send_log (kind, entity_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS push_presence (
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('trip', 'pop')),
  entity_id TEXT NOT NULL,
  last_open_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_push_presence_open
  ON push_presence (user_id, entity_type, entity_id, last_open_at DESC);

-- Pending invite nudge (#3): mark guest row when invited + when nudged
ALTER TABLE trip_members
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_nudge_sent_at TIMESTAMPTZ;

UPDATE trip_members
SET invited_at = COALESCE(invited_at, joined_at, NOW())
WHERE invited_at IS NULL AND status = 'guest';

-- Batch window for #1 (joined names pending flush)
CREATE TABLE IF NOT EXISTS push_group_join_batch (
  trip_id UUID NOT NULL,
  organizer_id UUID NOT NULL,
  joiner_names TEXT[] NOT NULL DEFAULT '{}',
  first_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  flush_after TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (trip_id)
);
