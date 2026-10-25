"""P0 Lot 2 — weekend = Fri/Sat/Sun prefer; wall floor ≥30 with backfill."""
from deals.community_list import (
    WALL_MIN_DEALS,
    _apply_duration_with_floor,
    _deal_matches_duration,
    _is_weekend_outbound,
    diversify_wall_min,
)


def test_weekend_outbound_weekdays():
    assert _is_weekend_outbound("2026-11-27")  # Fri
    assert _is_weekend_outbound("2026-11-28")  # Sat
    assert _is_weekend_outbound("2026-11-29")  # Sun
    assert not _is_weekend_outbound("2026-11-24")  # Tue
    assert not _is_weekend_outbound("2026-11-26")  # Thu


def test_weekend_window_kind():
    assert _is_weekend_outbound("2026-11-24", "FRI_SUN")
    assert _is_weekend_outbound("", "SAT_MON")


def test_deal_matches_duration_weekend_rejects_midweek():
    midweek = {
        "nights": 2,
        "dates": {"outbound": "2026-11-24", "inbound": "2026-11-26"},
    }
    assert not _deal_matches_duration(midweek, "weekend")
    fri = {
        "nights": 2,
        "dates": {"outbound": "2026-11-27", "inbound": "2026-11-29"},
    }
    assert _deal_matches_duration(fri, "weekend")
    assert _deal_matches_duration({"nights": 4, "dates": {"outbound": "2026-11-24"}}, "short")


def test_weekend_floor_backfills_midweek_short_stays():
    deals = []
    for i in range(5):
        deals.append(
            {
                "id": f"fri-{i}",
                "deal_key": f"fri-{i}",
                "nights": 2,
                "dates": {"outbound": "2026-11-27", "inbound": "2026-11-29"},
                "city": f"City{i}",
                "country": f"Country{i}",
            }
        )
    for i in range(40):
        deals.append(
            {
                "id": f"tue-{i}",
                "deal_key": f"tue-{i}",
                "nights": 2,
                "dates": {"outbound": "2026-11-24", "inbound": "2026-11-26"},
                "city": f"Alt{i}",
                "country": f"Land{i % 10}",
            }
        )
    out = _apply_duration_with_floor(deals, "weekend", min_deals=WALL_MIN_DEALS)
    assert len(out) >= WALL_MIN_DEALS
    assert out[0]["id"].startswith("fri-")


def test_diversify_relaxes_to_hit_floor():
    deals = [
        {
            "id": str(i),
            "deal_key": str(i),
            "city": "Lisbon" if i < 20 else f"C{i}",
            "country": "Portugal" if i < 20 else f"X{i}",
            "nights": 2,
            "dates": {"outbound": "2026-11-27"},
        }
        for i in range(40)
    ]
    out = diversify_wall_min(deals, target=36, min_deals=30)
    assert len(out) >= 30
