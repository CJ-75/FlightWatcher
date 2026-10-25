"""Unit tests for cache-join deal assembly (no network)."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from deals.deal_assemble import (
    assemble_deal,
    assemble_deals_from_caches,
    make_deal_key,
    parse_deal_key,
    pick_flight_for_origin,
)
from deals.pricing import price_per_person


NOW = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)
FUTURE = (NOW + timedelta(hours=6)).isoformat()
PAST = (NOW - timedelta(hours=1)).isoformat()

DEST = {
    "id": "dest-lis",
    "slug": "lisbonne",
    "city_name": "Lisbonne",
    "country_code": "PT",
    "iata_arrival": "LIS",
    "active": True,
}
WINDOW = {
    "id": "2026-W44-FRI_SUN",
    "kind": "FRI_SUN",
    "checkin": "2026-10-30",
    "checkout": "2026-11-01",
    "nights": 2,
}


def _flight(origin: str, price: float, *, expired: bool = False) -> dict:
    return {
        "origin_iata": origin,
        "destination_id": "dest-lis",
        "iata_arrival": "LIS",
        "window_id": WINDOW["id"],
        "checkin": WINDOW["checkin"],
        "checkout": WINDOW["checkout"],
        "price_pp": price,
        "direct": True,
        "late_arrival": False,
        "late_departure": False,
        "status": "ok",
        "expires_at": PAST if expired else FUTURE,
        "fetched_at": NOW.isoformat(),
        "flight": {
            "aller": {
                "origin": origin,
                "destination": "LIS",
                "departureTime": "2026-10-30T10:00:00",
            },
            "retour": {
                "origin": "LIS",
                "destination": origin,
                "departureTime": "2026-11-01T16:00:00",
            },
            "prix_total": price,
            "airline": "FR",
            "provider": "ryanair",
            "booking_url": "https://www.ryanair.com",
        },
    }


RATES = {
    "destination_id": "dest-lis",
    "window_id": WINDOW["id"],
    "adults": 2,
    "status": "ok",
    "expires_at": FUTURE,
    "top": [
        {
            "hotel_id": "h1",
            "name": "Lisboa Central",
            "stars": 4,
            "rating": 9.0,
            "review_count": 400,
            "distance_m": 300,
            "photo": "https://example.com/h1.jpg",
            "board": "BI",
            "refundable": True,
            "public_hotel_price": 140,
            "excluded_fees": 8,
            "ssp_source": "booking.com",
            "offer_id": "off1",
        },
        {
            "hotel_id": "h2",
            "name": "Alt Hotel",
            "stars": 3,
            "rating": 8.2,
            "distance_m": 800,
            "board": "RO",
            "refundable": False,
            "public_hotel_price": 120,
            "excluded_fees": 0,
        },
    ],
}


class TestDealKey(unittest.TestCase):
    def test_roundtrip(self):
        key = make_deal_key("BVA", "LIS", "2026-W44-FRI_SUN", 2)
        self.assertEqual(key, "BVA-LIS-2026-W44-FRI_SUN-2")
        parsed = parse_deal_key(key)
        self.assertEqual(parsed["origin"], "BVA")
        self.assertEqual(parsed["dest_iata"], "LIS")
        self.assertEqual(parsed["window_id"], "2026-W44-FRI_SUN")
        self.assertEqual(parsed["adults"], 2)

    def test_community_aN_suffix(self):
        key = "BVA-BGY-2026-11-06-2026-11-08-a2"
        parsed = parse_deal_key(key)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["origin"], "BVA")
        self.assertEqual(parsed["dest_iata"], "BGY")
        self.assertEqual(parsed["window_id"], "2026-11-06-2026-11-08")
        self.assertEqual(parsed["adults"], 2)

    def test_looks_community_deal_key(self):
        from deals.deal_assemble import _looks_community_deal_key

        self.assertTrue(_looks_community_deal_key("BVA-BGY-2026-11-06-2026-11-08-a2"))
        self.assertFalse(_looks_community_deal_key("BVA-LIS-2026-W44-FRI_SUN-2"))


class TestAssembleOne(unittest.TestCase):
    def test_price_pp(self):
        deal = assemble_deal(
            dest=DEST,
            window=WINDOW,
            hotel_top=RATES["top"],
            flight_row=_flight("BVA", 60),
            adults=2,
        )
        self.assertIsNotNone(deal)
        expected = price_per_person(60, 140, 2)
        self.assertAlmostEqual(deal["price_per_person"], expected)
        self.assertEqual(deal["provider"], "liteapi")
        self.assertEqual(deal["deal_key"], "BVA-LIS-2026-W44-FRI_SUN-2")
        self.assertEqual(len(deal["alt_hotels"]), 1)
        self.assertEqual(deal["price_breakdown"]["excluded_fees"], 8)
        self.assertIn("Deux réservations", deal["highlights"][-1])


class TestJoin(unittest.TestCase):
    def test_origin_personalization(self):
        deals = assemble_deals_from_caches(
            destinations=[DEST],
            windows=[WINDOW],
            rates_rows=[RATES],
            flight_rows=[_flight("BVA", 60), _flight("ORY", 45)],
            origin="ORY",
            adults=2,
            now=NOW,
        )
        self.assertEqual(len(deals), 1)
        self.assertEqual(deals[0]["origin_iata"], "ORY")
        self.assertAlmostEqual(deals[0]["flight"]["price_pp"], 45)

    def test_best_origin_when_absent(self):
        deals = assemble_deals_from_caches(
            destinations=[DEST],
            windows=[WINDOW],
            rates_rows=[RATES],
            flight_rows=[_flight("BVA", 60), _flight("MRS", 40)],
            origin=None,
            adults=2,
            now=NOW,
        )
        self.assertEqual(deals[0]["origin_iata"], "MRS")

    def test_max_pp_filter(self):
        deals = assemble_deals_from_caches(
            destinations=[DEST],
            windows=[WINDOW],
            rates_rows=[RATES],
            flight_rows=[_flight("BVA", 60)],
            adults=2,
            max_pp=100,  # 60 + 140/2 = 130 → filtered
            now=NOW,
        )
        self.assertEqual(deals, [])

    def test_expired_rates_skipped(self):
        expired_rates = {**RATES, "expires_at": PAST}
        deals = assemble_deals_from_caches(
            destinations=[DEST],
            windows=[WINDOW],
            rates_rows=[expired_rates],
            flight_rows=[_flight("BVA", 60)],
            adults=2,
            now=NOW,
        )
        self.assertEqual(deals, [])

    def test_window_kind_filter(self):
        deals = assemble_deals_from_caches(
            destinations=[DEST],
            windows=[WINDOW],
            rates_rows=[RATES],
            flight_rows=[_flight("BVA", 60)],
            adults=2,
            window_kind="SAT_MON",
            now=NOW,
        )
        self.assertEqual(deals, [])


class TestPickFlight(unittest.TestCase):
    def test_missing_origin(self):
        self.assertIsNone(
            pick_flight_for_origin([_flight("BVA", 50)], origin="CDG")
        )


if __name__ == "__main__":
    unittest.main()
