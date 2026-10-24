"""Lot A — baseline age guard softens % badges after 36h."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from deals.baseline_guard import baselines_freshness, soften_badge_if_stale
from deals.community_list import badge_for_baseline


class TestBaselineGuard(unittest.TestCase):
    def test_soften_strips_percent(self):
        badge = badge_for_baseline(
            {
                "reliable": True,
                "baseline_kind": "observed",
                "discount_pct": 32.0,
            }
        )
        self.assertIsNotNone(badge.get("discount_pct"))
        soft = soften_badge_if_stale(badge, baselines_fresh=False)
        self.assertIsNone(soft.get("discount_pct"))
        self.assertIsNone(soft.get("label"))
        self.assertTrue(soft.get("baselines_stale"))

    def test_fresh_keeps_percent(self):
        badge = {
            "label": "Vol −32 % moins cher que d'habitude",
            "discount_pct": 32.0,
            "scope": "flight",
        }
        out = soften_badge_if_stale(badge, baselines_fresh=True)
        self.assertEqual(out.get("discount_pct"), 32.0)

    def test_stale_after_40h(self):
        now = datetime(2026, 10, 24, 12, tzinfo=timezone.utc)
        last = now - timedelta(hours=40)

        sb = MagicMock()
        # last_successful_run_at path via table mock
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"finished_at": last.isoformat()}]
        )

        fresh, got_last, reason = baselines_freshness(
            sb, max_age_h=36.0, now=now
        )
        self.assertFalse(fresh)
        self.assertIn("stale", reason)
        self.assertEqual(got_last, last)

    def test_fresh_within_36h(self):
        now = datetime(2026, 10, 24, 12, tzinfo=timezone.utc)
        last = now - timedelta(hours=10)
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"finished_at": last.isoformat()}]
        )
        fresh, _, reason = baselines_freshness(sb, max_age_h=36.0, now=now)
        self.assertTrue(fresh)
        self.assertTrue(reason.startswith("ok_"))


if __name__ == "__main__":
    unittest.main()
