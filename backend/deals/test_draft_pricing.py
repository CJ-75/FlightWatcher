"""Server must never trust client pack prices on Mon voyage drafts."""
from __future__ import annotations

import unittest
from unittest.mock import patch

from deals.draft_pricing import trust_create_payload, trust_hotel_patch


class TrustCreatePayloadTests(unittest.TestCase):
    def test_deal_key_rebuilds_price_ignoring_client(self):
        deal = {
            "deal_key": "ORY-BCN-x",
            "origin_iata": "ORY",
            "destination": "BCN",
            "city": "Barcelone",
            "dates": {"outbound": "2026-11-06", "inbound": "2026-11-08"},
            "flight": {"price_pp": 80.0, "direct": True},
            "price_breakdown": {"flight_pp": 80.0},
            "hotel": {
                "id": "h1",
                "name": "Hotel Test",
                "public_hotel_price": 100.0,
            },
            "alt_hotels": [],
            "booking_url": "https://example.com",
        }
        with patch("deals.draft_pricing._load_deal", return_value=deal):
            out = trust_create_payload(
                None,
                {
                    "deal_key": "ORY-BCN-x",
                    "adults": 2,
                    "price_per_person": 1.0,  # attacker
                    "hotel": {"id": "h1", "public_hotel_price": 1.0},
                    "flight": {"price_pp": 1.0},
                },
            )
        self.assertEqual(out["price_per_person"], 130.0)  # 80 + 100/2
        self.assertEqual(out["price_breakdown"]["flight_pp"], 80.0)
        self.assertEqual(out["hotel"]["public_hotel_price"], 100.0)
        self.assertEqual(out["price_trust"], "server")
        # Lot A party euros (components rounded, then sum)
        bd = out["price_breakdown"]
        self.assertEqual(bd["flight_pp_eur"], 80)
        self.assertEqual(bd["flight_total_eur"], 160)
        self.assertEqual(bd["hotel_total_eur"], 100)
        self.assertEqual(bd["total_eur"], 260)
        self.assertEqual(bd["per_person_eur"], 130)
        self.assertEqual(bd["adults"], 2)

    def test_alt_hotel_id_from_deal(self):
        deal = {
            "deal_key": "k",
            "destination": "LIS",
            "dates": {"outbound": "2026-11-06", "inbound": "2026-11-08"},
            "flight": {"price_pp": 60.0},
            "price_breakdown": {"flight_pp": 60.0},
            "hotel": {"id": "a", "public_hotel_price": 200.0},
            "alt_hotels": [{"id": "b", "name": "Alt", "public_hotel_price": 80.0}],
        }
        with patch("deals.draft_pricing._load_deal", return_value=deal):
            out = trust_create_payload(
                None,
                {
                    "deal_key": "k",
                    "adults": 2,
                    "hotel": {"id": "b", "public_hotel_price": 999},
                    "price_per_person": 999,
                },
            )
        self.assertEqual(out["hotel"]["id"], "b")
        self.assertEqual(out["price_per_person"], 100.0)  # 60 + 40


class TrustHotelPatchTests(unittest.TestCase):
    def test_ignores_client_price_on_patch(self):
        deal = {
            "deal_key": "k",
            "flight": {"price_pp": 50.0},
            "price_breakdown": {"flight_pp": 50.0},
            "hotel": {"id": "a", "public_hotel_price": 120.0},
            "alt_hotels": [{"id": "b", "public_hotel_price": 60.0}],
        }
        row = {
            "deal_key": "k",
            "adults": 2,
            "dest_iata": "BCN",
            "out_date": "2026-11-06",
            "ret_date": "2026-11-08",
            "payload": {
                "deal_key": "k",
                "flight": {"price_pp": 50.0},
                "hotel": {"id": "a"},
                "price_per_person": 110.0,
            },
        }
        with patch("deals.draft_pricing._load_deal", return_value=deal):
            payload = trust_hotel_patch(None, row, {"id": "b", "public_hotel_price": 1})
        self.assertEqual(payload["price_per_person"], 80.0)  # 50 + 30
        self.assertEqual(payload["hotel"]["public_hotel_price"], 60.0)

    def test_rejects_unknown_hotel(self):
        row = {
            "deal_key": None,
            "adults": 2,
            "dest_iata": "BCN",
            "out_date": "2026-11-06",
            "ret_date": "2026-11-08",
            "payload": {"flight": {"price_pp": 40.0}},
        }
        with patch("deals.draft_pricing._load_deal", return_value=None):
            with patch(
                "deals.draft_pricing._resolve_hotel_from_rates", return_value=None
            ):
                with self.assertRaises(ValueError):
                    trust_hotel_patch(None, row, {"id": "ghost", "public_hotel_price": 1})


if __name__ == "__main__":
    unittest.main()
