"""v3.3 unit tests — pool photos, FREE windows, grace, soft fill, health, smoke compare."""
from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from deals.health import evaluate_invariants
from deals.pool_photos import extract_main_photo, overlay_pool_photos
from deals.refresh_deal_rates import free_window
from deals.smoke_price import compare_prices
from deals.upsell import _rates_still_usable


class TestPoolPhotos(unittest.TestCase):
    def test_extract_from_raw_images(self):
        row = {
            "main_photo": None,
            "raw": {"hotelImages": [{"url": "https://cdn.example/a.jpg"}]},
        }
        self.assertEqual(extract_main_photo(row), "https://cdn.example/a.jpg")

    def test_overlay_prefers_pool(self):
        hotels = [
            {
                "hotel_id": "H1",
                "photo": "https://rates.example/stale.jpg",
                "public_hotel_price": 100,
            }
        ]
        out = overlay_pool_photos(hotels, {"H1": "https://pool.example/stable.jpg"})
        self.assertEqual(out[0]["photo"], "https://pool.example/stable.jpg")
        self.assertEqual(out[0]["public_hotel_price"], 100)


class TestFreeWindow(unittest.TestCase):
    def test_id_stable(self):
        from datetime import date

        w = free_window(date(2026, 11, 3), date(2026, 11, 6))
        self.assertEqual(w["kind"], "FREE")
        self.assertEqual(w["id"], "FREE-2026-11-03-2026-11-06")
        self.assertEqual(w["nights"], 3)


class TestStaleGrace(unittest.TestCase):
    def test_within_24h_ok(self):
        now = datetime(2026, 10, 24, 12, tzinfo=timezone.utc)
        exp = (now - timedelta(hours=2)).isoformat()
        row = {
            "status": "ok",
            "expires_at": exp,
            "top": [{"hotel_id": "x", "public_hotel_price": 80}],
        }
        with patch("deals.upsell._now", return_value=now):
            with patch.dict(os.environ, {"DEALS_RATES_STALE_GRACE_H": "24"}):
                self.assertTrue(_rates_still_usable(row))

    def test_beyond_24h_rejected(self):
        now = datetime(2026, 10, 24, 12, tzinfo=timezone.utc)
        exp = (now - timedelta(hours=30)).isoformat()
        row = {
            "status": "ok",
            "expires_at": exp,
            "top": [{"hotel_id": "x", "public_hotel_price": 80}],
        }
        with patch("deals.upsell._now", return_value=now):
            with patch.dict(os.environ, {"DEALS_RATES_STALE_GRACE_H": "24"}):
                self.assertFalse(_rates_still_usable(row))


class TestSoftFillPricing(unittest.TestCase):
    def test_pool_only_hotel_not_in_total(self):
        from deals.community_list import row_to_travel_deal

        row = {
            "deal_key": "BVA-LIS-2026-11-01-2026-11-03",
            "origin_iata": "BVA",
            "dest_iata": "LIS",
            "out_date": "2026-11-01",
            "ret_date": "2026-11-03",
            "nights": 2,
            "flight_snapshot": {
                "price_pp_eur": 40,
                "city_name": "Lisbonne",
                "carrier": "FR",
            },
            "baseline_snapshot": {"soft_fill": True},
            "hotel_top3": [
                {
                    "hotel_id": "H1",
                    "name": "Pool Hôtel",
                    "photo": "https://pool.example/x.jpg",
                    # no public_hotel_price → soft fill
                }
            ],
            "verification_level": "cached",
        }
        with patch.dict(os.environ, {"DEALS_SOFT_FILL_MODE": "flight_only"}):
            deal = row_to_travel_deal(row, adults=2, baselines_fresh=True)
        self.assertEqual(deal["price_per_person"], 40)
        self.assertTrue(deal["flags"].get("soft_fill"))
        self.assertFalse(deal["flags"].get("hotel_bookable"))
        self.assertIn("hôtel à choisir", (deal["flags"].get("price_label") or "").lower())


class TestHealthInvariants(unittest.TestCase):
    def test_red_when_photo_low(self):
        with patch.dict(
            os.environ,
            {
                "SEED_PRIORITY_ORIGINS": "BVA",
                "DEALS_HEALTH_MIN_DEALS_WITH_PHOTO": "8",
            },
        ):
            out = evaluate_invariants(
                deals_with_photo_by_origin={"BVA": 3},
                fresh_hotel_rate_share=0.9,
                baselines_age_h=10.0,
                ryanair_403_share_1h=0.01,
                job_lag={},
            )
        self.assertFalse(out["ok"])
        self.assertGreaterEqual(out["red_count"], 1)


class TestSmokeCompare(unittest.TestCase):
    def test_detects_drift(self):
        ok = compare_prices(100, 100, tol_pct=5)
        self.assertTrue(ok["ok"])
        bad = compare_prices(100, 120, tol_pct=5)
        self.assertFalse(bad["ok"])


if __name__ == "__main__":
    unittest.main()
