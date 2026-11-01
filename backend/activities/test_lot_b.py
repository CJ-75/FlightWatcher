"""Lot B — ranking + geo cell + radius steps helpers."""
from __future__ import annotations

import unittest

from activities.ranking import rank_activities
from activities.service import (
    exclude_gastronomy,
    geo_cell_key,
    is_gastronomy_activity,
)


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

    def test_exclude_gastronomy_by_tag(self):
        food = {"product_code": "f1", "title": "Tour", "tags": [21911]}
        tour = {"product_code": "t1", "title": "Louvre skip the line", "tags": [21913]}
        self.assertTrue(is_gastronomy_activity(food))
        self.assertFalse(is_gastronomy_activity(tour))
        out = exclude_gastronomy([food, tour])
        self.assertEqual([x["product_code"] for x in out], ["t1"])

    def test_exclude_gastronomy_by_title(self):
        tasting = {
            "product_code": "g1",
            "title": "Dégustation de vins à Bordeaux",
            "tags": [],
        }
        museum = {
            "product_code": "m1",
            "title": "Billet musée d'Orsay",
            "tags": [],
        }
        self.assertTrue(is_gastronomy_activity(tasting))
        self.assertFalse(is_gastronomy_activity(museum))


if __name__ == "__main__":
    unittest.main()
