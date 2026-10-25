"""
v4 Occasions Lot A — daylight duration from latitude + date (no API).
Uses NOAA-style solar equations (approximation, good enough for ≥18 h filter).
"""
from __future__ import annotations

import math
from datetime import date
from typing import Optional


def _day_of_year(d: date) -> int:
    return d.timetuple().tm_yday


def daylight_hours(lat: float, d: date, *, lon: float = 0.0) -> Optional[float]:
    """
    Approximate daylight length in hours at latitude (degrees) on date d.
    Returns None if polar day/night formula breaks (caller treats as extreme).
    """
    try:
        lat_r = math.radians(float(lat))
    except (TypeError, ValueError):
        return None

    n = _day_of_year(d)
    # Solar declination (degrees)
    decl = 23.44 * math.sin(math.radians(360.0 / 365.0 * (n - 81)))
    decl_r = math.radians(decl)

    # Hour angle of sunrise
    cos_ha = -math.tan(lat_r) * math.tan(decl_r)
    if cos_ha >= 1.0:
        return 0.0  # polar night
    if cos_ha <= -1.0:
        return 24.0  # midnight sun
    ha = math.degrees(math.acos(cos_ha))
    return max(0.0, min(24.0, 2.0 * ha / 15.0))


def jours_sans_fin(lat: float, d: date, *, min_hours: float = 18.0) -> bool:
    h = daylight_hours(lat, d)
    if h is None:
        return False
    return h >= min_hours
