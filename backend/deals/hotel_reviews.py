"""
Fetch / cache LiteAPI (Nuitee) guest reviews for hotel detail panels.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from deals.hotel_gallery import html_to_plain_text
from deals.liteapi_client import LiteApiClient, LiteApiError
from deals.liteapi_config import load_deals_config

logger = logging.getLogger("deals.hotel_reviews")

_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_TTL_S = 6 * 3600


def _text(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = html_to_plain_text(str(v)) if "<" in str(v) else str(v).strip()
    return s or None


def _score(v: Any) -> Optional[float]:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n < 0 or n > 10:
        return None
    return round(n, 1)


def _normalize_review(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    score = _score(
        raw.get("averageScore")
        if raw.get("averageScore") is not None
        else raw.get("score")
        if raw.get("score") is not None
        else raw.get("rating")
    )
    headline = _text(raw.get("headline") or raw.get("title"))
    pros = _text(raw.get("pros") or raw.get("positive") or raw.get("good"))
    cons = _text(raw.get("cons") or raw.get("negative") or raw.get("bad"))
    body = _text(raw.get("text") or raw.get("comment") or raw.get("review"))
    if not any([headline, pros, cons, body]):
        return None
    name = _text(raw.get("name") or raw.get("author") or raw.get("travelerName"))
    return {
        "score": score,
        "name": name,
        "country": _text(raw.get("country")),
        "type": _text(raw.get("type") or raw.get("travelerType")),
        "date": _text(raw.get("date") or raw.get("reviewedAt")),
        "headline": headline,
        "pros": pros,
        "cons": cons,
        "text": body,
        "language": _text(raw.get("language")),
    }


def get_hotel_reviews(
    hotel_id: str,
    *,
    language: str = "fr",
    limit: int = 8,
) -> Dict[str, Any]:
    """
    Guest reviews via GET /data/reviews.
    With language set, LiteAPI caps at 10 and AI-translates.
    """
    hid = (hotel_id or "").strip()
    if not hid:
        return {"hotel_id": "", "reviews": [], "count": 0}

    lang = (language or "fr").strip().lower()[:5] or "fr"
    lim = max(1, min(int(limit or 8), 10))
    cache_key = f"{hid}:{lang}:{lim}"

    with _CACHE_LOCK:
        hit = _CACHE.get(cache_key)
        if hit and time.monotonic() - hit[0] < _CACHE_TTL_S:
            return dict(hit[1])

    out: Dict[str, Any] = {
        "hotel_id": hid,
        "language": lang,
        "reviews": [],
        "count": 0,
        "sentiment": None,
    }

    cfg = load_deals_config()
    if not cfg.api_key:
        return out

    client = LiteApiClient(cfg=cfg)
    try:
        payload = client.get_hotel_reviews(
            hid,
            language=lang,
            limit=lim,
            get_sentiment=False,
            timeout=8,
        )
        data = payload.get("data") if isinstance(payload, dict) else None
        rows: List[Any] = []
        if isinstance(data, list):
            rows = data
        elif isinstance(data, dict):
            inner = data.get("reviews") or data.get("items") or []
            if isinstance(inner, list):
                rows = inner
            sent = data.get("sentiment") or data.get("sentimentAnalysis")
            if isinstance(sent, dict):
                out["sentiment"] = sent
        elif isinstance(payload, list):
            rows = payload

        reviews: List[Dict[str, Any]] = []
        for raw in rows:
            if len(reviews) >= lim:
                break
            n = _normalize_review(raw)
            if n:
                reviews.append(n)
        out["reviews"] = reviews
        out["count"] = len(reviews)
    except LiteApiError as e:
        logger.info("hotel_reviews liteapi miss %s: %s", hid, e)
    except Exception as e:
        logger.warning("hotel_reviews fail %s: %s", hid, e)
    finally:
        client.close()

    with _CACHE_LOCK:
        _CACHE[cache_key] = (time.monotonic(), out)
        if len(_CACHE) > 256:
            # drop oldest roughly
            oldest = sorted(_CACHE.items(), key=lambda x: x[1][0])[:64]
            for k, _ in oldest:
                _CACHE.pop(k, None)

    return dict(out)
