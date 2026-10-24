"""Unit tests for hotel upsell helpers (no network)."""
from __future__ import annotations

import unittest

from deals.upsell import hotel_pp_from_public, rooms_for_participants


class TestRoomsAndPp(unittest.TestCase):
    def test_solo(self):
        rooms, adults = rooms_for_participants(1)
        self.assertEqual(rooms, 1)
        self.assertEqual(adults, 1)
        self.assertEqual(hotel_pp_from_public(100, participants=1), 100.0)

    def test_couple(self):
        rooms, adults = rooms_for_participants(2)
        self.assertEqual(rooms, 1)
        self.assertEqual(adults, 2)
        self.assertEqual(hotel_pp_from_public(200, participants=2), 100.0)

    def test_four(self):
        rooms, adults = rooms_for_participants(4)
        self.assertEqual(rooms, 2)
        self.assertEqual(adults, 2)
        # 2 rooms × 200 = 400 / 4 = 100
        self.assertEqual(hotel_pp_from_public(200, participants=4), 100.0)

    def test_three(self):
        rooms, adults = rooms_for_participants(3)
        self.assertEqual(rooms, 2)
        self.assertEqual(adults, 2)
        self.assertEqual(hotel_pp_from_public(180, participants=3), 120.0)


if __name__ == "__main__":
    unittest.main()
