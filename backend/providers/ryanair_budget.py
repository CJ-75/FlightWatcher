"""
v3.2 — shared Ryanair hourly call budget (priority queue).

Background jobs (revalidate / promote / seed) are capped per hour.
User-facing Search (organic) and click revalidate always proceed.

Seed may call Ryanair sparingly (PURPOSE_SEED) — slow pause + max cells/run
in deals.seed_catalog to avoid 403.
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
PURPOSE_SEED = "seed"
PURPOSE_PROMOTE = "promote"

PRIORITY = {
    PURPOSE_CLICK: 0,
    PURPOSE_REVALIDATE: 1,
    PURPOSE_ORGANIC: 2,
    PURPOSE_SEED: 3,
    PURPOSE_PROMOTE: 4,
}

_lock = threading.Lock()
_calls: Deque[float] = deque()  # monotonic timestamps of successful acquires
_denied: Dict[str, int] = {}
_forbidden: Deque[float] = deque()  # 403 timestamps (v3.3 Lot F)


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

    User-facing Search (organic) and click revalidate always proceed —
    the hourly cap throttles background jobs (seed / revalidate / promote).
    """
    purpose = (purpose or PURPOSE_ORGANIC).lower()
    if purpose not in PRIORITY:
        purpose = PURPOSE_ORGANIC
    # Never block the Search tab / outbound click checks
    if purpose in (PURPOSE_ORGANIC, PURPOSE_CLICK):
        with _lock:
            _prune(time.monotonic())
            _calls.append(time.monotonic())
        return True
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
        used = len(_calls)
    logger.debug(
        "ryanair budget OK purpose=%s used=%s/%s",
        purpose,
        used,
        budget,
    )
    return True


def record_forbidden() -> None:
    """Count a Ryanair HTTP 403 in the last-hour window (health invariant)."""
    with _lock:
        now = time.monotonic()
        cutoff = now - 3600.0
        while _forbidden and _forbidden[0] < cutoff:
            _forbidden.popleft()
        _forbidden.append(now)


def get_stats() -> Dict[str, object]:
    """Alias used by deals.health."""
    return status_snapshot()


def status_snapshot() -> Dict[str, object]:
    with _lock:
        now = time.monotonic()
        _prune(now)
        cutoff = now - 3600.0
        while _forbidden and _forbidden[0] < cutoff:
            _forbidden.popleft()
        used = len(_calls)
        forbidden_n = len(_forbidden)
        return {
            "budget_per_hour": _hourly_budget(),
            "used_last_hour": used,
            "calls_1h": used,
            "remaining": max(0, _hourly_budget() - used),
            "denied_by_purpose": dict(_denied),
            "forbidden_1h": forbidden_n,
            "status_403": forbidden_n,
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
        _forbidden.clear()
