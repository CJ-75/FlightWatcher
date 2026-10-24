"""Unit tests for deal price alert helpers (no network)."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from deals.price_alerts import (
    cooldown_ok,
    price_drop_pct,
    should_notify,
)


class TestPriceDrop(unittest.TestCase):
    def test_drop_8pct(self):
        self.assertAlmostEqual(price_drop_pct(100, 92), 8.0)
        self.assertAlmostEqual(price_drop_pct(100, 91.5), 8.5)

    def test_no_drop(self):
        self.assertEqual(price_drop_pct(100, 100), 0.0)
        self.assertEqual(price_drop_pct(100, 105), 0.0)
        self.assertEqual(price_drop_pct(0, 50), 0.0)


class TestShouldNotify(unittest.TestCase):
    def test_threshold_gate(self):
        ok, drop = should_notify(baseline_pp=100, current_pp=95, threshold=8)
        self.assertFalse(ok)
        self.assertAlmostEqual(drop, 5.0)

        ok2, drop2 = should_notify(baseline_pp=100, current_pp=90, threshold=8)
        self.assertTrue(ok2)
        self.assertAlmostEqual(drop2, 10.0)

    def test_cooldown_24h(self):
        now = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)
        recent = (now - timedelta(hours=6)).isoformat()
        ok, _ = should_notify(
            baseline_pp=100,
            current_pp=80,
            threshold=8,
            last_notified_at=recent,
            now=now,
        )
        self.assertFalse(ok)

        old = (now - timedelta(hours=25)).isoformat()
        ok2, _ = should_notify(
            baseline_pp=100,
            current_pp=80,
            threshold=8,
            last_notified_at=old,
            now=now,
        )
        self.assertTrue(ok2)

    def test_cooldown_helper(self):
        now = datetime(2026, 10, 24, tzinfo=timezone.utc)
        self.assertTrue(cooldown_ok(None, now=now))
        self.assertFalse(
            cooldown_ok((now - timedelta(hours=1)).isoformat(), now=now)
        )


if __name__ == "__main__":
    unittest.main()
