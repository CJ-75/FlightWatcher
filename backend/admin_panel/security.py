"""Admin security helpers — rate limit, step-up, impersonation TTL."""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional, Tuple

from fastapi import HTTPException, Request

_lock = threading.Lock()
_hits: Dict[str, Deque[float]] = defaultdict(deque)
_step_up: Dict[str, float] = {}
_impersonations: Dict[str, Tuple[str, float]] = {}

RATE_LIMIT_OPS = int(os.getenv("ADMIN_OPS_RATE_LIMIT", "20"))
RATE_WINDOW_SEC = 60.0
STEP_UP_TTL_SEC = float(os.getenv("ADMIN_STEP_UP_TTL_SEC", "900"))
IMPERSONATION_TTL_SEC = float(os.getenv("ADMIN_IMPERSONATION_TTL_SEC", "900"))


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def check_rate_limit(key: str, limit: int = RATE_LIMIT_OPS, window: float = RATE_WINDOW_SEC) -> None:
    now = time.time()
    with _lock:
        q = _hits[key]
        while q and q[0] < now - window:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(status_code=429, detail="Admin rate limit exceeded")
        q.append(now)


def mark_step_up(actor_id: str) -> Dict[str, float]:
    exp = time.time() + STEP_UP_TTL_SEC
    with _lock:
        _step_up[actor_id] = exp
    return {"ok": True, "expires_at": exp, "ttl_sec": STEP_UP_TTL_SEC}


def require_step_up(actor_id: Optional[str], needed: bool) -> None:
    if not needed:
        return
    if not actor_id:
        raise HTTPException(status_code=403, detail="Step-up required")
    with _lock:
        exp = _step_up.get(actor_id, 0)
    if exp < time.time():
        raise HTTPException(
            status_code=403,
            detail="Step-up password re-verification required for this ops action",
        )


def start_impersonation(admin_id: str, target_user_id: str) -> Dict[str, object]:
    exp = time.time() + IMPERSONATION_TTL_SEC
    with _lock:
        _impersonations[admin_id] = (target_user_id, exp)
    return {
        "ok": True,
        "target_user_id": target_user_id,
        "expires_at": exp,
        "ttl_sec": IMPERSONATION_TTL_SEC,
    }


def stop_impersonation(admin_id: str) -> Dict[str, bool]:
    with _lock:
        _impersonations.pop(admin_id, None)
    return {"ok": True}


def get_impersonation(admin_id: str) -> Optional[Dict[str, object]]:
    with _lock:
        item = _impersonations.get(admin_id)
        if not item:
            return None
        target, exp = item
        if exp < time.time():
            _impersonations.pop(admin_id, None)
            return None
        return {"target_user_id": target, "expires_at": exp}
