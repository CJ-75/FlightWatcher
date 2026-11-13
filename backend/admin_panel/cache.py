"""Short TTL in-process cache + stale-while-revalidate for admin aggregates."""
from __future__ import annotations

import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple

_lock = threading.Lock()
# key -> (fresh_until, stale_until, value)
_store: Dict[str, Tuple[float, float, Any]] = {}
_inflight: Dict[str, threading.Event] = {}


def get_cached(key: str) -> Optional[Any]:
    """Return value only if still within fresh TTL."""
    now = time.time()
    with _lock:
        item = _store.get(key)
        if not item:
            return None
        fresh_until, stale_until, val = item
        if fresh_until >= now:
            return val
        if stale_until < now:
            _store.pop(key, None)
        return None


def get_cached_or_stale(key: str) -> Tuple[Optional[Any], bool]:
    """
    Returns (value, is_stale).
    - fresh: (value, False)
    - stale but usable: (value, True)
    - miss: (None, False)
    """
    now = time.time()
    with _lock:
        item = _store.get(key)
        if not item:
            return None, False
        fresh_until, stale_until, val = item
        if fresh_until >= now:
            return val, False
        if stale_until >= now:
            return val, True
        _store.pop(key, None)
        return None, False


def set_cached(key: str, value: Any, ttl_sec: float = 30.0, stale_sec: float = 0.0) -> None:
    """
    ttl_sec = fresh window.
    stale_sec = extra time after expiry where value can still be served while refreshing.
    Default stale = max(ttl*3, 90s) if stale_sec <= 0.
    """
    now = time.time()
    fresh = now + max(1.0, float(ttl_sec))
    if stale_sec and stale_sec > 0:
        stale = fresh + float(stale_sec)
    else:
        stale = fresh + max(float(ttl_sec) * 3.0, 90.0)
    with _lock:
        _store[key] = (fresh, stale, value)


def clear_cached(prefix: str = "") -> None:
    with _lock:
        if not prefix:
            _store.clear()
            return
        for k in list(_store.keys()):
            if k.startswith(prefix):
                _store.pop(k, None)


def swr(
    key: str,
    builder: Callable[[], Any],
    *,
    ttl_sec: float = 45.0,
    stale_sec: float = 180.0,
    force: bool = False,
) -> Any:
    """
    Stale-while-revalidate:
    - fresh hit → return immediately
    - stale hit → return stale, refresh in background once
    - miss / force → build synchronously
    """
    if not force:
        val, is_stale = get_cached_or_stale(key)
        if val is not None and not is_stale:
            if isinstance(val, dict):
                return {**val, "cached": True, "stale": False}
            return val
        if val is not None and is_stale:
            _spawn_refresh(key, builder, ttl_sec, stale_sec)
            if isinstance(val, dict):
                return {**val, "cached": True, "stale": True}
            return val

    out = builder()
    set_cached(key, out, ttl_sec=ttl_sec, stale_sec=stale_sec)
    if isinstance(out, dict):
        return {**out, "cached": False, "stale": False}
    return out


def _spawn_refresh(
    key: str,
    builder: Callable[[], Any],
    ttl_sec: float,
    stale_sec: float,
) -> None:
    with _lock:
        if key in _inflight:
            return
        ev = threading.Event()
        _inflight[key] = ev

    def _run() -> None:
        try:
            out = builder()
            set_cached(key, out, ttl_sec=ttl_sec, stale_sec=stale_sec)
        except Exception as e:
            print(f"admin_cache refresh failed {key}: {e}")
        finally:
            with _lock:
                _inflight.pop(key, None)

    threading.Thread(target=_run, name=f"admin-swr-{key[:24]}", daemon=True).start()
