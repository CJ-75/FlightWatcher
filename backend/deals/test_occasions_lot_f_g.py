"""Lot F/G — occasion digests caps + admin snapshot (no network)."""
from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock, patch

from deals.occasion_alerts import _MIN_DEALS, _pushable_slugs, run_occasion_digests
from deals.occasions_admin import collect_occasions_admin
from deals.occasions_config import occasion_by_slug


def test_pushable_includes_launch_set():
    slugs = _pushable_slugs()
    assert "moins-200" in slugs
    assert "sans-conge" in slugs
    assert "il-fera-beau" in slugs  # gated at send-time by DEALS_WEATHER_ENABLED
    assert occasion_by_slug("il-fera-beau").get("push") is True


def test_min_deals_threshold():
    assert _MIN_DEALS == 3


def test_admin_snapshot_no_supabase():
    out = collect_occasions_admin(None, today=date(2026, 10, 25))
    assert out["ok"] is True
    assert out["error"] == "no_supabase"
    unverified_slugs = {u["slug"] for u in out["unverified"]}
    assert "il-fera-beau" in unverified_slugs
    assert out["weather_enabled"] is False


def test_occasion_digests_skips_low_volume():
    supabase = MagicMock()
    # active subscribers
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"email": "a@b.co", "origin_iata": "CDG", "origin_label": "Paris", "status": "active"}]
    )

    with patch(
        "deals.community_list.list_community_deals",
        return_value=[{"city": "X"}, {"city": "Y"}],  # only 2 < 3
    ):
        with patch("deals.occasion_alerts._pushable_slugs", return_value=["moins-200"]):
            with patch("deals.occasion_alerts.occasion_by_slug") as ob:
                ob.return_value = {
                    "slug": "moins-200",
                    "label": "Moins de 200 €",
                    "push": True,
                    "verified": True,
                    "explain": "test",
                }
                out = run_occasion_digests(supabase, dry_run=True, force=True)

    assert out["skipped_volume"] >= 1
    assert out["email_sent"] == 0
