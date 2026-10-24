"""
Sandbox integration tests (L11) — disabled unless LITEAPI_INTEGRATION=1.

  set LITEAPI_INTEGRATION=1
  cd backend && python -m unittest deals.test_integration_sandbox -v
"""
from __future__ import annotations

import os
import unittest


@unittest.skipUnless(
    (os.getenv("LITEAPI_INTEGRATION") or "").strip() == "1",
    "Set LITEAPI_INTEGRATION=1 to run sandbox network tests",
)
class TestLiteApiSandboxIntegration(unittest.TestCase):
    def test_rates_on_pool_sample(self):
        from deals.liteapi_client import LiteApiClient
        from deals.liteapi_config import load_deals_config

        cfg = load_deals_config()
        self.assertTrue(cfg.api_key, "API key required")
        client = LiteApiClient(cfg=cfg)
        try:
            # Minimal smoke: empty hotelIds should not 401 with valid key
            # Real pool IDs come from DB — skip hard assert on content.
            raw = client.hotels_rates(
                {
                    "hotelIds": ["invalid_demo_hotel"],
                    "checkin": "2026-11-06",
                    "checkout": "2026-11-08",
                    "occupancies": [{"adults": 2}],
                    "currency": cfg.currency,
                    "guestNationality": cfg.guest_nationality,
                    "maxRatesPerHotel": 1,
                }
            )
            self.assertIsNotNone(raw)
        finally:
            client.close()


if __name__ == "__main__":
    unittest.main()
