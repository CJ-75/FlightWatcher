"""Unit tests for hotel vs flight budget coherence."""
import unittest

from deals.hotel_budget import (
    HOTEL_FLIGHT_RATIO,
    filter_hotels_for_flight,
    max_hotel_pp,
)


class TestHotelBudget(unittest.TestCase):
    def test_cap_ratio(self):
        self.assertEqual(max_hotel_pp(60), 60 * HOTEL_FLIGHT_RATIO)
        self.assertIsNone(max_hotel_pp(0))
        self.assertIsNone(max_hotel_pp(None))

    def test_filter_prefers_rating_not_price(self):
        offers = [
            {
                "hotel_id": "cheap",
                "name": "Cheap",
                "public_hotel_price": 80,
                "rating": 7.5,
                "review_count": 10,
                "photo": "https://x/a.jpg",
            },
            {
                "hotel_id": "best",
                "name": "Best",
                "public_hotel_price": 140,
                "rating": 9.2,
                "review_count": 200,
                "photo": "https://x/b.jpg",
            },
            {
                "hotel_id": "over",
                "name": "Palace",
                "public_hotel_price": 900,
                "rating": 9.9,
                "review_count": 500,
                "photo": "https://x/c.jpg",
            },
        ]
        # flight 60 → cap 150 pp; adults=2 → public max 300
        ranked = filter_hotels_for_flight(
            offers, flight_pp=60, adults=2, top_n=5, require_photo=True
        )
        ids = [h["hotel_id"] for h in ranked]
        self.assertNotIn("over", ids)
        self.assertEqual(ids[0], "best")


if __name__ == "__main__":
    unittest.main()
