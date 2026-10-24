"""Unit tests for hotel pool filters / scoring (no network)."""
from __future__ import annotations

import unittest

from deals.destinations_seed import DESTINATIONS_SEED
from deals.hotel_pool import (
    POOL_TARGET,
    build_excluded_type_ids,
    extract_hotels_list,
    haversine_m,
    hotel_passes_filters,
    normalize_rating,
    score_candidate,
    select_pool,
)


class TestSeed(unittest.TestCase):
    def test_ten_destinations(self):
        self.assertEqual(len(DESTINATIONS_SEED), 10)
        slugs = [d["slug"] for d in DESTINATIONS_SEED]
        self.assertEqual(len(slugs), len(set(slugs)))
        for d in DESTINATIONS_SEED:
            self.assertGreaterEqual(d["pool_radius_m"], 1000)
            self.assertTrue(d["iata_arrival"])


class TestNormalizeRating(unittest.TestCase):
    def test_scale_10(self):
        r, scale = normalize_rating(8.5)
        self.assertAlmostEqual(r, 8.5)
        self.assertEqual(scale, 10.0)

    def test_scale_5(self):
        r, scale = normalize_rating(4.2)
        self.assertAlmostEqual(r, 8.4)
        self.assertEqual(scale, 5.0)


class TestFilters(unittest.TestCase):
    def setUp(self):
        self.center = (38.7139, -9.1394)
        self.base = {
            "id": "h1",
            "name": "Hotel Central",
            "stars": 4,
            "rating": 8.6,
            "reviewCount": 350,
            "latitude": 38.7140,
            "longitude": -9.1390,
            "hotelTypeId": 201,
            "facilityIds": [1, 2],
        }

    def test_pass(self):
        c = hotel_passes_filters(
            self.base,
            center_lat=self.center[0],
            center_lng=self.center[1],
            radius_m=2000,
            excluded_type_ids=set(),
        )
        self.assertIsNotNone(c)
        self.assertEqual(c["hotel_id"], "h1")

    def test_reject_hostel_name(self):
        h = {**self.base, "name": "Lisbon Hostel Downtown"}
        c = hotel_passes_filters(
            h,
            center_lat=self.center[0],
            center_lng=self.center[1],
            radius_m=2000,
            excluded_type_ids=set(),
        )
        self.assertIsNone(c)

    def test_reject_low_reviews(self):
        h = {**self.base, "reviewCount": 50}
        self.assertIsNone(
            hotel_passes_filters(
                h,
                center_lat=self.center[0],
                center_lng=self.center[1],
                radius_m=2000,
                excluded_type_ids=set(),
            )
        )

    def test_reject_excluded_type_id(self):
        h = {**self.base, "hotelTypeId": 99}
        self.assertIsNone(
            hotel_passes_filters(
                h,
                center_lat=self.center[0],
                center_lng=self.center[1],
                radius_m=2000,
                excluded_type_ids={99},
            )
        )

    def test_reject_stars(self):
        h = {**self.base, "stars": 2}
        self.assertIsNone(
            hotel_passes_filters(
                h,
                center_lat=self.center[0],
                center_lng=self.center[1],
                radius_m=2000,
                excluded_type_ids=set(),
            )
        )


class TestSelectPool(unittest.TestCase):
    def test_top_n(self):
        cands = []
        for i in range(60):
            cands.append(
                {
                    "hotel_id": str(i),
                    "rating": 8.0 + (i % 10) * 0.1,
                    "review_count": 200 + i * 10,
                    "distance_m": 100 + i * 20,
                }
            )
        pool = select_pool(cands, radius_m=2000)
        self.assertEqual(len(pool), POOL_TARGET)
        self.assertEqual(pool[0]["pool_rank"], 1)
        # best score first
        self.assertGreaterEqual(
            score_candidate(pool[0], 2000),
            score_candidate(pool[-1], 2000),
        )


class TestHelpers(unittest.TestCase):
    def test_haversine_zero(self):
        self.assertAlmostEqual(haversine_m(48.0, 2.0, 48.0, 2.0), 0.0, places=3)

    def test_extract_list(self):
        self.assertEqual(len(extract_hotels_list({"data": [{"id": 1}, {"id": 2}]})), 2)

    def test_excluded_types(self):
        types = [
            {"id": 1, "name": "Hotel"},
            {"id": 2, "name": "Hostel"},
            {"id": 3, "name": "Apartment"},
        ]
        excluded = build_excluded_type_ids(types)
        self.assertEqual(excluded, {2, 3})


if __name__ == "__main__":
    unittest.main()
