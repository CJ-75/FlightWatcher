"""Lot B — ranking + geo cell + radius steps helpers."""
from __future__ import annotations

import unittest

from activities.ranking import rank_activities
from activities.service import geo_cell_key


class TestLotB(unittest.TestCase):
    def test_rank_prefers_reviews(self):
        items = [
            {"product_code": "low", "rating": 4.9, "review_count": 3},
            {"product_code": "high", "rating": 4.6, "review_count": 400},
        ]
        out = rank_activities(items)
        self.assertEqual(out[0]["product_code"], "high")

    def test_geo_cell_stable(self):
        a = geo_cell_key(41.9, 12.5, 5)
        b = geo_cell_key(41.901, 12.501, 5)
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()
