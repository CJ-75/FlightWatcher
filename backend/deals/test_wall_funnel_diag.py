"""Unit tests for wall funnel verdict + L2 cache."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from deals.wall_funnel_diag import _knob_hints, _verdict
from deals import wall_list_cache as l2


class TestVerdict(unittest.TestCase):
    def test_promote_strict(self):
        v, reasons = _verdict(
            steps={"deals_active": 5, "wall_returned": 4},
            catalog_n=30,
            seed_target=35,
            photo_share=0.9,
            cached_share=0.2,
            cached_cap=0.5,
            stale_jobs=[],
            scheduler=True,
            ttfb_ms=100,
            wall_n=4,
            hard=2,
            soft=1,
            obs_n=80,
        )
        self.assertEqual(v, "B")
        self.assertTrue(reasons)

    def test_knob_hints_cover_verdicts(self):
        for letter in "ABCDEF":
            self.assertTrue(_knob_hints(letter))


class TestWallListCache(unittest.TestCase):
    def test_roundtrip_and_invalidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(l2, "_CACHE_DIR", Path(tmp)):
                with patch.object(l2, "_ENABLED", True):
                    with patch.object(l2, "_epoch", 0):
                        l2.bump_epoch()
                        key = "test-key"
                        l2.set_shared(key, [{"id": "1"}])
                        got = l2.get_shared(key)
                        self.assertIsNotNone(got)
                        self.assertEqual(got[0]["id"], "1")
                        l2.bump_epoch()
                        self.assertIsNone(l2.get_shared(key))


if __name__ == "__main__":
    unittest.main()
