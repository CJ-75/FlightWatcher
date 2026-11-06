"""Search scaling: singleflight + cache + load soft-cap."""
from __future__ import annotations

import os
import threading
import time
import unittest
from unittest import mock

import search_scale
from providers import throttle


class TestSearchScale(unittest.TestCase):
    def setUp(self):
        search_scale.reset_for_tests()
        throttle.reset_circuits()

    def tearDown(self):
        search_scale.reset_for_tests()
        throttle.reset_circuits()

    def test_coalesce_runs_factory_once(self):
        calls = {"n": 0}
        barrier = threading.Barrier(4)

        def factory():
            calls["n"] += 1
            time.sleep(0.05)
            return {"ok": True, "n": calls["n"]}

        results = []

        def worker():
            barrier.wait()
            results.append(search_scale.coalesce("k1", factory))

        threads = [threading.Thread(target=worker) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(calls["n"], 1)
        self.assertEqual(len(results), 4)
        self.assertTrue(all(r.get("ok") for r in results))

    def test_cache_hit_skips_factory(self):
        search_scale.cache_put("k2", {"cached": 1})
        called = {"n": 0}

        def factory():
            called["n"] += 1
            return {"cached": 0}

        out = search_scale.coalesce("k2", factory)
        self.assertEqual(out, {"cached": 1})
        self.assertEqual(called["n"], 0)

    def test_load_dest_cap_under_pressure(self):
        with mock.patch.dict(
            os.environ,
            {"SEARCH_LOAD_THRESHOLD": "2", "SEARCH_LOAD_DEST_CAP": "50"},
            clear=False,
        ):
            with mock.patch(
                "search_priority.searches_in_flight", return_value=1
            ):
                self.assertEqual(search_scale.effective_limite_allers(0), 0)
            with mock.patch(
                "search_priority.searches_in_flight", return_value=5
            ):
                self.assertEqual(search_scale.effective_limite_allers(0), 50)
                self.assertEqual(search_scale.effective_limite_allers(20), 20)

    def test_fast_path_ignores_seed_ryanair_interval(self):
        with mock.patch.dict(
            os.environ,
            {
                "PROVIDER_RYANAIR_MIN_INTERVAL_S": "2.5",
                "SEARCH_PROVIDER_MIN_INTERVAL_S": "0.15",
                "SEARCH_PROVIDER_RYANAIR_MIN_INTERVAL_S": "0.25",
            },
            clear=False,
        ):
            with throttle.fast_search_path(True):
                self.assertAlmostEqual(
                    throttle._min_interval_s("ryanair"), 0.25, places=2
                )
            self.assertAlmostEqual(
                throttle._min_interval_s("ryanair"), 2.5, places=2
            )


if __name__ == "__main__":
    unittest.main()
