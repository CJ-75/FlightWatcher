"""Week-end Séjours = Fri→Sun prefer; wall floor ≥30 with backfill."""
from deals.community_list import (
    WALL_MIN_DEALS,
    _apply_duration_with_floor,
    _deal_matches_duration,
    _is_fri_sun_weekend,
    _is_weekend_outbound,
    diversify_wall_min,
)


def test_fri_sun_weekend_dates():
    # Fri → Sun
    assert _is_fri_sun_weekend("2026-11-27", "2026-11-29")
    # Sat → Sun interdit
    assert not _is_fri_sun_weekend("2026-11-28", "2026-11-29")
    # Sun outbound interdit
    assert not _is_fri_sun_weekend("2026-11-29", "2026-11-30")
    # Tue interdit
    assert not _is_fri_sun_weekend("2026-11-24", "2026-11-26")
    # Thu → Sun interdit
    assert not _is_fri_sun_weekend("2026-11-26", "2026-11-29")


def test_fri_sun_window_kind():
    assert _is_fri_sun_weekend("2026-11-24", None, "FRI_SUN")
    assert not _is_fri_sun_weekend("", None, "SAT_MON")
    assert _is_weekend_outbound("2026-11-27")  # Fri alone (compat)


def test_deal_matches_duration_weekend_rejects_sat_sun():
    sat_sun = {
        "nights": 1,
        "dates": {"outbound": "2026-11-28", "inbound": "2026-11-29"},
    }
    assert not _deal_matches_duration(sat_sun, "weekend")
    fri_sun = {
        "nights": 2,
        "dates": {"outbound": "2026-11-27", "inbound": "2026-11-29"},
    }
    assert _deal_matches_duration(fri_sun, "weekend")
    midweek = {
        "nights": 2,
        "dates": {"outbound": "2026-11-24", "inbound": "2026-11-26"},
    }
    assert not _deal_matches_duration(midweek, "weekend")
    assert _deal_matches_duration(
        {"nights": 4, "dates": {"outbound": "2026-11-24"}}, "short"
    )


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
