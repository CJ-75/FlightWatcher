"""Unit tests for city-relative hotel targeting."""
import unittest

from deals.hotel_budget import (
    bayesian_rating,
    filter_hotels_for_city,
    nights_between,
    tier_night_cap,
)


class TestHotelBudget(unittest.TestCase):
    def test_nights(self):
        self.assertEqual(nights_between("2026-11-06", "2026-11-08"), 2)
        self.assertEqual(nights_between("2026-11-06", "2026-11-09"), 3)

    def test_bayesian_pulls_sparse_ratings(self):
        sparse = bayesian_rating(9.8, 12)
        solid = bayesian_rating(8.9, 2000)
        self.assertLess(sparse, 9.8)
        self.assertGreater(solid, sparse)

    def test_tier_and_value_sort(self):
        # 2 nights — public = night * 2
        offers = [
            {
                "hotel_id": "pricey_ok",
                "name": "Pricey",
                "public_hotel_price": 200,  # 100/night
                "rating": 9.5,
                "review_count": 800,
                "photo": "https://x/a.jpg",
            },
            {
                "hotel_id": "value",
                "name": "Value",
                "public_hotel_price": 100,  # 50/night
                "rating": 8.8,
                "review_count": 1500,
                "photo": "https://x/b.jpg",
            },
            {
                "hotel_id": "palace",
                "name": "Palace",
                "public_hotel_price": 600,  # 300/night — above confort
                "rating": 9.9,
                "review_count": 50,
                "photo": "https://x/c.jpg",
            },
            {
                "hotel_id": "sparse",
                "name": "Sparse",
                "public_hotel_price": 90,
                "rating": 9.8,
                "review_count": 8,
                "photo": "https://x/d.jpg",
            },
        ]
        nights = [50.0, 100.0, 300.0, 45.0]
        cap = tier_night_cap(nights, "confort")
        self.assertIsNotNone(cap)
        ranked, meta = filter_hotels_for_city(
            offers, adults=2, nights=2, tier="confort", sort="value", top_n=5
        )
        ids = [h["hotel_id"] for h in ranked]
        self.assertNotIn("palace", ids)
        self.assertNotIn("pricey_ok", ids)  # above confort median night
        self.assertEqual(meta["tier"], "confort")
        self.assertTrue(len(ids) >= 1)
        self.assertIn("value", ids)


if __name__ == "__main__":
    unittest.main()
