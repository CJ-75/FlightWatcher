"""Load anonymized sandbox fixtures (L11)."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

from deals.pricing import extract_rate_money, sum_excluded_fees


FIXTURES = Path(__file__).resolve().parent / "fixtures" / "rates_sandbox_sample.json"


class TestSandboxFixtures(unittest.TestCase):
    def test_fixture_parses(self):
        raw = json.loads(FIXTURES.read_text(encoding="utf-8"))
        hotels = raw.get("data") or []
        self.assertGreaterEqual(len(hotels), 2)

        rt = hotels[0]["roomTypes"][0]
        money = extract_rate_money(
            {
                "offerRetailRate": rt.get("offerRetailRate"),
                "suggestedSellingPrice": rt.get("suggestedSellingPrice"),
                "retailRate": (rt.get("rates") or [{}])[0].get("retailRate"),
                "commission": (rt.get("rates") or [{}])[0].get("commission"),
            }
        )
        self.assertEqual(money["public_hotel_price"], 162.0)
        self.assertFalse(money["ssp_missing"])
        fees = sum_excluded_fees(
            (rt.get("rates") or [{}])[0]["retailRate"]["taxesAndFees"]
        )
        self.assertAlmostEqual(fees, 8.5)

        # Array money shape on hotel 2
        rt2 = hotels[1]["roomTypes"][0]
        money2 = extract_rate_money(
            {
                "offerRetailRate": rt2.get("offerRetailRate"),
                "suggestedSellingPrice": rt2.get("suggestedSellingPrice"),
                "retailRate": (rt2.get("rates") or [{}])[0].get("retailRate"),
            }
        )
        self.assertEqual(money2["public_hotel_price"], 110.0)


class TestMetricsHelpers(unittest.TestCase):
    def test_percentile_and_record(self):
        from deals.metrics import process_latency_stats, record_liteapi_call

        record_liteapi_call("/hotels/rates", 100, ok=True)
        record_liteapi_call("/hotels/rates", 200, ok=True)
        record_liteapi_call("/hotels/rates", 400, ok=False)
        stats = process_latency_stats()
        self.assertGreaterEqual(stats["calls_total"], 3)
        self.assertIsNotNone(stats["latency_ms_p50"])


if __name__ == "__main__":
    unittest.main()
