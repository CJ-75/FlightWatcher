"""Unit tests for v4 vente helpers (no network)."""
from __future__ import annotations

from deals.community_list import (
    compute_deal_hook,
    compute_human_title,
    compute_why_good,
    diversify_wall_deals,
)
from deals.pool_photos import extract_main_photo, pick_cover_photo


def test_diversify_max_city_country():
    deals = [
        {"city": "Lisbonne", "country": "Portugal"},
        {"city": "Lisbonne", "country": "Portugal"},
        {"city": "Lisbonne", "country": "Portugal"},
        {"city": "Porto", "country": "Portugal"},
        {"city": "Faro", "country": "Portugal"},
        {"city": "Dublin", "country": "Irlande"},
        {"city": "Dublin", "country": "Irlande"},
        {"city": "Dublin", "country": "Irlande"},
    ]
    out = diversify_wall_deals(deals)
    assert len(out) == 5
    assert sum(1 for d in out if d["city"] == "Lisbonne") == 2
    assert sum(1 for d in out if d["country"] == "Portugal") == 3


def test_hook_prefers_baseline():
    hook = compute_deal_hook(
        {
            "badge": "x",
            "badge_meta": {"discount_pct": 32},
            "flight": {"direct": True, "price_pp": 53},
            "price_breakdown": {"flight_pp": 53, "hotel_pp": 87},
            "hotel": {"rating": 9.4},
            "nights": 2,
        }
    )
    assert hook and hook["kind"] == "baseline"
    assert "32" in hook["text"]


def test_why_good_max_three():
    bullets = compute_why_good(
        {
            "badge_meta": {"discount_pct": 25},
            "flight": {
                "direct": True,
                "out_dep_local": "2026-11-24T13:00:00",
                "ret_dep_local": "2026-11-26T17:10:00",
            },
            "hotel": {"rating": 9.4, "stars": 4, "review_count": 1490, "board": "BI", "refundable": True},
            "hotel_stars": 4,
            "baggage_line": "Petit sac inclus",
        }
    )
    assert 1 <= len(bullets) <= 3


def test_cover_skips_bedroom_when_facade_exists():
    url = pick_cover_photo(
        [
            ("https://cdn/room.jpg", "Bedroom"),
            ("https://cdn/facade.jpg", "Hotel facade"),
            ("https://cdn/bath.jpg", "Bathroom"),
        ]
    )
    assert url and "facade" in url


def test_extract_main_photo_from_raw_prefers_good():
    photo = extract_main_photo(
        {
            "raw": {
                "hotelImages": [
                    {"url": "https://x/bed.jpg", "caption": "Bedroom double"},
                    {"url": "https://x/lobby.jpg", "caption": "Lobby"},
                ]
            }
        }
    )
    assert photo and "lobby" in photo


def test_human_title_data_only():
    title = compute_human_title(
        {
            "city": "Lisbonne",
            "hotel": {"stars": 4, "rating": 9.4, "board": "BI"},
            "flight": {"direct": True},
            "nights": 2,
        }
    )
    assert title
    assert title.startswith("Lisbonne")
    assert "4★" in title
    assert "9.4" in title
    assert "vol direct" in title
    assert "petit-déj" in title
    assert "partent" not in title.lower()
