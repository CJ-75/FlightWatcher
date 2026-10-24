-- Manual apply only (never npx supabase db push).
-- Drop legacy Deals caches outside the Search → Mon voyage + community ~30 flow.

DROP TABLE IF EXISTS deal_calendar_cache CASCADE;
DROP TABLE IF EXISTS deal_flight_cache CASCADE;
DROP TABLE IF EXISTS hotel_upsell_cache CASCADE;
