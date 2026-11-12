"""Short TTL in-process cache for expensive admin aggregates."""
from __future__ import annotations

import threading
import time
from typing import Any, Dict, Optional, Tuple

_lock = threading.Lock()
_store: Dict[str, Tuple[float, Any]] = {}


def get_cached(key: str) -> Optional[Any]:
    now = time.time()
    with _lock:
        item = _store.get(key)
        if not item:
            return None
        exp, val = item
        if exp < now:
            _store.pop(key, None)
            return None
        return val


def set_cached(key: str, value: Any, ttl_sec: float = 30.0) -> None:
    with _lock:
        _store[key] = (time.time() + ttl_sec, value)


def clear_cached(prefix: str = "") -> None:
    with _lock:
        if not prefix:
            _store.clear()
            return
        for k in list(_store.keys()):
            if k.startswith(prefix):
                _store.pop(k, None)
