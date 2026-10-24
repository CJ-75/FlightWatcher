"""
v3.2 — in-process rate limits for Resend my-trip emails.
"""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional, Tuple

_lock = threading.Lock()
_by_email: Dict[str, Deque[float]] = defaultdict(deque)
_by_draft: Dict[str, Deque[float]] = defaultdict(deque)
_global: Deque[float] = deque()


def _env_int(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


def _limits() -> Tuple[int, int, int, float]:
    """per_email/h, per_draft/h, global/h, window_s"""
    return (
        _env_int("MY_TRIP_EMAIL_PER_EMAIL_PER_HOUR", 3),
        _env_int("MY_TRIP_EMAIL_PER_DRAFT_PER_HOUR", 5),
        _env_int("MY_TRIP_EMAIL_GLOBAL_PER_HOUR", 60),
        3600.0,
    )


def _prune(q: Deque[float], now: float, window: float) -> None:
    while q and q[0] < now - window:
        q.popleft()


def check_and_record(email: str, draft_token: str) -> Optional[str]:
    """
    Returns error code if limited, else None and records the send attempt.
    """
    email_n = (email or "").strip().lower()
    draft = (draft_token or "").strip()
    per_email, per_draft, per_global, window = _limits()
    with _lock:
        now = time.monotonic()
        _prune(_by_email[email_n], now, window)
        _prune(_by_draft[draft], now, window)
        _prune(_global, now, window)
        if per_email and len(_by_email[email_n]) >= per_email:
            return "email_rate_limited"
        if per_draft and draft and len(_by_draft[draft]) >= per_draft:
            return "draft_rate_limited"
        if per_global and len(_global) >= per_global:
            return "global_email_rate_limited"
        _by_email[email_n].append(now)
        if draft:
            _by_draft[draft].append(now)
        _global.append(now)
    return None


def reset_for_tests() -> None:
    with _lock:
        _by_email.clear()
        _by_draft.clear()
        _global.clear()
