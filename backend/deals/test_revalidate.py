"""Unit tests for revalidate helpers (no network)."""
from __future__ import annotations

import unittest

from deals.pricing import ceil_margin_pct, price_delta_action
from deals.deal_assemble import parse_deal_key


class TestRevalidateHelpers(unittest.TestCase):
    def test_delta_actions(self):
        self.assertEqual(price_delta_action(100, 101), "silent")
        self.assertEqual(price_delta_action(100, 105), "confirm")
        self.assertEqual(price_delta_action(100, 115), "fallback")

    def test_margin_formula(self):
        self.assertAlmostEqual(ceil_margin_pct(110, 100, 25), 10.0)
        self.assertIsNone(ceil_margin_pct(90, 100, 25))

    def test_deal_key_parse(self):
        p = parse_deal_key("BVA-LIS-2026-W44-FRI_SUN-2")
        self.assertEqual(p["window_id"], "2026-W44-FRI_SUN")


if __name__ == "__main__":
    unittest.main()
