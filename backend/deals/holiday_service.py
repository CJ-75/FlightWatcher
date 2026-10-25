"""
v4 Occasions Lot A — French public holidays (local calc) + school holidays (MENJ open data).
No paid APIs. Optional OpenHolidays destination holidays = later.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

logger = logging.getLogger("deals.holiday_service")

_CACHE_LOCK = threading.Lock()
_SCHOOL_CACHE: Dict[str, Any] = {"fetched_at": 0.0, "periods": []}
_SCHOOL_TTL_S = 30 * 24 * 3600  # 30 days
_CACHE_DIR = Path(__file__).resolve().parent / ".cache"
_SCHOOL_CACHE_FILE = _CACHE_DIR / "school_holidays_fr.json"

# data.education.gouv.fr — calendrier scolaire (licence ouverte)
_MENJ_URL = (
    "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/"
    "fr-en-calendrier-scolaire/records"
)


# —— Easter (Anonymous Gregorian algorithm) ——


def easter_sunday(year: int) -> date:
    """Western Easter Sunday for a given Gregorian year."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def mardi_gras(year: int) -> date:
    """Shrove Tuesday = Easter − 47 days."""
    return easter_sunday(year) - timedelta(days=47)


def ascension(year: int) -> date:
    """Thursday, Easter + 39."""
    return easter_sunday(year) + timedelta(days=39)


def pentecote_monday(year: int) -> date:
    """Whit Monday = Easter + 50."""
    return easter_sunday(year) + timedelta(days=50)


def midsommar_friday(year: int) -> date:
    """Swedish Midsummer Eve: Friday between 19 and 25 June inclusive."""
    for day in range(19, 26):
        d = date(year, 6, day)
        if d.weekday() == 4:  # Friday
            return d
    raise RuntimeError(f"no Midsummer Friday in June 19–25 {year}")


def french_public_holidays(year: int) -> Set[date]:
    """
    Jours fériés légaux en France métropolitaine (pas de jours locaux Alsace-Moselle).
    """
    e = easter_sunday(year)
    fixed = {
        date(year, 1, 1),
        date(year, 5, 1),
        date(year, 5, 8),
        date(year, 7, 14),
        date(year, 8, 15),
        date(year, 11, 1),
        date(year, 11, 11),
        date(year, 12, 25),
    }
    movable = {
        e,  # dimanche de Pâques (not always a statutory weekday off, but useful)
        e + timedelta(days=1),  # lundi de Pâques
        ascension(year),
        pentecote_monday(year),
    }
    # Statutory weekday offs for FR: drop Easter Sunday from "congé" counting helpers
    return fixed | movable


def is_french_public_holiday(d: date) -> bool:
    return d in french_public_holidays(d.year)


def is_french_workday(d: date) -> bool:
    """Mon–Fri and not a public holiday (Easter Sunday treated as non-work)."""
    if d.weekday() >= 5:
        return False
    hols = french_public_holidays(d.year)
    # Remove Easter Sunday from blocking Mon–Fri (it's never Mon–Fri)
    return d not in hols


def workdays_in_range(start: date, end: date) -> int:
    """Inclusive calendar days that are French workdays."""
    if end < start:
        return 0
    n = 0
    cur = start
    while cur <= end:
        if is_french_workday(cur):
            n += 1
        cur += timedelta(days=1)
    return n


# —— School holidays (MENJ) ——


def _parse_menj_record(rec: Dict[str, Any]) -> Optional[Tuple[date, date, str]]:
    """Return (start, end, zones) if usable."""
    start_s = rec.get("start_date") or rec.get("date_debut") or rec.get("start")
    end_s = rec.get("end_date") or rec.get("date_fin") or rec.get("end")
    zones = (
        rec.get("zones")
        or rec.get("zone")
        or rec.get("location")
        or rec.get("population")
        or ""
    )
    if not start_s or not end_s:
        return None
    try:
        start = date.fromisoformat(str(start_s)[:10])
        end = date.fromisoformat(str(end_s)[:10])
    except ValueError:
        return None
    return start, end, str(zones)


def _load_school_cache_file() -> List[Dict[str, str]]:
    try:
        if _SCHOOL_CACHE_FILE.is_file():
            data = json.loads(_SCHOOL_CACHE_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("periods"), list):
                return data["periods"]
    except Exception as e:
        logger.debug("school cache read: %s", e)
    return []


def _save_school_cache_file(periods: List[Dict[str, str]]) -> None:
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "periods": periods,
        }
        _SCHOOL_CACHE_FILE.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        logger.warning("school cache write: %s", e)


def fetch_school_holidays_fr(
    *,
    force: bool = False,
    years: Optional[Iterable[int]] = None,
) -> List[Dict[str, str]]:
    """
    Fetch / cache French school holiday periods (all zones).
    Returns [{start, end, zones}, ...] ISO dates.
    Falls back to on-disk cache then empty list if network fails.
    """
    now = time.monotonic()
    with _CACHE_LOCK:
        if (
            not force
            and _SCHOOL_CACHE["periods"]
            and now - float(_SCHOOL_CACHE["fetched_at"]) < _SCHOOL_TTL_S
        ):
            return list(_SCHOOL_CACHE["periods"])

    year_list = list(years) if years else [date.today().year, date.today().year + 1]
    periods: List[Dict[str, str]] = []

    try:
        import httpx

        for y in year_list:
            # API v2.1 — filter by school year start roughly
            params = {
                "limit": 100,
                "where": f'start_date >= "{y}-01-01" AND start_date < "{y + 1}-12-31"',
            }
            try:
                resp = httpx.get(_MENJ_URL, params=params, timeout=20.0)
                if resp.status_code >= 400:
                    # alternate: no where clause
                    resp = httpx.get(
                        _MENJ_URL,
                        params={"limit": 100, "refine": f"annee_scolaire:{y}-{y + 1}"},
                        timeout=20.0,
                    )
                if resp.status_code >= 400:
                    logger.warning("MENJ HTTP %s: %s", resp.status_code, resp.text[:200])
                    continue
                payload = resp.json()
                rows = payload.get("results") or payload.get("records") or []
                for row in rows:
                    fields = row.get("record", {}).get("fields") if "record" in row else row
                    if not isinstance(fields, dict):
                        continue
                    parsed = _parse_menj_record(fields)
                    if not parsed:
                        continue
                    start, end, zones = parsed
                    periods.append(
                        {
                            "start": start.isoformat(),
                            "end": end.isoformat(),
                            "zones": zones,
                        }
                    )
            except Exception as e:
                logger.warning("MENJ fetch year=%s: %s", y, e)
    except Exception as e:
        logger.warning("MENJ unavailable: %s", e)

    if periods:
        # dedupe
        seen = set()
        uniq: List[Dict[str, str]] = []
        for p in periods:
            key = (p["start"], p["end"], p.get("zones") or "")
            if key in seen:
                continue
            seen.add(key)
            uniq.append(p)
        periods = uniq
        with _CACHE_LOCK:
            _SCHOOL_CACHE["fetched_at"] = time.monotonic()
            _SCHOOL_CACHE["periods"] = periods
        _save_school_cache_file(periods)
        return periods

    # fallback disk
    disk = _load_school_cache_file()
    if disk:
        with _CACHE_LOCK:
            _SCHOOL_CACHE["fetched_at"] = time.monotonic()
            _SCHOOL_CACHE["periods"] = disk
        return disk
    return []


def school_periods_as_dates(
    periods: Optional[List[Dict[str, str]]] = None,
) -> List[Tuple[date, date]]:
    src = periods if periods is not None else fetch_school_holidays_fr()
    out: List[Tuple[date, date]] = []
    for p in src:
        try:
            out.append(
                (date.fromisoformat(p["start"][:10]), date.fromisoformat(p["end"][:10]))
            )
        except (KeyError, ValueError):
            continue
    return out


def overlaps_school_holidays(
    stay_start: date,
    stay_end: date,
    *,
    periods: Optional[List[Dict[str, str]]] = None,
) -> bool:
    """True if [stay_start, stay_end] overlaps any MENJ school holiday (any zone)."""
    for a, b in school_periods_as_dates(periods):
        if stay_start <= b and stay_end >= a:
            return True
    return False


def is_hors_vacances(
    stay_start: date,
    stay_end: date,
    *,
    periods: Optional[List[Dict[str, str]]] = None,
) -> bool:
    return not overlaps_school_holidays(stay_start, stay_end, periods=periods)


# —— Fixture helpers for tests (2026–2027 published calendar) ——


def fixture_school_holidays_2026_2027() -> List[Dict[str, str]]:
    """
    Official-ish windows used as test fixtures (prompt §4).
    Not used in production — production uses MENJ.
    """
    return [
        # Noël toutes zones
        {"start": "2026-12-19", "end": "2027-01-04", "zones": "A,B,C"},
        # Hiver
        {"start": "2027-02-06", "end": "2027-02-22", "zones": "C"},
        {"start": "2027-02-13", "end": "2027-03-01", "zones": "A"},
        {"start": "2027-02-20", "end": "2027-03-08", "zones": "B"},
        # Printemps
        {"start": "2027-04-03", "end": "2027-04-19", "zones": "C"},
        {"start": "2027-04-10", "end": "2027-04-26", "zones": "A"},
        {"start": "2027-04-17", "end": "2027-05-03", "zones": "B"},
        # Été
        {"start": "2027-07-03", "end": "2027-09-01", "zones": "A,B,C"},
    ]
