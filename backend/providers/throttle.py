"""
Global provider call throttle + circuit breaker (403/429).

Stops seed/revalidate from hammering Ryanair/Travelpayouts in a tight loop.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from typing import Optional

logger = logging.getLogger("providers.throttle")

_lock = threading.Lock()
_last_call_at = 0.0
_circuits: dict[str, dict] = {}  # name -> {open_until, fails, last_status}


def _min_interval_s() -> float:
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
    """Serialize outbound provider HTTP with a minimum gap."""
    global _last_call_at
    gap = _min_interval_s()
    with _lock:
        now = time.monotonic()
        wait = (_last_call_at + gap) - now
        if wait > 0:
            time.sleep(wait)
        _last_call_at = time.monotonic()


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
