"""
Search scaling helpers: singleflight coalescing + L1/L2 result cache.

Identical concurrent inspire/scan share one provider fan-out; warm results
are served from memory (L1) then file cache (L2, shared across workers on
the same host). Soft dest caps kick in when many searches are in flight.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from concurrent.futures import Future
from pathlib import Path
from typing import Any, Callable, Optional, TypeVar

logger = logging.getLogger("search_scale")

T = TypeVar("T")

_lock = threading.Lock()
_inflight: dict[str, Future] = {}
_l1: dict[str, tuple[float, Any]] = {}

_CACHE_DIR = Path(__file__).resolve().parent / ".cache" / "search"
_L1_TTL_S = float(os.getenv("SEARCH_RESULT_CACHE_TTL_S", "900") or "900")
_L2_TTL_S = float(os.getenv("SEARCH_RESULT_L2_TTL_S", "1800") or "1800")
_L2_ENABLED = (os.getenv("SEARCH_SHARED_CACHE", "true") or "true").lower() in (
    "1",
    "true",
    "yes",
    "on",
)
_L1_MAX = max(32, int(os.getenv("SEARCH_RESULT_CACHE_MAX", "256") or "256"))


def scan_pool_workers() -> int:
    try:
        return max(4, min(64, int(os.getenv("SCAN_POOL_WORKERS", "16") or "16")))
    except (TypeError, ValueError):
        return 16


def load_dest_cap() -> int:
    """
    Soft Ryanair/TP destination cap under concurrency.
    0 = unlimited. When searches_in_flight is high, apply SEARCH_LOAD_DEST_CAP.
    """
    try:
        soft = int(os.getenv("SEARCH_LOAD_DEST_CAP", "80") or "80")
    except (TypeError, ValueError):
        soft = 80
    if soft <= 0:
        return 0
    try:
        from search_priority import searches_in_flight

        inflight = searches_in_flight()
    except Exception:
        inflight = 0
    try:
        threshold = max(1, int(os.getenv("SEARCH_LOAD_THRESHOLD", "4") or "4"))
    except (TypeError, ValueError):
        threshold = 4
    if inflight >= threshold:
        return soft
    return 0


def effective_limite_allers(requested: Optional[int]) -> int:
    """Merge caller limit with load-aware soft cap (0 = unlimited)."""
    try:
        req = int(requested) if requested is not None else 0
    except (TypeError, ValueError):
        req = 0
    soft = load_dest_cap()
    if soft <= 0:
        return req
    if req <= 0:
        return soft
    return min(req, soft)


def inspire_cache_key(
    *,
    departure: str,
    budget: float,
    passengers: int,
    direct: bool,
    date_preset: Optional[str],
    dates_depart: list,
    dates_retour: list,
    destinations_exclues: Optional[list] = None,
) -> str:
    def _dump_dates(rows: list) -> list:
        out = []
        for d in rows or []:
            if hasattr(d, "model_dump"):
                out.append(d.model_dump())
            elif isinstance(d, dict):
                out.append(d)
            else:
                out.append(str(d))
        return out

    payload = {
        "kind": "inspire",
        "departure": (departure or "BVA").upper(),
        "budget": float(budget or 0),
        "passengers": max(1, min(6, int(passengers or 1))),
        "direct": bool(direct),
        "date_preset": date_preset or None,
        "dates_depart": _dump_dates(dates_depart),
        "dates_retour": _dump_dates(dates_retour),
        "exclues": sorted(destinations_exclues or []),
    }
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _l2_path(key: str) -> Path:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:40]
    return _CACHE_DIR / f"{digest}.json"


def _l1_get(key: str) -> Any | None:
    with _lock:
        row = _l1.get(key)
        if not row:
            return None
        expires, value = row
        if expires <= time.time():
            _l1.pop(key, None)
            return None
        return value


def _l1_put(key: str, value: Any, ttl_s: float | None = None) -> None:
    ttl = float(ttl_s if ttl_s is not None else _L1_TTL_S)
    expires = time.time() + max(30.0, ttl)
    with _lock:
        if len(_l1) >= _L1_MAX:
            # Drop oldest ~12%
            doomed = sorted(_l1.items(), key=lambda kv: kv[1][0])[: max(1, _L1_MAX // 8)]
            for k, _ in doomed:
                _l1.pop(k, None)
        _l1[key] = (expires, value)


def _l2_get(key: str) -> Any | None:
    if not _L2_ENABLED:
        return None
    path = _l2_path(key)
    try:
        if not path.is_file():
            return None
        age = time.time() - path.stat().st_mtime
        if age > _L2_TTL_S:
            return None
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None
        return raw.get("value")
    except Exception as e:
        logger.debug("search L2 get failed: %s", e)
        return None


def _l2_put(key: str, value: Any) -> None:
    if not _L2_ENABLED:
        return
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path = _l2_path(key)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(
            json.dumps({"value": value, "saved_at": time.time()}, ensure_ascii=False),
            encoding="utf-8",
        )
        tmp.replace(path)
    except Exception as e:
        logger.debug("search L2 put failed: %s", e)


def cache_get(key: str) -> Any | None:
    hit = _l1_get(key)
    if hit is not None:
        return hit
    hit = _l2_get(key)
    if hit is not None:
        _l1_put(key, hit)
        return hit
    return None


def cache_put(key: str, value: Any, ttl_s: float | None = None) -> None:
    _l1_put(key, value, ttl_s=ttl_s)
    _l2_put(key, value)


def coalesce(key: str, factory: Callable[[], T]) -> T:
    """
    Singleflight: concurrent callers with the same key wait on one factory().
    Also populates L1/L2 on success when the value is JSON-serializable dict/list.
    """
    cached = cache_get(key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    leader = False
    fut: Future
    with _lock:
        existing = _inflight.get(key)
        if existing is not None:
            fut = existing
        else:
            fut = Future()
            _inflight[key] = fut
            leader = True

    if not leader:
        return fut.result()

    try:
        value = factory()
        # Only auto-cache plain JSON-ish payloads (inspire dumps results)
        if isinstance(value, (dict, list)):
            cache_put(key, value)
        fut.set_result(value)
        return value
    except Exception as e:
        fut.set_exception(e)
        raise
    finally:
        with _lock:
            if _inflight.get(key) is fut:
                _inflight.pop(key, None)


def reset_for_tests() -> None:
    with _lock:
        _inflight.clear()
        _l1.clear()
