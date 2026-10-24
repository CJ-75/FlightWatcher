"""Wall materialize + list-path readiness helpers."""
from __future__ import annotations

import unittest

from deals.community_list import (
    _hotel_top3_has_photo,
    _hotel_top3_ready,
    invalidate_list_cache,
)
from deals.materialize_wall import hotel_top3_ready


class TestReady(unittest.TestCase):
    def test_photo_only_not_ready(self):
        hotels = [{"hotel_id": "1", "photo": "https://x/a.jpg"}]
        self.assertTrue(_hotel_top3_has_photo(hotels))
        self.assertFalse(_hotel_top3_ready(hotels))
        self.assertFalse(hotel_top3_ready(hotels))

    def test_photo_and_price_ready(self):
        hotels = [
            {
                "hotel_id": "1",
                "photo": "https://x/a.jpg",
                "public_hotel_price": 120,
            }
        ]
        self.assertTrue(_hotel_top3_ready(hotels))
        self.assertTrue(hotel_top3_ready(hotels))

    def test_empty_not_ready(self):
        self.assertFalse(_hotel_top3_has_photo([]))
        self.assertFalse(hotel_top3_ready(None))


class TestInvalidate(unittest.TestCase):
    def test_invalidate_clears(self):
        invalidate_list_cache()
        from deals import community_list as cl

        with cl._list_cache_lock:
            cl._list_cache["x"] = (0.0, [])
        invalidate_list_cache()
        with cl._list_cache_lock:
            self.assertEqual(len(cl._list_cache), 0)
            self.assertGreaterEqual(cl._list_cache_epoch, 1)


if __name__ == "__main__":
    unittest.main()
