"""D0 unit tests — city mapping + trip_type helpers."""
from __future__ import annotations

import unittest

from deals.city_mapping import _slugify, build_mapping_rows_from_city_dict
from deals.observations import trip_to_observation, trip_type_for_nights


class TestSlugify(unittest.TestCase):
    def test_accents(self):
        self.assertEqual(_slugify("Lisbonne"), "lisbonne")
        self.assertEqual(_slugify("Séville"), "seville")
        self.assertEqual(_slugify("Édimbourg"), "edimbourg")


class TestBuildMapping(unittest.TestCase):
    def test_rome_groups_airports(self):
        cities, _ = build_mapping_rows_from_city_dict()
        rome = next((c for c in cities if c["slug"] == "rome"), None)
        self.assertIsNotNone(rome)
        assert rome is not None
        iatas = set(rome["_iatas"])
        self.assertTrue({"CIA", "FCO"} <= iatas or "CIA" in iatas)
        self.assertEqual(rome["city_name"], "Rome")
        self.assertTrue(rome["verified"])

    def test_lisbonne_from_seed(self):
        cities, _ = build_mapping_rows_from_city_dict()
        lis = next((c for c in cities if c["slug"] == "lisbonne"), None)
        self.assertIsNotNone(lis)
        assert lis is not None
        self.assertEqual(lis["primary_iata"], "LIS")
        self.assertTrue(lis["verified"])


class TestTripType(unittest.TestCase):
    def test_buckets(self):
        self.assertEqual(trip_type_for_nights(2), "WEEKEND")
        self.assertEqual(trip_type_for_nights(5), "SHORT")
        self.assertEqual(trip_type_for_nights(7), "WEEK")
        self.assertEqual(trip_type_for_nights(14), "OTHER")


class TestTripToObservation(unittest.TestCase):
    def test_roundtrip_dict(self):
        trip = {
            "aller": {
                "origin": "BVA",
                "destination": "LIS",
                "departureTime": "2026-11-06T08:30:00",
                "price": 40,
            },
            "retour": {
                "origin": "LIS",
                "destination": "BVA",
                "departureTime": "2026-11-08T18:00:00",
                "price": 45,
            },
            "prix_total": 85.0,
            "destination_code": "LIS",
            "provider": "ryanair",
            "airline": "Ryanair",
            "transfers": 0,
            "booking_url": "https://example.com",
        }
        obs = trip_to_observation(trip, source="organic_search", fingerprint="abc")
        self.assertIsNotNone(obs)
        assert obs is not None
        self.assertEqual(obs["origin_iata"], "BVA")
        self.assertEqual(obs["dest_iata"], "LIS")
        self.assertEqual(obs["nights"], 2)
        self.assertEqual(obs["trip_type"], "WEEKEND")
        self.assertEqual(obs["price_pp_eur"], 85.0)
        self.assertTrue(obs["direct"])
        self.assertNotIn("user_id", obs)
        self.assertEqual(obs["search_fingerprint"], "abc")


if __name__ == "__main__":
    unittest.main()
