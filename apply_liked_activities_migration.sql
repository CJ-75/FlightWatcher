-- Liked activities (user favorites for Viator products)
-- Apply manually in Supabase SQL editor (never supabase db push).

CREATE TABLE IF NOT EXISTS liked_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_code TEXT NOT NULL,
    activity_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, product_code)
);

CREATE INDEX IF NOT EXISTS idx_liked_activities_user ON liked_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_liked_activities_created ON liked_activities(created_at DESC);

ALTER TABLE liked_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own liked activities" ON liked_activities;
CREATE POLICY "Users see own liked activities"
    ON liked_activities FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own liked activities" ON liked_activities;
CREATE POLICY "Users insert own liked activities"
    ON liked_activities FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own liked activities" ON liked_activities;
CREATE POLICY "Users delete own liked activities"
    ON liked_activities FOR DELETE
    USING (auth.uid() = user_id);

INSERT INTO schema_migrations (id)
VALUES ('apply_liked_activities_migration.sql')
ON CONFLICT (id) DO NOTHING;
