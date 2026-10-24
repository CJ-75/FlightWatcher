"""Unit tests for hotel rates scoring + SSP (no network)."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from deals.hotel_scoring import (
    breakfast_bonus,
    build_candidates,
    extract_hotels_from_rates,
)
from deals.hotel_rates import is_due
from deals.pricing import public_hotel_price


def _rates_payload():
    return {
        "data": [
            {
                "hotelId": "h1",
                "roomTypes": [
                    {
                        "offerId": "off-ro",
                        "boardType": "RO",
                        "offerRetailRate": {"amount": 100},
                        "suggestedSellingPrice": {
                            "amount": 120,
                            "source": "booking.com",
                        },
                        "retailRate": {
                            "taxesAndFees": [{"amount": 10, "included": False}]
                        },
                        "cancellationPolicies": {"refundableTag": "NRFN"},
                        "rates": [{"boardType": "RO", "boardName": "Room only"}],
                    },
                    {
                        "offerId": "off-bi",
                        "boardType": "BI",
                        "offerRetailRate": {"amount": 110},
                        "suggestedSellingPrice": {"amount": 130, "source": "booking.com"},
                        "retailRate": {
                            "taxesAndFees": [{"amount": 10, "included": False}]
                        },
                        "cancellationPolicies": {"refundableTag": "RFN"},
                        "rates": [{"boardType": "BI", "boardName": "Breakfast"}],
                    },
                ],
            },
            {
                "hotelId": "h2",
                "roomTypes": [
                    {
                        "offerId": "off-h2",
                        "boardType": "RO",
                        "offerRetailRate": [{"amount": 200}],
                        "suggestedSellingPrice": [{"amount": 200}],
                        "cancellationPolicies": {"refundableTag": "RFN"},
                    }
                ],
            },
            {
                "hotelId": "h3-not-in-pool",
                "roomTypes": [
                    {
                        "offerId": "x",
                        "boardType": "RO",
                        "offerRetailRate": {"amount": 50},
                        "suggestedSellingPrice": {"amount": 50},
                    }
                ],
            },
        ]
    }


POOL = {
    "h1": {
        "hotel_id": "h1",
        "name": "Central",
        "stars": 4,
        "rating": 9.0,
        "review_count": 500,
        "distance_m": 400,
        "has_24h_reception": True,
        "main_photo": "https://example.com/h1.jpg",
    },
    "h2": {
        "hotel_id": "h2",
        "name": "Far",
        "stars": 3,
        "rating": 8.1,
        "review_count": 220,
        "distance_m": 1800,
        "has_24h_reception": False,
        "main_photo": "https://example.com/h2.jpg",
    },
}


class TestExtract(unittest.TestCase):
    def test_extract_hotels(self):
        hotels = extract_hotels_from_rates(_rates_payload())
        self.assertEqual(len(hotels), 3)


class TestBuildCandidates(unittest.TestCase):
    def test_top_and_ssp(self):
        top = build_candidates(
            _rates_payload(),
            POOL,
            pool_radius_m=2000,
            adults=2,
            late_arrival=False,
            top_n=3,
        )
        self.assertGreaterEqual(len(top), 1)
        self.assertLessEqual(len(top), 2)  # only h1,h2 in pool
        # public >= SSP
        for c in top:
            if c.get("ssp_total") is not None and c.get("retail_total") is not None:
                self.assertGreaterEqual(
                    c["public_hotel_price"],
                    max(c["ssp_total"], c["retail_total"]) - 0.01,
                )
        # h1 should rank above h2 (better rating, closer, cheaper)
        self.assertEqual(top[0]["hotel_id"], "h1")
        self.assertEqual(top[0]["public_hotel_price"], 130.0)  # best scored BI offer SSP
        self.assertTrue(top[0].get("refundable") or top[0]["board"] in ("BI", "RO"))

    def test_late_penalty_without_24h(self):
        top_late = build_candidates(
            _rates_payload(),
            POOL,
            pool_radius_m=2000,
            adults=2,
            late_arrival=True,
            top_n=3,
        )
        h2 = next(c for c in top_late if c["hotel_id"] == "h2")
        # score should be reduced vs no-late run
        top_ok = build_candidates(
            _rates_payload(),
            POOL,
            pool_radius_m=2000,
            adults=2,
            late_arrival=False,
            top_n=3,
        )
        h2_ok = next(c for c in top_ok if c["hotel_id"] == "h2")
        self.assertLess(h2["score"], h2_ok["score"])


class TestBreakfastBonus(unittest.TestCase):
    def test_within_surcharge(self):
        offers = [
            {"board": "RO", "public_hotel_price": 100},
            {"board": "BI", "public_hotel_price": 120},  # +10€/pers for 2 adults
        ]
        b = breakfast_bonus(offers, offers[1], adults=2, bonus=0.15)
        self.assertAlmostEqual(b, 0.15)


class TestIsDue(unittest.TestCase):
    def test_missing_row(self):
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )
        self.assertTrue(
            is_due(sb, destination_id="d", window_id="w", adults=2)
        )

    def test_expired(self):
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"expires_at": past, "status": "ok"}]
        )
        self.assertTrue(
            is_due(sb, destination_id="d", window_id="w", adults=2)
        )

    def test_fresh(self):
        future = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"expires_at": future, "status": "ok"}]
        )
        self.assertFalse(
            is_due(sb, destination_id="d", window_id="w", adults=2)
        )


class TestSspPublic(unittest.TestCase):
    def test_never_below_ssp(self):
        price, missing = public_hotel_price(80, 100)
        self.assertEqual(price, 100)
        self.assertFalse(missing)


if __name__ == "__main__":
    unittest.main()
