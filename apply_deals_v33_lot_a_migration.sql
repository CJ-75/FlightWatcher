-- v3.3 Lot A — photos on hotel_pool (manual apply; never npx supabase db push)
-- main_photo / thumbnail already exist on hotel_pool (apply_liteapi_deals_migration.sql).
-- Index to find rows still missing a card photo after bootstrap / backfill.

CREATE INDEX IF NOT EXISTS idx_hotel_pool_missing_photo
    ON hotel_pool (destination_id)
    WHERE main_photo IS NULL OR btrim(main_photo) = '';
