"""Lot A unit tests — ranking, geo cell, xor logic helpers."""
from __future__ import annotations

import unittest

from activities.ranking import bayesian_score, haversine_km, rank_activities
from activities.service import geo_cell_key


class TestRanking(unittest.TestCase):
    def test_bayesian_pulls_toward_prior(self):
        low_n = bayesian_score(5.0, 2)
        high_n = bayesian_score(5.0, 200)
        self.assertLess(low_n, high_n)
        self.assertGreater(low_n, 4.0)

    def test_rank_orders_by_score(self):
        items = [
            {"product_code": "A", "rating": 3.0, "review_count": 10},
            {"product_code": "B", "rating": 4.8, "review_count": 100},
        ]
        out = rank_activities(items)
        self.assertEqual(out[0]["product_code"], "B")

    def test_haversine_paris_lyon(self):
        # Rough ~390 km
        km = haversine_km(48.85, 2.35, 45.75, 4.85)
        self.assertTrue(350 < km < 450)


class TestGeoCell(unittest.TestCase):
    def test_nearby_points_same_cell(self):
        a = geo_cell_key(48.8566, 2.3522, 5)
        b = geo_cell_key(48.8570, 2.3525, 5)
        self.assertEqual(a, b)


class TestXorOwner(unittest.TestCase):
    def test_xor_check_semantics(self):
        # Mirrors SQL: (planned IS NOT NULL) <> (draft IS NOT NULL)
        def ok(planned, draft):
            return (planned is not None) != (draft is not None)

        self.assertTrue(ok("p", None))
        self.assertTrue(ok(None, "d"))
        self.assertFalse(ok(None, None))
        self.assertFalse(ok("p", "d"))


if __name__ == "__main__":
    unittest.main()
