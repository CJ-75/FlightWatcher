"""Lot D — weather horizon + il-fera-beau temps (no network)."""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import patch

from deals.weather_service import (
    _parse_daily,
    forecast_horizon_days,
    rule_il_fera_beau_temps,
    stay_within_horizon,
    weather_enabled,
)


def test_weather_disabled_by_default():
    with patch.dict("os.environ", {"DEALS_WEATHER_ENABLED": ""}, clear=False):
        assert weather_enabled() is False


def test_horizon_gate():
    today = date(2026, 10, 25)
    assert stay_within_horizon(
        today + timedelta(days=1),
        today + timedelta(days=3),
        today=today,
        horizon=7,
    )
    assert not stay_within_horizon(
        today + timedelta(days=8),
        today + timedelta(days=10),
        today=today,
        horizon=7,
    )


def test_parse_daily_payload():
    payload = {
        "weatherData": [
            {
                "dailyWeather": {
                    "date": "2026-10-26",
                    "temperature": {"min": 14.0, "max": 19.5},
                }
            },
            {
                "dailyWeather": {
                    "date": "2026-10-27",
                    "temperature": {"min": 15.0, "max": 21.0},
                }
            },
        ]
    }
    days = _parse_daily(payload)
    assert len(days) == 2
    assert days[0]["max_c"] == 19.5


def test_il_fera_beau_majority_winter():
    out = date(2026, 12, 4)
    # winter thr 18 — 2/3 good
    assert rule_il_fera_beau_temps([19, 17, 20], out_d=out, winter_min_c=18)
    assert not rule_il_fera_beau_temps([16, 17, 15], out_d=out, winter_min_c=18)


def test_il_fera_beau_summer_threshold():
    out = date(2026, 7, 10)
    assert rule_il_fera_beau_temps([25, 24, 26], out_d=out, summer_min_c=24)
    assert not rule_il_fera_beau_temps([22, 23, 23], out_d=out, summer_min_c=24)


def test_horizon_env_default():
    assert forecast_horizon_days() >= 1
