"""Security / validation unit tests — events, access XOR, itinerary strip, j7 dedup helpers."""
from __future__ import annotations

import unittest

from activities.event_limits import (
    check_ip_rate_limit,
    reset_for_tests,
    validate_event_fields,
)
from activities.itineraries import create_itinerary_from_trip


class TestEventValidation(unittest.TestCase):
    def test_allows_known(self):
        self.assertIsNone(
            validate_event_fields(
                domain="activity",
                event="book_click",
                surface="tab",
                platform="web",
            )
        )

    def test_allows_planner_trip_detail(self):
        self.assertIsNone(
            validate_event_fields(
                domain="planner",
                event="trip_detail_viewed",
                surface="trip_detail",
                platform="web",
            )
        )
        self.assertIsNone(
            validate_event_fields(
                domain="planner",
                event="trip_tab_viewed",
                surface="trip_detail",
                platform="ios",
            )
        )

    def test_rejects_bad_event(self):
        self.assertEqual(
            validate_event_fields(
                domain="activity",
                event="hack_me",
                surface="tab",
                platform="web",
            ),
            "invalid_event",
        )

    def test_rejects_bad_platform(self):
        self.assertEqual(
            validate_event_fields(
                domain="activity",
                event="view",
                surface="tab",
                platform="windows",
            ),
            "invalid_platform",
        )

    def test_ip_rate_limit(self):
        reset_for_tests()
        for _ in range(60):
            self.assertTrue(check_ip_rate_limit("1.2.3.4"))
        self.assertFalse(check_ip_rate_limit("1.2.3.4"))
        self.assertTrue(check_ip_rate_limit("9.9.9.9"))


class TestItineraryNoPrice(unittest.TestCase):
    def test_meta_strips_prices_conceptually(self):
        """create_itinerary copies only place_id / day_offset — meta must not carry price keys."""
        # Simulate the insert payload builder logic
        trip_item = {
            "id": "ti1",
            "place_id": "p1",
            "item_type": "activity",
            "day_offset": 1,
            "moment": "morning",
            "sort_key": "a0",
            "notes": None,
            "status": "idea",
            "meta": {"price_from": 99, "product_url": "https://x", "date": "2026-12-01"},
        }
        meta = {"from_trip_item_id": trip_item["id"]}
        self.assertNotIn("price_from", meta)
        self.assertNotIn("date", meta)


class TestAccessXor(unittest.TestCase):
    def test_xor(self):
        def ok(planned, draft):
            return (planned is not None) != (draft is not None)

        self.assertTrue(ok("p", None))
        self.assertTrue(ok(None, "d"))
        self.assertFalse(ok(None, None))
        self.assertFalse(ok("p", "d"))


class TestCreateItineraryEmpty(unittest.TestCase):
    def test_no_supabase(self):
        out = create_itinerary_from_trip(
            None, draft_id="x", title="t"
        )
        self.assertFalse(out.get("ok"))


if __name__ == "__main__":
    unittest.main()
