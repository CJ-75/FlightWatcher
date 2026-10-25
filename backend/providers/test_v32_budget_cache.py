"""v3.2 — Ryanair hourly budget + response cache."""
from __future__ import annotations

import os
import unittest

from providers import ryanair_budget, ryanair_cache


class TestRyanairBudget(unittest.TestCase):
    def setUp(self):
        ryanair_budget.reset_for_tests()
        os.environ["RYANAIR_BUDGET_PER_HOUR"] = "3"

    def tearDown(self):
        ryanair_budget.reset_for_tests()
        os.environ.pop("RYANAIR_BUDGET_PER_HOUR", None)

    def test_acquire_until_exhausted(self):
        self.assertTrue(ryanair_budget.try_acquire(ryanair_budget.PURPOSE_REVALIDATE))
        self.assertTrue(ryanair_budget.try_acquire(ryanair_budget.PURPOSE_REVALIDATE))
        self.assertTrue(ryanair_budget.try_acquire(ryanair_budget.PURPOSE_REVALIDATE))
        self.assertFalse(ryanair_budget.try_acquire(ryanair_budget.PURPOSE_SEED))
        self.assertFalse(ryanair_budget.try_acquire(ryanair_budget.PURPOSE_PROMOTE))
        # User Search / click never blocked by the hourly cap
        self.assertTrue(ryanair_budget.try_acquire(ryanair_budget.PURPOSE_ORGANIC))
        self.assertTrue(ryanair_budget.try_acquire(ryanair_budget.PURPOSE_CLICK))
        snap = ryanair_budget.status_snapshot()
        self.assertEqual(snap["remaining"], 0)
        self.assertGreaterEqual(snap["denied_by_purpose"].get("seed", 0), 1)

    def test_note_no_calendar_api(self):
        note = str(ryanair_budget.status_snapshot().get("note") or "")
        self.assertIn("calendar", note.lower())


class TestRyanairCache(unittest.TestCase):
    def setUp(self):
        ryanair_cache.clear()
        os.environ["RYANAIR_CACHE_TTL_S"] = "3600"

    def tearDown(self):
        ryanair_cache.clear()
        os.environ.pop("RYANAIR_CACHE_TTL_S", None)

    def test_roundtrip(self):
        key = ryanair_cache.make_key(
            origin="BVA", dest="CIA", out_date="2026-11-01", ret_date="2026-11-03"
        )
        self.assertIsNone(ryanair_cache.get(key))
        ryanair_cache.set(key, (["trip"], 2))
        got = ryanair_cache.get(key)
        self.assertEqual(got, (["trip"], 2))
        self.assertEqual(ryanair_cache.stats()["entries"], 1)


if __name__ == "__main__":
    unittest.main()
