"""Unit tests for duration buckets + organic beat threshold."""
from __future__ import annotations

import unittest

from deals.duration_bucket import buckets_compatible, duration_bucket
from deals.verification import organic_beats_seed, prefer_observation


class DurationBucketTests(unittest.TestCase):
    def test_citytrip_bands(self):
        self.assertEqual(duration_bucket(2), "weekend")
        self.assertEqual(duration_bucket(5), "short")
        self.assertEqual(duration_bucket(8), "week")
        self.assertIsNone(duration_bucket(12))

    def test_longhaul_only_7_15(self):
        lh = {"BKK", "JFK"}
        self.assertEqual(
            duration_bucket(10, dest_iata="BKK", longhaul_iatas=lh), "longhaul"
        )
        self.assertIsNone(duration_bucket(3, dest_iata="BKK", longhaul_iatas=lh))
        self.assertIsNone(duration_bucket(16, dest_iata="BKK", longhaul_iatas=lh))

    def test_compatible(self):
        self.assertTrue(buckets_compatible("week", "longhaul"))
        self.assertFalse(buckets_compatible("weekend", "short"))


class OrganicBeatTests(unittest.TestCase):
    def test_organic_beats_when_clearly_cheaper(self):
        seed = {"source": "seed_batch", "price_pp_eur": 120, "provider": "travelpayouts"}
        organic = {
            "source": "organic_search",
            "price_pp_eur": 100,
            "provider": "ryanair",
        }
        self.assertTrue(organic_beats_seed(organic, seed, min_save_eur=8, min_save_pct=0.05))
        winner = prefer_observation(seed, organic)
        self.assertEqual(winner.get("source"), "organic_search")
        self.assertTrue(winner.get("_beat_catalog"))

    def test_tiny_diff_keeps_seed(self):
        seed = {"source": "seed_batch", "price_pp_eur": 100, "provider": "travelpayouts"}
        organic = {
            "source": "organic_search",
            "price_pp_eur": 98,
            "provider": "ryanair",
        }
        self.assertFalse(organic_beats_seed(organic, seed, min_save_eur=8, min_save_pct=0.05))


if __name__ == "__main__":
    unittest.main()
