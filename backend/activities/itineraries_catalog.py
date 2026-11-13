"""Public catalogue read for editorial itineraries (Parcours Lot 1)."""
from __future__ import annotations

import logging
import os
import time
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("activities.itineraries_catalog")

PUBLIC_COLS = (
    "id,slug,title,subtitle,intro,cover_image,city_slug,served_city_id,"
    "status,author_kind,duration_kind,occasions,featured_from,featured_to,"
    "budget_estimate_eur,budget_basis,sort_weight,published_at,is_demo"
)

# Avoid places.geom (heavy geography) on public detail — meta.lat/lng is enough for Maps.
DETAIL_SELECT = (
    f"{PUBLIC_COLS}, "
    "itinerary_items(*, places(id,name,kind,city_slug,location_precision,meta))"
)

# Short TTL — demo/admin edits visible within a minute without write-path invalidation.
_CACHE_TTL_SEC = 60.0
_list_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_detail_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}

# Unsplash covers (mobile-friendly) — aligned with packages/shared cityUnsplash.ts
_CITY_COVER_FALLBACK = {
    "paris": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "marseille": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "lyon": "https://images.unsplash.com/photo-1523531294919-4ddd7d7296e3?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "nice": "https://images.unsplash.com/photo-1691770128652-ed5bc5647cb1?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "bordeaux": "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "lisbon": "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "lisbonne": "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "porto": "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "barcelona": "https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "barcelone": "https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "rome": "https://images.unsplash.com/photo-1555992828-ca4dbe41d294?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "madrid": "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "amsterdam": "https://images.unsplash.com/photo-1534351590666-13e1e96fc3c7?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "london": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "londres": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "berlin": "https://images.unsplash.com/photo-1560969184-10fe8719e047?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "prague": "https://images.unsplash.com/photo-1541849546-2108b4cea6a3?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "budapest": "https://images.unsplash.com/photo-1541343672885-9be56236302a?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "marrakech": "https://images.unsplash.com/photo-1653323792487-6ecc6217040b?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "marrakesh": "https://images.unsplash.com/photo-1653323792487-6ecc6217040b?auto=format&fit=crop&w=1600&q=90&fm=jpg",
}

_SLUG_COVER_FALLBACK = {
    "balade-romantique-paris": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "ferie-11-novembre-paris": "https://images.unsplash.com/photo-1522093007474-d86e9bf7ba6f?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "marseille-au-soleil": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "marseille-en-amoureux": "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "lisbonne-week-end": "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1600&q=90&fm=jpg",
    "porto-tout-doux": "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1600&q=90&fm=jpg",
}


def _allow_demo() -> bool:
    return (os.getenv("ITINERARIES_DEMO") or "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _cache_get(store: Dict[str, Tuple[float, Dict[str, Any]]], key: str) -> Optional[Dict[str, Any]]:
    hit = store.get(key)
    if not hit:
        return None
    expires_at, payload = hit
    if time.monotonic() >= expires_at:
        store.pop(key, None)
        return None
    return payload


def _cache_set(store: Dict[str, Tuple[float, Dict[str, Any]]], key: str, payload: Dict[str, Any]) -> None:
    store[key] = (time.monotonic() + _CACHE_TTL_SEC, payload)


def clear_itineraries_catalog_cache() -> None:
    """Optional hook for admin writes — TTL alone is enough for demo."""
    _list_cache.clear()
    _detail_cache.clear()


def _seed_detail_cache_from_rows(
    rows: List[Dict[str, Any]],
    *,
    demo: bool,
) -> None:
    """Promote list rows (with steps) into detail cache — same payload as by-slug."""
    for row in rows:
        items = row.get("itinerary_items")
        if not isinstance(items, list) or not items:
            continue
        payload = {"ok": True, "itinerary": row}
        slug = str(row.get("slug") or "").strip().lower()
        iid = str(row.get("id") or "").strip()
        if slug:
            _cache_set(
                _detail_cache,
                f"detail|demo={int(demo)}|slug={slug}|id=",
                payload,
            )
        if iid:
            _cache_set(
                _detail_cache,
                f"detail|demo={int(demo)}|slug=|id={iid}",
                payload,
            )


def _serialize(row: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(row)
    occasions = out.get("occasions")
    if occasions is None:
        out["occasions"] = []
    items = out.get("itinerary_items")
    if isinstance(items, list):
        out["itinerary_items"] = sorted(
            items,
            key=lambda it: (
                int(it.get("day_offset") or 0),
                int(it.get("position") or 0),
                str(it.get("sort_key") or ""),
            ),
        )
    slug = str(out.get("slug") or "").strip().lower()
    city = str(out.get("city_slug") or "").strip().lower()
    cover = str(out.get("cover_image") or "").strip()
    # Prefer curated Unsplash for known demo slugs (avoids dead Wikimedia / 404 Unsplash ids).
    curated = _SLUG_COVER_FALLBACK.get(slug) or _CITY_COVER_FALLBACK.get(city)
    if curated and (
        not cover
        or "wikimedia.org" in cover
        or "photo-1499853387-4b3839150cba" in cover
        or "source.unsplash.com" in cover
    ):
        out["cover_image"] = curated
    return out


def list_published_itineraries(
    supabase,
    *,
    city: Optional[str] = None,
    occasion: Optional[str] = None,
    featured: bool = False,
    include_demo: Optional[bool] = None,
    limit: int = 40,
) -> Dict[str, Any]:
    if not supabase:
        return {"ok": False, "itineraries": [], "error": "no_supabase"}
    lim = max(1, min(int(limit or 40), 100))
    demo = _allow_demo() if include_demo is None else bool(include_demo)
    # listv2 = catalogue embeds itinerary_items (instant detail open on clients).
    cache_key = (
        f"listv2|demo={int(demo)}|city={city or ''}|occ={occasion or ''}|"
        f"feat={int(featured)}|lim={lim}"
    )
    cached = _cache_get(_list_cache, cache_key)
    if cached is not None:
        logger.info("list_published_itineraries cache_hit key=%s", cache_key)
        rows = cached.get("itineraries") or []
        if isinstance(rows, list) and rows:
            _seed_detail_cache_from_rows(rows, demo=demo)
        return cached
    t0 = time.perf_counter()
    try:
        q = (
            supabase.table("itineraries")
            .select(DETAIL_SELECT)
            .eq("status", "published")
            .eq("author_kind", "admin")
            .order("sort_weight", desc=True)
            .order("published_at", desc=True)
            .limit(lim)
        )
        if city:
            q = q.eq("city_slug", str(city).strip().lower())
        if occasion:
            q = q.contains("occasions", [str(occasion).strip().lower()])
        if featured:
            today = date.today().isoformat()
            q = q.lte("featured_from", today).gte("featured_to", today)
        if not demo:
            q = q.eq("is_demo", False)
        res = q.execute()
        rows = [_serialize(r) for r in (res.data or [])]
        out = {"ok": True, "itineraries": rows}
        _cache_set(_list_cache, cache_key, out)
        _seed_detail_cache_from_rows(rows, demo=demo)
        logger.info(
            "list_published_itineraries cache_miss ms=%.0f n=%s with_steps",
            (time.perf_counter() - t0) * 1000,
            len(rows),
        )
        return out
    except Exception as e:
        logger.warning("list_published_itineraries: %s", e)
        return {"ok": False, "itineraries": [], "error": str(e)}


def get_published_itinerary(
    supabase,
    *,
    itinerary_id: Optional[str] = None,
    slug: Optional[str] = None,
    include_demo: Optional[bool] = None,
) -> Dict[str, Any]:
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    if not itinerary_id and not slug:
        return {"ok": False, "error": "missing_id"}
    demo = _allow_demo() if include_demo is None else bool(include_demo)
    slug_norm = str(slug).strip().lower() if slug else None
    id_norm = str(itinerary_id).strip() if itinerary_id else None
    cache_key = f"detail|demo={int(demo)}|slug={slug_norm or ''}|id={id_norm or ''}"
    cached = _cache_get(_detail_cache, cache_key)
    if cached is not None:
        logger.info("get_published_itinerary cache_hit key=%s", cache_key)
        return cached
    t0 = time.perf_counter()
    try:
        q = (
            supabase.table("itineraries")
            .select(DETAIL_SELECT)
            .eq("status", "published")
            .limit(1)
        )
        if slug_norm:
            q = q.eq("slug", slug_norm)
        else:
            q = q.eq("id", id_norm)
        res = q.execute()
        if not res.data:
            return {"ok": False, "error": "not_found"}
        row = _serialize(res.data[0])
        if row.get("is_demo") and not demo:
            return {"ok": False, "error": "not_found"}
        out = {"ok": True, "itinerary": row}
        _cache_set(_detail_cache, cache_key, out)
        # Also index by the other key so slug/id lookups share the warm entry.
        alt_slug = str(row.get("slug") or "").strip().lower()
        alt_id = str(row.get("id") or "").strip()
        if alt_slug and (not slug_norm or slug_norm != alt_slug):
            _cache_set(
                _detail_cache,
                f"detail|demo={int(demo)}|slug={alt_slug}|id=",
                out,
            )
        if alt_id and (not id_norm or id_norm != alt_id):
            _cache_set(
                _detail_cache,
                f"detail|demo={int(demo)}|slug=|id={alt_id}",
                out,
            )
        logger.info(
            "get_published_itinerary cache_miss ms=%.0f slug=%s",
            (time.perf_counter() - t0) * 1000,
            alt_slug or slug_norm,
        )
        return out
    except Exception as e:
        logger.warning("get_published_itinerary: %s", e)
        return {"ok": False, "error": str(e)}


_CARD_KEYS = (
    "id",
    "slug",
    "title",
    "subtitle",
    "city_slug",
    "cover_image",
    "duration_kind",
)


def hydrate_liked_itinerary_cards(
    supabase,
    likes: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Replace frozen like snapshots with live published card fields.

    Liked rows keep itinerary_data from like-time (often an old cover/title).
    Favorites must show the current catalogue version without N detail fetches.
    """
    if not supabase or not likes:
        return likes
    ids = sorted(
        {
            str(row.get("itinerary_id") or "").strip()
            for row in likes
            if str(row.get("itinerary_id") or "").strip()
        }
    )
    if not ids:
        return likes
    live_by_id: Dict[str, Dict[str, Any]] = {}
    try:
        demo = _allow_demo()
        q = (
            supabase.table("itineraries")
            .select(PUBLIC_COLS)
            .in_("id", ids)
            .eq("status", "published")
            .eq("author_kind", "admin")
        )
        if not demo:
            q = q.eq("is_demo", False)
        res = q.execute()
        for raw in res.data or []:
            row = _serialize(raw)
            iid = str(row.get("id") or "").strip()
            if iid:
                live_by_id[iid] = {k: row.get(k) for k in _CARD_KEYS}
    except Exception as e:
        logger.warning("hydrate_liked_itinerary_cards: %s", e)
        return likes

    out: List[Dict[str, Any]] = []
    for like in likes:
        item = dict(like)
        iid = str(item.get("itinerary_id") or "").strip()
        live = live_by_id.get(iid)
        if live:
            snap = item.get("itinerary_data")
            base = dict(snap) if isinstance(snap, dict) else {}
            base.update({k: v for k, v in live.items() if v is not None})
            item["itinerary_data"] = base
        out.append(item)
    return out


def featured_row_label(itineraries: List[Dict[str, Any]]) -> Optional[str]:
    """FR label for À la une — weekday when férié daté."""
    if not itineraries:
        return None
    first = itineraries[0]
    occasions = first.get("occasions") or []
    if "ferie" in occasions:
        iso = str(first.get("featured_to") or first.get("featured_from") or "")[
            :10
        ]
        try:
            from datetime import datetime

            d = datetime.strptime(iso, "%Y-%m-%d")
            # Monday=0 … Sunday=6
            names = (
                "lundi",
                "mardi",
                "mercredi",
                "jeudi",
                "vendredi",
                "samedi",
                "dimanche",
            )
            return f"Pour le férié de {names[d.weekday()]}"
        except Exception:
            return "Pour le férié"
    return "À la une"
