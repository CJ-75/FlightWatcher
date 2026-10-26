"""
Flight Search / Inspire always wins over background hotel work.

Hotel upsell / LiteAPI pool bootstrap yield while a client scan is in flight.
"""
from __future__ import annotations

import threading
import time
from contextlib import contextmanager
from typing import Iterator

_lock = threading.Lock()
_cv = threading.Condition(_lock)
_active_searches = 0


@contextmanager
def search_active() -> Iterator[None]:
    """Mark a client-facing flight scan as running (inspire / scan)."""
    global _active_searches
    with _cv:
        _active_searches += 1
    try:
        yield
    finally:
        with _cv:
            _active_searches = max(0, _active_searches - 1)
            _cv.notify_all()


def searches_in_flight() -> int:
    with _lock:
        return _active_searches


def wait_while_search_busy(*, poll_s: float = 0.2, max_wait_s: float = 180.0) -> None:
    """
    Block hotel workers until no inspire/scan is running (or max_wait).
    Call before LiteAPI / pool bootstrap so Search HTTP stays first.
    """
    deadline = time.monotonic() + max(1.0, float(max_wait_s))
    with _cv:
        while _active_searches > 0 and time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            _cv.wait(timeout=min(float(poll_s), remaining))
