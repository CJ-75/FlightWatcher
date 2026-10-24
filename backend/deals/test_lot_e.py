"""Lot E — seed origin priority + reduced date sets."""
from __future__ import annotations

import os
import unittest
from datetime import date
from unittest.mock import patch

from deals.liteapi_config import DealsConfig
from deals.seed_catalog import date_pairs_from_sets, ordered_seed_origins


def _cfg(**kwargs):
    base = dict(
        provider="mock",
        liteapi_env="sandbox",
        api_key="",
        payment_public_key="",
        search_base="",
        book_base="",
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
        deals_source="community",
        max_flight_pp=120,
        min_per_origin=12,
        nearby_origins_km=100,
        fresh_tau_h=6,
        fresh_tau_short_h=3,
        revalidate_budget_per_hour=10,
        seed_catalog_size=25,
        seed_scan_budget_per_day=10,
        seed_min_budget_share=0.2,
        obs_retention_days=90,
        observations_enabled=True,
        community_score_weights={},
        scheduler_enabled=False,
        baseline_max_age_h=36,
        legacy_fallback_enabled=False,
        calendar_enabled=False,
        min_discount=0.15,
        cached_enabled=True,
        cached_max_share=0.30,
        cached_max_age_h=48,
        kill_min_clicks=30,
        kill_threshold=0.25,
    )
    base.update(kwargs)
    return DealsConfig(**base)


class TestLotESeed(unittest.TestCase):
    def test_priority_origins_first(self):
        with patch.dict(
            os.environ,
            {
                "DEALS_ORIGINS": "CDG,ORY,BVA,MRS,TLS",
                "SEED_PRIORITY_ORIGINS": "BVA,MRS,TLS",
            },
            clear=False,
        ):
            ordered = ordered_seed_origins(_cfg())
        self.assertEqual(ordered[:3], ["BVA", "MRS", "TLS"])
        self.assertIn("CDG", ordered)
        self.assertEqual(len(ordered), 5)

    def test_date_sets_weekend3_short1(self):
        pairs = date_pairs_from_sets("WEEKEND3,SHORT1")
        self.assertEqual(len(pairs), 4)
        for out_d, ret_d in pairs[:3]:
            self.assertEqual(
                (date.fromisoformat(ret_d) - date.fromisoformat(out_d)).days,
                2,
            )


if __name__ == "__main__":
    unittest.main()
