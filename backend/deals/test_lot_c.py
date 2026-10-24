"""Lot C — live/cached badges, share cap, kill switch."""
from __future__ import annotations

import unittest

from deals.click_checks import evaluate_cached_kill_switch
from deals.verification import (
    LEVEL_CACHED,
    LEVEL_LIVE,
    apply_cached_share_cap,
    badge_for_deal_level,
    prefer_observation,
    verification_level_for_provider,
)
from deals.community_list import badge_for_baseline


class TestVerificationLevel(unittest.TestCase):
    def test_providers(self):
        self.assertEqual(verification_level_for_provider("ryanair"), LEVEL_LIVE)
        self.assertEqual(verification_level_for_provider("travelpayouts"), LEVEL_CACHED)
        self.assertEqual(verification_level_for_provider("aviasales"), LEVEL_CACHED)

    def test_prefer_live(self):
        live = {"provider": "ryanair", "price_pp_eur": 90}
        cached = {"provider": "travelpayouts", "price_pp_eur": 70}
        self.assertEqual(prefer_observation(live, cached)["provider"], "ryanair")

    def test_cached_never_percent(self):
        bl_badge = badge_for_baseline(
            {
                "reliable": True,
                "baseline_kind": "observed",
                "discount_pct": 32.0,
            }
        )
        cached = badge_for_deal_level(bl_badge, verification_level=LEVEL_CACHED)
        self.assertIsNone(cached.get("discount_pct"))
        self.assertIn("confirmer", cached["label"].lower())
        self.assertNotIn("%", cached["label"])

    def test_share_cap_30(self):
        deals = []
        for i in range(7):
            deals.append(
                {
                    "verification_level": LEVEL_LIVE,
                    "deal_score": 10 - i,
                    "deal_key": f"L{i}",
                }
            )
        for i in range(7):
            deals.append(
                {
                    "verification_level": LEVEL_CACHED,
                    "deal_score": 9 - i * 0.1,
                    "deal_key": f"C{i}",
                }
            )
        out = apply_cached_share_cap(deals, max_share=0.30, cached_enabled=True)
        n_cached = sum(1 for d in out if d["verification_level"] == LEVEL_CACHED)
        n_live = sum(1 for d in out if d["verification_level"] == LEVEL_LIVE)
        self.assertEqual(n_live, 7)
        # cached <= live * share/(1-share) ≈ 7*0.3/0.7 ≈ 3
        self.assertLessEqual(n_cached / max(1, len(out)), 0.35)
        self.assertLessEqual(n_cached, 3)

    def test_cached_disabled(self):
        deals = [
            {"verification_level": LEVEL_LIVE, "deal_score": 1, "deal_key": "a"},
            {"verification_level": LEVEL_CACHED, "deal_score": 2, "deal_key": "b"},
        ]
        out = apply_cached_share_cap(deals, max_share=0.30, cached_enabled=False)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["verification_level"], LEVEL_LIVE)


class TestKillSwitch(unittest.TestCase):
    def test_40_clicks_12_bad_kills(self):
        rows = []
        for i in range(28):
            rows.append(
                {
                    "verification_level": LEVEL_CACHED,
                    "outcome": "ok",
                    "delta_pct": 2,
                }
            )
        for i in range(12):
            rows.append(
                {
                    "verification_level": LEVEL_CACHED,
                    "outcome": "higher",
                    "delta_pct": 15,
                }
            )
        # 12/40 = 0.30 > 0.25
        v = evaluate_cached_kill_switch(rows, min_clicks=30, threshold=0.25)
        self.assertEqual(v["n_clicks"], 40)
        self.assertEqual(v["n_bad"], 12)
        self.assertTrue(v["should_kill"])

    def test_insufficient_clicks(self):
        rows = [
            {"verification_level": LEVEL_CACHED, "outcome": "higher", "delta_pct": 20}
        ] * 10
        v = evaluate_cached_kill_switch(rows, min_clicks=30, threshold=0.25)
        self.assertFalse(v["should_kill"])
        self.assertEqual(v["reason"], "insufficient_clicks")


# Lot C note: Travelpayouts prices_for_dates — no found_at mapped → age filter N/A.
TP_FOUND_AT_AVAILABLE = False


if __name__ == "__main__":
    unittest.main()
