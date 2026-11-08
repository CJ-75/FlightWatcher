"""Media helpers: Wikimedia proxy + Unsplash city covers (mobile-friendly)."""
from __future__ import annotations

import logging
import os
import re
import time
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

logger = logging.getLogger("routes.media")

router = APIRouter(tags=["media"])

_ALLOWED_HOSTS = frozenset(
    {
        "thumb.wikimedia.org",
        "upload.wikimedia.org",
        "commons.wikimedia.org",
    }
)

# https://w.wiki/GHai — non-listed widths return HTTP 400
_WIKI_STEPS = (20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840)
_PX_RE = re.compile(r"(\d+)px-", re.I)

_UA = (
    "FlightWatcher/1.0 (https://flightwatcher.app; media-proxy; "
    "contact=support@flightwatcher.app)"
)

# Curated Unsplash photo ids (no API key) — keep in sync with packages/shared cityUnsplash.ts
_CITY_UNSPLASH: Dict[str, str] = {
    "paris": "photo-1502602898657-3e91760cbb34",
    "marseille": "photo-1507525428034-b723cf961d3e",
    "lyon": "photo-1523531294919-4ddd7d7296e3",
    "nice": "photo-1522093007474-d86e9bf7ba6f",
    "bordeaux": "photo-1467269204594-9661b134dd2b",
    "lisbon": "photo-1555881400-74d7acaacd8b",
    "lisbonne": "photo-1555881400-74d7acaacd8b",
    "porto": "photo-1516483638261-f4dbaf036963",
    "barcelona": "photo-1583422409516-2895a77efded",
    "barcelone": "photo-1583422409516-2895a77efded",
    "rome": "photo-1555992828-ca4dbe41d294",
    "madrid": "photo-1539037116277-4db20889f2d4",
    "amsterdam": "photo-1534351590666-13e1e96fc3c7",
    "london": "photo-1513635269975-59663e0ac1ad",
    "londres": "photo-1513635269975-59663e0ac1ad",
    "berlin": "photo-1560969184-10fe8719e047",
    "prague": "photo-1541849546-2108b4cea6a3",
    "budapest": "photo-1541343672885-9be56236302a",
    "marrakech": "photo-1653323792487-6ecc6217040b",
    "marrakesh": "photo-1653323792487-6ecc6217040b",
}

_SLUG_UNSPLASH: Dict[str, str] = {
    "balade-romantique-paris": "photo-1502602898657-3e91760cbb34",
    "ferie-11-novembre-paris": "photo-1522093007474-d86e9bf7ba6f",
    "marseille-au-soleil": "photo-1507525428034-b723cf961d3e",
    "marseille-en-amoureux": "photo-1516483638261-f4dbaf036963",
    "lisbonne-week-end": "photo-1555881400-74d7acaacd8b",
    "porto-tout-doux": "photo-1516483638261-f4dbaf036963",
}

# city_key → (url, expires_at)
_unsplash_cache: Dict[str, Tuple[str, float]] = {}
_UNSPLASH_TTL_S = 7 * 24 * 3600


def _snap_wiki_width(width: int) -> int:
    w = max(1, int(width))
    for step in _WIKI_STEPS:
        if step >= w:
            return step
    return _WIKI_STEPS[-1]


def _normalize_wikimedia_url(url: str) -> str:
    def repl(m: re.Match[str]) -> str:
        return f"{_snap_wiki_width(int(m.group(1)))}px-"

    return _PX_RE.sub(repl, url, count=1)


def _norm_key(raw: str) -> str:
    s = (raw or "").strip().lower()
    out = []
    for ch in s:
        if ch.isalnum():
            out.append(ch)
        elif ch in " -_'":
            out.append("-")
    key = "".join(out)
    while "--" in key:
        key = key.replace("--", "-")
    return key.strip("-")


def _unsplash_url(photo_id: str, width: int) -> str:
    pid = photo_id.split("?")[0].replace("https://images.unsplash.com/", "")
    w = max(320, min(2000, int(width or 960)))
    return (
        f"https://images.unsplash.com/{pid}"
        f"?auto=format&fit=crop&w={w}&q=80&fm=jpg"
    )


def _unsplash_access_key() -> str:
    return (os.getenv("UNSPLASH_ACCESS_KEY") or "").strip()


def _resize_unsplash_url(url: str, width: int) -> str:
    try:
        from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

        p = urlparse(url)
        q = parse_qs(p.query)
        q["w"] = [str(max(320, min(2000, int(width or 960))))]
        q["q"] = [q.get("q", ["80"])[0]]
        q["auto"] = ["format"]
        q["fit"] = ["crop"]
        return urlunparse(
            p._replace(query=urlencode({k: v[0] for k, v in q.items()}))
        )
    except Exception:
        return url


async def _unsplash_search(city: str, width: int) -> Optional[str]:
    key = _unsplash_access_key()
    if not key:
        return None
    cache_key = _norm_key(city)
    now = time.time()
    hit = _unsplash_cache.get(cache_key)
    if hit and hit[1] > now:
        return _resize_unsplash_url(hit[0], width)

    query = city.replace("-", " ").strip() or "travel city"
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            res = await client.get(
                "https://api.unsplash.com/search/photos",
                params={
                    "query": query,
                    "orientation": "landscape",
                    "per_page": 1,
                    "content_filter": "high",
                },
                headers={
                    "Authorization": f"Client-ID {key}",
                    "Accept-Version": "v1",
                    "User-Agent": _UA,
                },
            )
        if res.status_code >= 400:
            logger.warning("unsplash search %s: %s", res.status_code, res.text[:200])
            return None
        data: Dict[str, Any] = res.json() or {}
        results = data.get("results") or []
        if not results:
            return None
        raw_url = str(
            ((results[0].get("urls") or {}).get("regular"))
            or ((results[0].get("urls") or {}).get("small"))
            or ""
        ).strip()
        if not raw_url:
            return None
        url = _resize_unsplash_url(raw_url, width)
        _unsplash_cache[cache_key] = (raw_url, now + _UNSPLASH_TTL_S)
        return url
    except Exception as e:
        logger.warning("unsplash search failed: %s", e)
    return None


@router.get("/api/media/proxy")
async def media_proxy(url: str = Query(..., min_length=12, max_length=2000)):
    raw = (url or "").strip()
    try:
        parsed = urlparse(raw)
    except Exception as e:
        raise HTTPException(status_code=400, detail="bad_url") from e
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or host not in _ALLOWED_HOSTS:
        raise HTTPException(status_code=400, detail="host_not_allowed")

    fetch_url = _normalize_wikimedia_url(raw) if "wikimedia.org" in host else raw

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
            follow_redirects=True,
            headers={"User-Agent": _UA, "Accept": "image/*,*/*;q=0.8"},
        ) as client:
            res = await client.get(fetch_url)
    except Exception as e:
        logger.warning("media_proxy fetch failed: %s", e)
        raise HTTPException(status_code=502, detail="upstream_error") from e

    if res.status_code >= 400 or not res.content:
        raise HTTPException(status_code=502, detail=f"upstream_{res.status_code}")

    ctype = (res.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
    if not ctype.startswith("image/"):
        raise HTTPException(status_code=502, detail="not_an_image")

    return Response(
        content=res.content,
        media_type=ctype,
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/api/media/city-cover")
async def city_cover(
    city: str = Query("", max_length=80),
    slug: str = Query("", max_length=120),
    w: int = Query(960, ge=320, le=2000),
):
    """Return a mobile-friendly cover URL (Unsplash curated, else Unsplash API)."""
    slug_key = _norm_key(slug)
    city_key = _norm_key(city)
    photo: Optional[str] = None
    source = "none"

    if slug_key and slug_key in _SLUG_UNSPLASH:
        photo = _SLUG_UNSPLASH[slug_key]
        source = "curated_slug"
    elif city_key and city_key in _CITY_UNSPLASH:
        photo = _CITY_UNSPLASH[city_key]
        source = "curated_city"

    if photo:
        return {
            "ok": True,
            "url": _unsplash_url(photo, w),
            "source": source,
            "api": False,
        }

    searched = await _unsplash_search(city_key or slug_key or "travel", w)
    if searched:
        return {"ok": True, "url": searched, "source": "unsplash_api", "api": True}

    # Last resort: Paris curated
    return {
        "ok": True,
        "url": _unsplash_url(_CITY_UNSPLASH["paris"], w),
        "source": "fallback_paris",
        "api": False,
    }
