"""Lot C — occasions API chip visibility + min_deals gating (no network)."""
from __future__ import annotations

from datetime import date
from unittest.mock import patch

from deals.occasions_api import _chip_visible, list_active_occasions
from deals.occasions_config import occasion_by_slug


def test_il_fera_beau_hidden_until_verified():
    o = occasion_by_slug("il-fera-beau")
    assert o is not None
    assert o.get("verified") is False
    assert not _chip_visible(o, date(2026, 10, 25))


def test_moins_200_evergreen_visible():
    o = occasion_by_slug("moins-200")
    assert o is not None
    assert _chip_visible(o, date(2026, 7, 1))
    assert _chip_visible(o, date(2026, 12, 15))


def test_ambiance_noel_seasonal_window():
    o = occasion_by_slug("ambiance-noel")
    assert o is not None
    assert _chip_visible(o, date(2026, 10, 25))
    assert _chip_visible(o, date(2026, 12, 10))
    # Mid-summer — promote_months typically exclude July
    months = o.get("promote_months") or []
    if 7 not in months:
        assert not _chip_visible(o, date(2026, 7, 15))


def test_list_active_occasions_min_deals_and_main():
    fake_deals = [
        {"occasion_tags": ["moins-200", "sans-conge"]},
        {"occasion_tags": ["moins-200", "hiver-soleil"]},
        {"occasion_tags": ["moins-200"]},
        {"occasion_tags": ["sans-conge"]},
        {"occasion_tags": ["sans-conge"]},
        {"occasion_tags": ["hiver-soleil"]},
        {"occasion_tags": ["hiver-soleil"]},
        {"occasion_tags": ["ambiance-noel"]},
        {"occasion_tags": ["ambiance-noel"]},
        {"occasion_tags": ["ambiance-noel"]},
    ]

    with patch(
        "deals.community_list.list_community_deals",
        return_value=fake_deals,
    ):
        out = list_active_occasions(
            supabase=object(),
            origin="CDG",
            adults=2,
            today=date(2026, 10, 25),
            min_deals=3,
        )

    assert out["ok"] is True
    main_slugs = [c["slug"] for c in out["main"]]
    assert "moins-200" in main_slugs
    assert "sans-conge" in main_slugs
    assert "ambiance-noel" in main_slugs
    # hiver-soleil has 3 — can appear
    counts = {c["slug"]: c["count"] for c in out["main"] + out["more"]}
    assert counts.get("moins-200") == 3
    assert counts.get("sans-conge") == 3
    # Single-tag occasion with only 1 deal stays out
    assert "nouvel-an" not in counts
    assert all(c["count"] >= 3 for c in out["main"] + out["more"])
    assert len(out["main"]) <= 6
    all_slugs = [c["slug"] for c in out["main"] + out["more"]]
    assert len(all_slugs) == len(set(all_slugs))
