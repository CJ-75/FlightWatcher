"""D3 unit tests — baselines + eligibility helpers."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from deals.baselines import (
    build_baselines_from_rows,
    compute_baseline_stats,
    dedupe_observations_for_baselines,
    discount_pct_vs_usual,
    horizon_bucket,
    is_good_price,
)
from deals.community_list import badge_for_baseline
from deals.promote import apply_diversity, deal_score, eligible_candidate, is_fresh_enough


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
        self.assertTrue(is_good_price(75, bl))  # = 0.75×median and ≥15% off
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
        self.assertIsNone(soft["label"])
        no_disc = badge_for_baseline(
            {"baseline_kind": "observed", "reliable": True, "discount_pct": None}
        )
        self.assertIsNone(no_disc["label"])


class TestBuildBaselines(unittest.TestCase):
    def test_groups(self):
        now = datetime(2026, 10, 24, tzinfo=timezone.utc)
        rows = []
        for i in range(35):
            out_d = (now + timedelta(days=10 + (i % 10))).date().isoformat()
            rows.append(
                {
                    "origin_iata": "BVA",
                    "served_city_id": "city-1",
                    "trip_type": "WEEKEND",
                    "out_date": out_d,
                    "ret_date": (
                        now + timedelta(days=12 + (i % 10))
                    ).date().isoformat(),
                    "price_pp_eur": 60 + i,
                    "observed_at": (now - timedelta(days=i % 20)).isoformat(),
                }
            )
        out = build_baselines_from_rows(rows, now=now)
        self.assertGreaterEqual(len(out), 1)
        self.assertEqual(out[0]["origin_iata"], "BVA")


class TestLotB(unittest.TestCase):
    """B1 dedupe + B2 min 15% discount."""

    def test_dedupe_50_same_day_does_not_move_median(self):
        now = datetime(2026, 10, 24, 15, 0, tzinfo=timezone.utc)
        # Keep all out_dates in horizon le14 (≤14d) so one baseline bucket
        rows = []
        for i in range(12):
            out_d = (now + timedelta(days=3 + i)).date().isoformat()  # 3..14
            ret_d = (now + timedelta(days=5 + i)).date().isoformat()
            rows.append(
                {
                    "origin_iata": "BVA",
                    "served_city_id": "city-1",
                    "trip_type": "WEEKEND",
                    "out_date": out_d,
                    "ret_date": ret_d,
                    "price_pp_eur": 100.0,
                    # Distinct observation days (noon) — not colliding with cheap batch
                    "observed_at": (now - timedelta(days=i + 2)).isoformat(),
                }
            )
        # Unique trip dates not in the 12 above (out day+2)
        cheap_out = (now + timedelta(days=2)).date().isoformat()
        cheap_ret = (now + timedelta(days=4)).date().isoformat()
        same_day = now.isoformat()  # all 50 share this observation day
        for _ in range(50):
            rows.append(
                {
                    "origin_iata": "BVA",
                    "served_city_id": "city-1",
                    "trip_type": "WEEKEND",
                    "out_date": cheap_out,
                    "ret_date": cheap_ret,
                    "price_pp_eur": 40.0,
                    "observed_at": same_day,
                }
            )
        deduped = dedupe_observations_for_baselines(rows, now=now)
        # 12 + 1 cheap (not 50)
        self.assertEqual(len(deduped), 13)

        # Without dedupe: 50×40 + 12×100 → median dragged down hard
        raw_prices = [float(r["price_pp_eur"]) for r in rows]
        raw_median = compute_baseline_stats(raw_prices, 13)["median"]
        self.assertLess(raw_median, 50.0)

        baselines = build_baselines_from_rows(rows, now=now)
        self.assertEqual(len(baselines), 1)
        # With dedupe: 12×100 + 1×40 → median stays near 100
        self.assertGreaterEqual(baselines[0]["median"], 90.0)
        self.assertEqual(baselines[0]["n_obs"], 13)

    def test_10_percent_under_median_never_promoted(self):
        bl = {
            "reliable": True,
            "p20": 95,
            "median": 100,
            "baseline_kind": "observed",
        }
        # Old v3 band alone: 90 ≤ p20(95) → would pass; min_discount blocks
        self.assertFalse(is_good_price(90, bl, min_discount=0.15))
        self.assertIsNone(discount_pct_vs_usual(90, bl, min_discount=0.15))

        # Still a real deal at −20%
        self.assertTrue(is_good_price(80, bl, min_discount=0.15))

    def test_eligible_candidate_respects_min_discount(self):
        now = datetime(2026, 10, 24, 12, tzinfo=timezone.utc)
        bl = {
            "reliable": True,
            "p20": 95,
            "median": 100,
            "baseline_kind": "observed",
        }
        obs = {
            "price_pp_eur": 90,
            "out_date": "2026-11-20",
            "nights": 2,
            "observed_at": (now - timedelta(hours=1)).isoformat(),
            "out_arr_local": "2026-11-20T10:00:00",
        }
        # Build a minimal cfg-like with min_discount
        class _Cfg:
            max_flight_pp = 120.0
            min_discount = 0.15
            fresh_tau_h = 6.0
            fresh_tau_short_h = 3.0

        self.assertFalse(eligible_candidate(obs, bl, cfg=_Cfg(), now=now))
        obs2 = {**obs, "price_pp_eur": 80}
        self.assertTrue(eligible_candidate(obs2, bl, cfg=_Cfg(), now=now))


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
