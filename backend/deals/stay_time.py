"""Europe/Paris wall-clock helpers for Séjours eligibility."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional

_PARIS = timezone(timedelta(hours=1))
try:
    from zoneinfo import ZoneInfo

    _PARIS = ZoneInfo("Europe/Paris")
except Exception:
    pass


def paris_today_iso() -> str:
    return datetime.now(_PARIS).date().isoformat()


def paris_now() -> datetime:
    return datetime.now(_PARIS)


def parse_paris_wall_dt(raw: Any) -> Optional[datetime]:
    """Parse local flight datetime; naive → Europe/Paris. Date-only → None here."""
    if not raw:
        return None
    try:
        s = str(raw).strip().replace("Z", "+00:00")
        if len(s) < 16:
            # YYYY-MM-DD only — caller uses date floor, not midnight hide.
            return None
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=_PARIS)
        return dt
    except Exception:
        return None


def deal_start_dt(deal_or_row: Dict[str, Any]) -> Optional[datetime]:
    """Outbound departure local time from deal or deals_active row."""
    flight = deal_or_row.get("flight")
    if not isinstance(flight, dict):
        flight = deal_or_row.get("flight_snapshot")
    if not isinstance(flight, dict):
        flight = {}
    for key in (
        "outbound_local",
        "out_dep_local",
        "outbound_dep_local",
        "departure_local",
        "departureTime",
        "departure_time",
    ):
        dt = parse_paris_wall_dt(flight.get(key))
        if dt:
            return dt
    return None


def deal_start_still_upcoming(deal_or_row: Dict[str, Any], today: Optional[str] = None) -> bool:
    """
    Keep deal if start datetime (Paris) is still in the future.
    Without a flight time: keep when out_date >= today (Paris calendar).
    """
    t = today or paris_today_iso()
    starts = deal_start_dt(deal_or_row)
    if starts is not None:
        return paris_now() < starts

    out = str(deal_or_row.get("out_date") or "")[:10]
    if len(out) < 10:
        dates = deal_or_row.get("dates") if isinstance(deal_or_row.get("dates"), dict) else {}
        out = str((dates or {}).get("outbound") or "")[:10]
    return len(out) >= 10 and out >= t
