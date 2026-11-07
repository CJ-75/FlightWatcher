-- FlightWatcher — indicateurs Path trip detail (CADRE §4)
-- Lecture seule. Ventiler par meta->>'variant' (v1|v2) et semaine.
-- Prérequis : events domain=planner avec meta.variant renseigné.

-- 1) Progression du voyage : % créés → flight_selected sous 7 jours
-- (approximé via events trip_detail_viewed en phase flight_selected / booked
--  vs créations — adapte si tu as planned_trips.created_at en SQL)
/*
WITH created AS (
  SELECT id, created_at
  FROM planned_trips
  WHERE created_at >= now() - interval '60 days'
),
reached AS (
  SELECT DISTINCT e.planned_trip_id AS id
  FROM events e
  WHERE e.domain = 'planner'
    AND e.event = 'trip_detail_viewed'
    AND e.meta->>'phase' IN ('flight_selected', 'composing', 'booked')
    AND e.created_at <= (
      SELECT c.created_at + interval '7 days' FROM created c WHERE c.id = e.planned_trip_id
    )
)
SELECT
  date_trunc('week', c.created_at) AS week,
  count(*) AS created,
  count(r.id) AS reached_flight_selected,
  round(100.0 * count(r.id) / nullif(count(*), 0), 1) AS pct
FROM created c
LEFT JOIN reached r ON r.id = c.id
GROUP BY 1
ORDER BY 1 DESC;
*/

-- 2) Clics de réservation par voyage vu (variant)
SELECT
  date_trunc('week', created_at) AS week,
  meta->>'variant' AS variant,
  count(*) FILTER (WHERE event = 'trip_partner_booking_clicked') AS booking_clicks,
  count(DISTINCT planned_trip_id) FILTER (WHERE event = 'trip_detail_viewed') AS trips_viewed,
  round(
    1.0 * count(*) FILTER (WHERE event = 'trip_partner_booking_clicked')
      / nullif(count(DISTINCT planned_trip_id) FILTER (WHERE event = 'trip_detail_viewed'), 0),
    2
  ) AS clicks_per_viewed_trip
FROM events
WHERE domain = 'planner'
  AND created_at >= now() - interval '60 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 3) Invitations acceptées
SELECT
  date_trunc('week', created_at) AS week,
  meta->>'variant' AS variant,
  count(*) FILTER (WHERE event = 'trip_invite_opened') AS opened,
  count(*) FILTER (WHERE event = 'trip_invite_joined') AS joined,
  round(
    100.0 * count(*) FILTER (WHERE event = 'trip_invite_joined')
      / nullif(count(*) FILTER (WHERE event = 'trip_invite_opened'), 0),
    1
  ) AS join_rate_pct
FROM events
WHERE domain = 'planner'
  AND event IN ('trip_invite_opened', 'trip_invite_joined')
  AND created_at >= now() - interval '60 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 4) Programme rempli (au moins un trip_item_placed)
SELECT
  date_trunc('week', created_at) AS week,
  meta->>'variant' AS variant,
  count(DISTINCT planned_trip_id) AS trips_with_placed_item
FROM events
WHERE domain = 'planner'
  AND event = 'trip_item_placed'
  AND created_at >= now() - interval '60 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- Rollback rule: if progression or booking clicks drop >10% for 2 weeks after
-- full v2 activation, set TRIP_DETAIL_V2=false (no redeploy required).
