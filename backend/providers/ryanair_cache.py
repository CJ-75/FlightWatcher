"""
v3.2 — short TTL in-memory cache for Ryanair fare responses.
Shared across Search / Deals revalidate / click revalidate.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("providers.ryanair_cache")

_lock = threading.Lock()
_store: Dict[str, Tuple[float, Any]] = {}


def _ttl_s() -> float:
    try:
        return max(60.0, float(os.getenv("RYANAIR_CACHE_TTL_S", "7200")))
    except (TypeError, ValueError):
        return 7200.0


def make_key(
    *,
    origin: str,
    dest: str,
    out_date: str,
    ret_date: str,
    passengers: int = 1,
    budget: int = 0,
) -> str:
    return (
        f"{(origin or '').upper()}|{(dest or '').upper()}|"
        f"{str(out_date)[:10]}|{str(ret_date)[:10]}|"
        f"p{int(passengers)}|b{int(budget)}"
    )


def get(key: str) -> Optional[Any]:
    with _lock:
        row = _store.get(key)
        if not row:
            return None
        expires, payload = row
        if time.monotonic() > expires:
            _store.pop(key, None)
            return None
        return payload


def set(key: str, payload: Any) -> None:
    with _lock:
        _store[key] = (time.monotonic() + _ttl_s(), payload)
        # soft cap
        if len(_store) > 2000:
            items = sorted(_store.items(), key=lambda kv: kv[1][0])
            for k, _ in items[:400]:
                _store.pop(k, None)


def stats() -> Dict[str, Any]:
    with _lock:
        now = time.monotonic()
        alive = sum(1 for _, (exp, _) in _store.items() if exp > now)
        return {"entries": alive, "ttl_s": _ttl_s()}


def clear() -> None:
    with _lock:
        _store.clear()
