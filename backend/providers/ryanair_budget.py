"""
v3.2 — shared Ryanair hourly call budget (priority queue).

Priority (lower = more important):
  click → revalidate → organic → promote

Seed must NOT call Ryanair (Travelpayouts only).
"""
from __future__ import annotations

import logging
import os
import threading
import time
from collections import deque
from typing import Deque, Dict, Optional

logger = logging.getLogger("providers.ryanair_budget")

PURPOSE_CLICK = "click"
PURPOSE_REVALIDATE = "revalidate"
PURPOSE_ORGANIC = "organic"
PURPOSE_PROMOTE = "promote"

PRIORITY = {
    PURPOSE_CLICK: 0,
    PURPOSE_REVALIDATE: 1,
    PURPOSE_ORGANIC: 2,
    PURPOSE_PROMOTE: 3,
}

_lock = threading.Lock()
_calls: Deque[float] = deque()  # monotonic timestamps of successful acquires
_denied: Dict[str, int] = {}


def _hourly_budget() -> int:
    try:
        return max(1, int(os.getenv("RYANAIR_BUDGET_PER_HOUR", "40")))
    except (TypeError, ValueError):
        return 40


def _prune(now: float) -> None:
    cutoff = now - 3600.0
    while _calls and _calls[0] < cutoff:
        _calls.popleft()


def remaining() -> int:
    with _lock:
        now = time.monotonic()
        _prune(now)
        return max(0, _hourly_budget() - len(_calls))


def try_acquire(purpose: str) -> bool:
    """
    Reserve one Ryanair HTTP slot for this hour.
    Higher-priority purposes always win while budget remains;
    we do not preempt in-flight calls — just refuse lower priority when empty.
    """
    purpose = (purpose or PURPOSE_ORGANIC).lower()
    if purpose not in PRIORITY:
        purpose = PURPOSE_ORGANIC
    with _lock:
        now = time.monotonic()
        _prune(now)
        budget = _hourly_budget()
        if len(_calls) >= budget:
            _denied[purpose] = _denied.get(purpose, 0) + 1
            logger.info(
                "ryanair budget DENY purpose=%s used=%s/%s",
                purpose,
                len(_calls),
                budget,
            )
            return False
        _calls.append(now)
        logger.debug(
            "ryanair budget OK purpose=%s used=%s/%s",
            purpose,
            len(_calls),
            budget,
        )
        return True


def status_snapshot() -> Dict[str, object]:
    with _lock:
        now = time.monotonic()
        _prune(now)
        return {
            "budget_per_hour": _hourly_budget(),
            "used_last_hour": len(_calls),
            "remaining": max(0, _hourly_budget() - len(_calls)),
            "denied_by_purpose": dict(_denied),
            "priority": dict(PRIORITY),
            "note": (
                "No official Ryanair month calendar in ryanair-py "
                "(oneWayFares / roundTripFares only)."
            ),
        }


def reset_for_tests() -> None:
    with _lock:
        _calls.clear()
        _denied.clear()
