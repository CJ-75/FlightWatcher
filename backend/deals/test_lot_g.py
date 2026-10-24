"""Lot G — launch metrics pure functions."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from deals.launch_metrics import (
    active_deals_by_origin,
    is_price_rise,
    mon_voyage_return_rate,
    rise_rate_for_level,
)
from deals.verification import LEVEL_CACHED, LEVEL_LIVE


class TestLotG(unittest.TestCase):
    def test_is_price_rise(self):
        self.assertTrue(is_price_rise({"outcome": "higher"}))
        self.assertTrue(is_price_rise({"outcome": "ok", "delta_pct": 15}))
        self.assertFalse(is_price_rise({"outcome": "ok", "delta_pct": 3}))
        self.assertFalse(is_price_rise({"outcome": "unknown"}))

    def test_rise_rate_by_level(self):
        now = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)
        rows = [
            {
                "verification_level": LEVEL_CACHED,
                "outcome": "higher",
                "clicked_at": (now - timedelta(days=2)).isoformat(),
            },
            {
                "verification_level": LEVEL_CACHED,
                "outcome": "ok",
                "clicked_at": (now - timedelta(days=1)).isoformat(),
            },
            {
                "verification_level": LEVEL_LIVE,
                "outcome": "ok",
                "clicked_at": (now - timedelta(days=1)).isoformat(),
            },
            {
                "verification_level": LEVEL_CACHED,
                "outcome": "higher",
                "clicked_at": (now - timedelta(days=20)).isoformat(),
            },
        ]
        r7 = rise_rate_for_level(rows, level=LEVEL_CACHED, days=7, now=now)
        self.assertEqual(r7["n_clicks"], 2)
        self.assertEqual(r7["n_rise"], 1)
        self.assertEqual(r7["rise_pct"], 50.0)
        r30 = rise_rate_for_level(rows, level=LEVEL_CACHED, days=30, now=now)
        self.assertEqual(r30["n_clicks"], 3)
        self.assertEqual(r30["n_rise"], 2)

    def test_return_rate(self):
        now = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)
        clicked = now - timedelta(hours=3)
        clicks = [
            {
                "draft_token": "t1",
                "clicked_at": clicked.isoformat(),
                "user_feedback_at": (clicked + timedelta(hours=1)).isoformat(),
            },
            {
                "draft_token": "t2",
                "clicked_at": clicked.isoformat(),
            },
            {
                "draft_token": "",
                "clicked_at": clicked.isoformat(),
            },
        ]
        drafts = {
            "t1": {"payload": {}},
            "t2": {
                "flight_booked_at": (clicked + timedelta(hours=2)).isoformat(),
                "payload": {},
            },
        }
        out = mon_voyage_return_rate(clicks, drafts, days=7, window_h=24.0, now=now)
        self.assertEqual(out["n_clicks_with_draft"], 2)
        self.assertEqual(out["n_returned"], 2)
        self.assertEqual(out["return_pct"], 100.0)

    def test_deals_by_origin(self):
        now = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)
        rows = [
            {
                "origin_iata": "BVA",
                "status": "active",
                "verification_level": LEVEL_LIVE,
                "last_verified_at": (now - timedelta(hours=2)).isoformat(),
            },
            {
                "origin_iata": "BVA",
                "status": "active",
                "verification_level": LEVEL_CACHED,
                "last_verified_at": (now - timedelta(hours=6)).isoformat(),
            },
            {
                "origin_iata": "MRS",
                "status": "active",
                "verification_level": LEVEL_LIVE,
                "last_verified_at": (now - timedelta(hours=4)).isoformat(),
            },
        ]
        out = active_deals_by_origin(rows, now=now)
        self.assertEqual(out["total_active"], 3)
        bva = next(o for o in out["origins"] if o["origin_iata"] == "BVA")
        self.assertEqual(bva["active"], 2)
        self.assertEqual(bva["live"], 1)
        self.assertEqual(bva["cached"], 1)
        self.assertEqual(bva["avg_hours_since_verified"], 4.0)


if __name__ == "__main__":
    unittest.main()
