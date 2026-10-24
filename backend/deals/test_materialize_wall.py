"""Wall materialize + list-path readiness helpers."""
from __future__ import annotations

import unittest

from deals.community_list import (
    _hotel_top3_has_photo,
    _hotel_top3_ready,
    invalidate_list_cache,
)
from deals.materialize_wall import (
    collect_duplicate_primary_keys,
    hotel_top3_ready,
    pick_diverse_hotels,
)


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


class TestDiversePool(unittest.TestCase):
    def test_skips_already_used_primary(self):
        pool = [
            {"hotel_id": "A", "photo": "https://x/a.jpg"},
            {"hotel_id": "B", "photo": "https://x/b.jpg"},
            {"hotel_id": "C", "photo": "https://x/c.jpg"},
        ]
        used = {"A"}
        picked = pick_diverse_hotels(pool, used_ids=used, top_n=1, allow_reuse=False)
        self.assertEqual(picked[0]["hotel_id"], "B")

    def test_strict_no_reuse(self):
        pool = [{"hotel_id": "A", "photo": "https://x/a.jpg"}]
        picked = pick_diverse_hotels(
            pool, used_ids={"A"}, top_n=1, allow_reuse=False
        )
        self.assertEqual(picked, [])

    def test_detect_duplicate_keys(self):
        rows = [
            {"deal_key": "d1", "hotel_top3": [{"hotel_id": "H1", "photo": "x"}]},
            {"deal_key": "d2", "hotel_top3": [{"hotel_id": "H1", "photo": "x"}]},
            {"deal_key": "d3", "hotel_top3": [{"hotel_id": "H2", "photo": "x"}]},
        ]
        dups = collect_duplicate_primary_keys(rows)
        self.assertEqual(dups, {"d2"})


if __name__ == "__main__":
    unittest.main()
