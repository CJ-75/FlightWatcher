"""P0 Lot 2 — weekend = Fri/Sat/Sun depart, not midweek short stays."""
from deals.community_list import _deal_matches_duration, _is_weekend_outbound


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
