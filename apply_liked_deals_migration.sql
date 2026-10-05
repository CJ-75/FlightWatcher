-- Liked deals (user favorites for travel packs)
-- Apply manually in Supabase SQL editor (never supabase db push).

CREATE TABLE IF NOT EXISTS liked_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    deal_id TEXT NOT NULL,
    deal_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_liked_deals_user ON liked_deals(user_id);
CREATE INDEX IF NOT EXISTS idx_liked_deals_created ON liked_deals(created_at DESC);

ALTER TABLE liked_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own liked deals" ON liked_deals;
CREATE POLICY "Users see own liked deals"
    ON liked_deals FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own liked deals" ON liked_deals;
CREATE POLICY "Users insert own liked deals"
    ON liked_deals FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own liked deals" ON liked_deals;
CREATE POLICY "Users delete own liked deals"
    ON liked_deals FOR DELETE
    USING (auth.uid() = user_id);
