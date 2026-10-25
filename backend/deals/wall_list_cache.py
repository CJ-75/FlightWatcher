"""
Shared L2 wall list cache (multi-worker same host).

L1 = in-process dict (community_list._list_cache).
L2 = JSON files under backend/.cache/deals_wall/ — shared across uvicorn workers.

Invalidate via invalidate_list_cache() which bumps epoch + clears L2.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("deals.wall_list_cache")

_lock = threading.Lock()
_epoch = 0
_CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache" / "deals_wall"
_TTL_S = float(os.getenv("DEALS_WALL_CACHE_TTL_S", "480") or "480")
_ENABLED = (os.getenv("DEALS_WALL_SHARED_CACHE", "true") or "true").lower() in (
    "1",
    "true",
    "yes",
    "on",
)


def bump_epoch() -> int:
    global _epoch
    with _lock:
        _epoch += 1
        e = _epoch
    _clear_files()
    return e


def current_epoch() -> int:
    with _lock:
        return _epoch


def _clear_files() -> None:
    if not _CACHE_DIR.exists():
        return
    try:
        for p in _CACHE_DIR.glob("*.json"):
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass
    except OSError as e:
        logger.debug("wall L2 clear failed: %s", e)


def _path_for(key: str) -> Path:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:40]
    return _CACHE_DIR / f"{digest}.json"


def get_shared(key: str) -> Optional[List[Dict[str, Any]]]:
    if not _ENABLED:
        return None
    path = _path_for(key)
    try:
        if not path.is_file():
            return None
        age = time.time() - path.stat().st_mtime
        if age > _TTL_S:
            return None
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None
        if int(raw.get("epoch") or -1) != current_epoch():
            return None
        data = raw.get("deals")
        if not isinstance(data, list):
            return None
        return data
    except Exception as e:
        logger.debug("wall L2 get miss: %s", e)
        return None


def set_shared(key: str, deals: List[Dict[str, Any]]) -> None:
    if not _ENABLED:
        return
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "epoch": current_epoch(),
            "ts": time.time(),
            "deals": deals,
        }
        path = _path_for(key)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, default=str), encoding="utf-8")
        tmp.replace(path)
    except Exception as e:
        logger.debug("wall L2 set failed: %s", e)
