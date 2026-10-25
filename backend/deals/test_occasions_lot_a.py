"""Lot A — holiday / daylight / config unit tests (no network required)."""
from __future__ import annotations

from datetime import date

from deals.daylight_service import daylight_hours, jours_sans_fin
from deals.holiday_service import (
    ascension,
    easter_sunday,
    fixture_school_holidays_2026_2027,
    french_public_holidays,
    is_french_workday,
    is_hors_vacances,
    mardi_gras,
    midsommar_friday,
    overlaps_school_holidays,
    pentecote_monday,
    workdays_in_range,
)
from deals.occasions_config import (
    MOINS_EUR,
    launch_chip_slugs,
    occasion_by_slug,
    pick_badge,
)


def test_moins_threshold_is_200():
    assert MOINS_EUR == 200
    o = occasion_by_slug("moins-200")
    assert o and o["params"]["max_pp"] == 200
    assert occasion_by_slug("moins-150") is None


def test_easter_2026_2030():
    # Known Western Easter Sundays
    expected = {
        2026: date(2026, 4, 5),
        2027: date(2027, 3, 28),
        2028: date(2028, 4, 16),
        2029: date(2029, 4, 1),
        2030: date(2030, 4, 21),
    }
    for y, d in expected.items():
        assert easter_sunday(y) == d, y


def test_mardi_gras_ascension_pentecote_2027():
    assert mardi_gras(2027) == date(2027, 2, 9)
    assert ascension(2027) == date(2027, 5, 6)
    assert pentecote_monday(2027) == date(2027, 5, 17)


def test_midsommar_friday_range():
    for y in range(2026, 2031):
        d = midsommar_friday(y)
        assert d.month == 6
        assert 19 <= d.day <= 25
        assert d.weekday() == 4


def test_french_holidays_2026_2027_samples():
    h26 = french_public_holidays(2026)
    assert date(2026, 12, 25) in h26  # Friday
    assert date(2026, 5, 14) in h26  # Ascension 2026 = Easter+39 (Apr 5 + 39 = May 14)
    h27 = french_public_holidays(2027)
    assert date(2027, 1, 1) in h27
    assert date(2027, 5, 6) in h27  # Ascension
    assert date(2027, 5, 17) in h27  # Pentecôte
    assert date(2027, 11, 11) in h27


def test_workday_excludes_weekend_and_holiday():
    assert not is_french_workday(date(2026, 12, 25))  # Fri holiday
    assert not is_french_workday(date(2026, 12, 26))  # Sat
    assert is_french_workday(date(2026, 12, 22))  # Tue


def test_workdays_in_range_pont():
    # Thu 11 Nov 2027 holiday → Sun 14: workdays Fri only if not holiday
    n = workdays_in_range(date(2027, 11, 11), date(2027, 11, 14))
    assert n == 1  # Friday 12 only (11 holiday, 13–14 weekend)


def test_school_fixture_noel_overlap():
    periods = fixture_school_holidays_2026_2027()
    assert overlaps_school_holidays(
        date(2026, 12, 24), date(2026, 12, 27), periods=periods
    )
    assert is_hors_vacances(
        date(2026, 11, 10), date(2026, 11, 12), periods=periods
    )


def test_daylight_polar_and_tropics():
    # Tromsø ~69.6N midwinter short / midsummer long
    assert daylight_hours(69.65, date(2026, 12, 21)) < 4
    assert daylight_hours(69.65, date(2026, 6, 21)) > 20
    assert jours_sans_fin(69.65, date(2026, 6, 21), min_hours=18)
    assert not jours_sans_fin(43.6, date(2026, 6, 21), min_hours=18)  # Nice


def test_launch_chips_and_badge_priority():
    chips = launch_chip_slugs()
    assert chips[0] == "sans-conge"
    assert chips[-1] == "moins-200"
    assert len(chips) == 6
    assert pick_badge(["moins-200", "sans-conge", "ambiance-noel"]) == "ambiance-noel"
    assert pick_badge(["sans-conge"], has_discount_badge=True) is None


def test_il_fera_beau_disabled_until_weather_lot():
    o = occasion_by_slug("il-fera-beau")
    assert o and o.get("verified") is False
