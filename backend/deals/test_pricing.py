"""Unit tests for SSP pricing + defensive money parsing (stdlib unittest)."""
from __future__ import annotations

import os
import unittest

from deals.pricing import (
    ceil_margin_pct,
    extract_rate_money,
    price_delta_action,
    price_per_person,
    public_hotel_price,
    sum_excluded_fees,
)
from deals.liteapi_config import LiteApiConfigError, load_deals_config, validate_liteapi_keys
from deals.provider import MockDealProvider, get_deal_provider, reset_deal_provider


class TestPublicHotelPrice(unittest.TestCase):
    def test_max_ssp_retail(self):
        price, missing = public_hotel_price(80.0, 100.0)
        self.assertEqual(price, 100.0)
        self.assertFalse(missing)

    def test_retail_above_ssp(self):
        price, missing = public_hotel_price(120.0, 100.0)
        self.assertEqual(price, 120.0)
        self.assertFalse(missing)

    def test_ssp_missing(self):
        price, missing = public_hotel_price(90.0, None)
        self.assertEqual(price, 90.0)
        self.assertTrue(missing)


class TestExcludedFees(unittest.TestCase):
    def test_sum_excluded_only(self):
        fees = [
            {"amount": 5, "included": False},
            {"amount": 10, "included": True},
            {"amount": {"amount": 3.5}, "included": False},
        ]
        self.assertAlmostEqual(sum_excluded_fees(fees), 8.5)


class TestPricePp(unittest.TestCase):
    def test_two_adults(self):
        # flight 60 pp + hotel 100 / 2 = 110
        self.assertAlmostEqual(price_per_person(60, 100, 2), 110.0)


class TestExtractRateMoney(unittest.TestCase):
    def test_object_shape(self):
        rate = {
            "offerRetailRate": {"amount": 80, "currency": "EUR"},
            "suggestedSellingPrice": {"amount": 95, "currency": "EUR", "source": "booking.com"},
            "retailRate": {
                "taxesAndFees": [{"amount": 4, "included": False}],
            },
            "commission": [{"amount": 8}],
        }
        out = extract_rate_money(rate)
        self.assertEqual(out["retail_total"], 80.0)
        self.assertEqual(out["ssp_total"], 95.0)
        self.assertEqual(out["public_hotel_price"], 95.0)
        self.assertEqual(out["excluded_fees"], 4.0)
        self.assertEqual(out["ssp_source"], "booking.com")

    def test_array_shape(self):
        rate = {
            "offerRetailRate": [{"amount": 70}],
            "suggestedSellingPrice": [{"amount": 70, "source": "expedia"}],
            "commission": [],
        }
        out = extract_rate_money(rate)
        self.assertEqual(out["retail_total"], 70.0)
        self.assertEqual(out["public_hotel_price"], 70.0)


class TestMarginAndDelta(unittest.TestCase):
    def test_ceil_margin(self):
        # ssp 110, net 100 → 10% exact
        self.assertAlmostEqual(ceil_margin_pct(110, 100, 25), 10.0)
        # ssp 111, net 100 → 11% → ceil to 11.0
        self.assertAlmostEqual(ceil_margin_pct(111, 100, 25), 11.0)

    def test_delta_bands(self):
        self.assertEqual(price_delta_action(100, 101.5), "silent")
        self.assertEqual(price_delta_action(100, 105), "confirm")
        self.assertEqual(price_delta_action(100, 120), "fallback")


class TestConfigGuards(unittest.TestCase):
    def test_prod_rejects_sand_key(self):
        from deals.liteapi_config import DealsConfig

        cfg = DealsConfig(
            provider="liteapi",
            liteapi_env="prod",
            api_key="sand_abc",
            payment_public_key="",
            search_base="https://api.liteapi.travel/v3.0",
            book_base="https://book.liteapi.travel/v3.0",
            timeout_s=8,
            max_concurrency=4,
            margin_max_pct=25,
            currency="EUR",
            guest_nationality="FR",
            weekends_ahead=3,
            calendar_weekends_ahead=8,
            window_kinds=("FRI_SUN",),
            occupancies=(2,),
            budget_flight_pp=150,
            budget_pack_pp=350,
            score_weights={},
            excluded_fees_display="separate",
            flight_cta_timing="after_hotel",
            ui_enabled=True,
            booking_enabled=True,
            deals_source="legacy_catalog",
            max_flight_pp=120,
            min_per_origin=12,
            nearby_origins_km=100,
            fresh_tau_h=6,
            fresh_tau_short_h=3,
            revalidate_budget_per_hour=200,
            seed_catalog_size=25,
            seed_scan_budget_per_day=300,
            seed_min_budget_share=0.2,
            obs_retention_days=90,
            observations_enabled=True,
            community_score_weights={},
            scheduler_enabled=False,
            baseline_max_age_h=36,
            legacy_fallback_enabled=False,
            calendar_enabled=False,
            min_discount=0.15,
        )
        with self.assertRaises(LiteApiConfigError):
            validate_liteapi_keys(cfg)

    def test_mock_skips_key_check(self):
        os.environ["DEALS_PROVIDER"] = "mock"
        cfg = load_deals_config()
        validate_liteapi_keys(cfg)  # must not raise


class TestMockProvider(unittest.TestCase):
    def test_mock_lists_deals(self):
        reset_deal_provider()
        os.environ["DEALS_PROVIDER"] = "mock"
        p = get_deal_provider()
        self.assertIsInstance(p, MockDealProvider)
        deals = p.list_deals()
        self.assertGreater(len(deals), 0)
        self.assertEqual(deals[0]["provider"], "mock")
        self.assertIn("deal_key", deals[0])

    def test_origin_filter(self):
        p = MockDealProvider()
        mrs = p.list_deals(origin="MRS")
        self.assertTrue(all(d["departure_airport"] == "MRS" for d in mrs))


if __name__ == "__main__":
    unittest.main()
