"""Adaptive TTL for deal caches (§8.1)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Union


def ttl_for_weekend(
    checkin: Union[date, str],
    *,
    now: Union[datetime, None] = None,
) -> timedelta:
    """
    Week-end ≤ J-7 : 2.5 h
    J-8 à J-21 : 6 h
    au-delà : 12 h
    """
    if isinstance(checkin, str):
        checkin = date.fromisoformat(checkin[:10])
    now = now or datetime.now(timezone.utc)
    today = now.date()
    days = (checkin - today).days
    if days <= 7:
        return timedelta(hours=2, minutes=30)
    if days <= 21:
        return timedelta(hours=6)
    return timedelta(hours=12)


def expires_at_for(
    checkin: Union[date, str],
    *,
    now: Union[datetime, None] = None,
) -> datetime:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now + ttl_for_weekend(checkin, now=now)
