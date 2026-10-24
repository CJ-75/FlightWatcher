"""
Per-provider throttle + circuit breaker (403/429).

Ryanair and Travelpayouts must NOT share one global slot — otherwise Search
serializes both and feels hung. Seed/revalidate keep a slower gap; organic
Search uses SEARCH_PROVIDER_MIN_INTERVAL_S (fast path).
"""
from __future__ import annotations

import logging
import os
import threading
import time
from contextlib import contextmanager
from typing import Iterator, Optional

logger = logging.getLogger("providers.throttle")

_lock = threading.Lock()
_last_call_at: dict[str, float] = {}
_circuits: dict[str, dict] = {}  # name -> {open_until, fails, last_status}
# Process-wide depth so ThreadPool workers inherit the fast Search path
_fast_depth = 0


def is_fast_search_path() -> bool:
    return _fast_depth > 0


@contextmanager
def fast_search_path(enabled: bool = True) -> Iterator[None]:
    """Organic inspire/scan: tighter gaps (visible to all worker threads)."""
    global _fast_depth
    if not enabled:
        yield
        return
    with _lock:
        _fast_depth += 1
    try:
        yield
    finally:
        with _lock:
            _fast_depth = max(0, _fast_depth - 1)


def _min_interval_s(provider: str = "") -> float:
    name = (provider or "").lower()
    # Per-provider override wins
    specific_key = f"PROVIDER_{name.upper()}_MIN_INTERVAL_S" if name else ""
    if specific_key:
        raw = os.getenv(specific_key)
        if raw not in (None, ""):
            try:
                return max(0.0, float(raw))
            except (TypeError, ValueError):
                pass
    if is_fast_search_path():
        try:
            return max(0.0, float(os.getenv("SEARCH_PROVIDER_MIN_INTERVAL_S", "0.15")))
        except (TypeError, ValueError):
            return 0.15
    try:
        return max(0.0, float(os.getenv("PROVIDER_MIN_INTERVAL_S", "1.0")))
    except (TypeError, ValueError):
        return 1.0


def _fail_threshold() -> int:
    try:
        return max(1, int(os.getenv("PROVIDER_CIRCUIT_FAILS", "3")))
    except (TypeError, ValueError):
        return 3


def _cooldown_s() -> float:
    try:
        return max(30.0, float(os.getenv("PROVIDER_CIRCUIT_COOLDOWN_S", "900")))
    except (TypeError, ValueError):
        return 900.0


def _seed_pause_s() -> float:
    try:
        return max(0.0, float(os.getenv("SEED_SCAN_PAUSE_S", "1.2")))
    except (TypeError, ValueError):
        return 1.2


def wait_provider_slot(provider: str = "") -> None:
    """Per-provider min gap. Sleep outside the lock so other providers stay free."""
    name = (provider or "default").lower()
    gap = _min_interval_s(name)
    if gap <= 0:
        return
    while True:
        with _lock:
            now = time.monotonic()
            last = float(_last_call_at.get(name) or 0.0)
            wait = (last + gap) - now
            if wait <= 0:
                _last_call_at[name] = now
                return
        time.sleep(min(wait, gap))


def seed_cell_pause() -> None:
    pause = _seed_pause_s()
    if pause > 0:
        time.sleep(pause)


def is_circuit_open(provider: str) -> bool:
    name = (provider or "").lower()
    with _lock:
        state = _circuits.get(name)
        if not state:
            return False
        until = float(state.get("open_until") or 0)
        if until <= time.monotonic():
            # half-open: allow one probe
            return False
        return True


def circuit_remaining_s(provider: str) -> float:
    name = (provider or "").lower()
    with _lock:
        state = _circuits.get(name) or {}
        until = float(state.get("open_until") or 0)
        return max(0.0, until - time.monotonic())


def record_provider_ok(provider: str) -> None:
    name = (provider or "").lower()
    with _lock:
        _circuits[name] = {"open_until": 0.0, "fails": 0, "last_status": 200}


def record_provider_error(provider: str, status: Optional[int] = None) -> None:
    """Open circuit after consecutive 403/429 (or unknown hard errors)."""
    name = (provider or "").lower()
    hard = status in (403, 429) or status is None
    if not hard:
        return
    with _lock:
        state = _circuits.get(name) or {"open_until": 0.0, "fails": 0}
        fails = int(state.get("fails") or 0) + 1
        open_until = float(state.get("open_until") or 0)
        if fails >= _fail_threshold():
            open_until = time.monotonic() + _cooldown_s()
            logger.warning(
                "circuit OPEN %s after %s fails (status=%s) for %.0fs",
                name,
                fails,
                status,
                _cooldown_s(),
            )
            fails = 0
        _circuits[name] = {
            "open_until": open_until,
            "fails": fails,
            "last_status": status,
        }


def reset_circuits() -> None:
    with _lock:
        _circuits.clear()
        _last_call_at.clear()


def status_snapshot() -> dict:
    with _lock:
        now = time.monotonic()
        return {
            name: {
                "open": float(s.get("open_until") or 0) > now,
                "remaining_s": max(0.0, float(s.get("open_until") or 0) - now),
                "fails": s.get("fails"),
                "last_status": s.get("last_status"),
            }
            for name, s in _circuits.items()
        }
