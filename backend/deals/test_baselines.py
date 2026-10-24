"""D3 unit tests — baselines + eligibility helpers."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from deals.baselines import (
    build_baselines_from_rows,
    compute_baseline_stats,
    discount_pct_vs_usual,
    horizon_bucket,
    is_good_price,
)
from deals.community_list import badge_for_baseline
from deals.promote import apply_diversity, deal_score, is_fresh_enough


class TestHorizon(unittest.TestCase):
    def test_buckets(self):
        now = datetime(2026, 10, 24, tzinfo=timezone.utc)
        self.assertEqual(horizon_bucket("2026-10-30", now=now), "le14")
        self.assertEqual(horizon_bucket("2026-11-20", now=now), "d15_45")
        self.assertEqual(horizon_bucket("2026-12-20", now=now), "d46_120")


class TestBaselineStats(unittest.TestCase):
    def test_unreliable_small_sample(self):
        stats = compute_baseline_stats([80, 90, 100], 3)
        self.assertFalse(stats["reliable"])
        self.assertEqual(stats["n_obs"], 3)

    def test_reliable(self):
        prices = [50 + (i % 40) for i in range(40)]
        stats = compute_baseline_stats(prices, 10)
        self.assertTrue(stats["reliable"])
        self.assertIsNotNone(stats["median"])

    def test_good_price(self):
        bl = {"reliable": True, "p20": 70, "median": 100, "baseline_kind": "observed"}
        self.assertTrue(is_good_price(65, bl))
        self.assertTrue(is_good_price(70, bl))
        self.assertFalse(is_good_price(90, bl))
        self.assertFalse(is_good_price(200, bl, max_flight_pp=120))

    def test_discount_and_badge(self):
        bl = {
            "reliable": True,
            "median": 100,
            "p20": 70,
            "baseline_kind": "observed",
            "discount_pct": 32.0,
        }
        self.assertEqual(discount_pct_vs_usual(68, bl), 32.0)
        badge = badge_for_baseline(bl)
        self.assertIn("Vol", badge["label"])
        self.assertEqual(badge["scope"], "flight")
        soft = badge_for_baseline({"baseline_kind": "estimated"})
        self.assertEqual(soft["label"], "Très bon prix")


class TestBuildBaselines(unittest.TestCase):
    def test_groups(self):
        now = datetime(2026, 10, 24, tzinfo=timezone.utc)
        rows = []
        for i in range(35):
            rows.append(
                {
                    "origin_iata": "BVA",
                    "served_city_id": "city-1",
                    "trip_type": "WEEKEND",
                    "out_date": (now + timedelta(days=10 + (i % 10))).date().isoformat(),
                    "price_pp_eur": 60 + i,
                    "observed_at": (now - timedelta(days=i % 20)).isoformat(),
                }
            )
        out = build_baselines_from_rows(rows, now=now)
        self.assertGreaterEqual(len(out), 1)
        self.assertEqual(out[0]["origin_iata"], "BVA")


class TestPromoteHelpers(unittest.TestCase):
    def test_fresh(self):
        now = datetime(2026, 10, 24, 12, tzinfo=timezone.utc)
        recent = (now - timedelta(hours=2)).isoformat()
        self.assertTrue(
            is_fresh_enough(recent, "2026-11-10", tau_h=6, tau_short_h=3, now=now)
        )
        old = (now - timedelta(hours=10)).isoformat()
        self.assertFalse(
            is_fresh_enough(old, "2026-11-10", tau_h=6, tau_short_h=3, now=now)
        )

    def test_score_and_diversity(self):
        bl = {"median": 100, "reliable": True}
        s = deal_score(
            price_pp=60,
            baseline=bl,
            age_hours=1,
            tau_h=6,
            distinct_searches_7d=10,
            direct=True,
            arrival_ok=True,
            has_hotel=True,
        )
        self.assertGreater(s, 0.5)
        rows = [
            {"served_city_id": "a", "country_code": "PT", "deal_score": 3},
            {"served_city_id": "a", "country_code": "PT", "deal_score": 2},
            {"served_city_id": "a", "country_code": "PT", "deal_score": 1},
            {"served_city_id": "b", "country_code": "PT", "deal_score": 2.5},
        ]
        kept = apply_diversity(rows, max_per_city=2, max_per_country=3)
        self.assertEqual(len([k for k in kept if k["served_city_id"] == "a"]), 2)


if __name__ == "__main__":
    unittest.main()
