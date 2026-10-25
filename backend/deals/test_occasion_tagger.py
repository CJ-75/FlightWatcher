"""Lot B — occasion tagger unit tests."""
from __future__ import annotations

from datetime import date

from deals.occasion_tagger import (
    rule_covers_nye,
    rule_moins_eur,
    rule_pont_noel,
    rule_sans_conge,
    rule_whitelist_iata,
    tag_deal_row,
)
from deals.occasions_config import HIVER_SOLEIL_IATA


def _row(**kwargs):
    base = {
        "deal_key": "T",
        "dest_iata": "AGP",
        "out_date": "2026-12-04",
        "ret_date": "2026-12-06",
        "nights": 2,
        "flight_snapshot": {
            "price_pp_eur": 40,
            "out_dep_local": "2026-12-04T18:30:00",
            "ret_dep_local": "2026-12-06T20:00:00",
            "direct": True,
        },
        "hotel_top3": [
            {
                "name": "H",
                "rating": 9.2,
                "review_count": 1500,
                "board": "BI",
                "public_hotel_price": 100,
            }
        ],
        "baseline_snapshot": {"median": 80},
        "discount_pct": None,
    }
    base.update(kwargs)
    return base


def test_sans_conge_friday_evening():
    assert rule_sans_conge(_row())
    early = _row(
        flight_snapshot={
            "price_pp_eur": 40,
            "out_dep_local": "2026-12-04T14:00:00",
            "ret_dep_local": "2026-12-06T20:00:00",
        }
    )
    assert not rule_sans_conge(early)


def test_moins_200():
    assert rule_moins_eur(_row())  # 40 + 50 = 90
    expensive = _row(
        flight_snapshot={"price_pp_eur": 180, "out_dep_local": "2026-12-04T18:30:00"},
        hotel_top3=[{"public_hotel_price": 80, "rating": 8}],
    )
    # 180+40=220
    assert not rule_moins_eur(expensive)


def test_hiver_soleil_whitelist():
    assert rule_whitelist_iata(_row(dest_iata="AGP"), iatas=HIVER_SOLEIL_IATA)
    assert not rule_whitelist_iata(_row(dest_iata="STN"), iatas=HIVER_SOLEIL_IATA)


def test_nouvel_an_and_pont_noel():
    nye = _row(out_date="2026-12-30", ret_date="2027-01-02")
    assert rule_covers_nye(nye)
    # 2026-12-25 is Friday
    xmas = _row(out_date="2026-12-24", ret_date="2026-12-27")
    assert rule_pont_noel(xmas)


def test_tag_deal_row_includes_launch_tags():
    tags, badge = tag_deal_row(_row(), today=date(2026, 10, 25))
    assert "sans-conge" in tags
    assert "moins-200" in tags
    assert "hiver-soleil" in tags
    assert "extras-offerts" in tags
    assert "hotel-plebiscite" in tags
    assert "il-fera-beau" not in tags
    # seasonal ambiance wins over evergreen for badge
    assert badge in tags
