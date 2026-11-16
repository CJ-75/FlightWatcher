"""Public catalogue read for editorial itineraries (Parcours Lot 1)."""
from __future__ import annotations

import logging
import os
import re
import time
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("activities.itineraries_catalog")

PUBLIC_COLS = (
    "id,slug,title,subtitle,intro,cover_image,city_slug,served_city_id,"
    "status,author_kind,duration_kind,occasions,featured_from,featured_to,"
    "budget_estimate_eur,budget_basis,sort_weight,published_at,is_demo,"
    "photo_source,photo_license,photo_author,verified_at,pace,transport_modes,"
    "ideal_for,faq,tips,stay,target_query,color_key,featured,"
    "indexable_override,canonical_itinerary_id"
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
    # Budget vide → 0 (Gratuit) — aligné front obligatoire
    budget = out.get("budget_estimate_eur")
    if budget is None or budget == "":
        out["budget_estimate_eur"] = 0
    else:
        try:
            b = float(budget)
            out["budget_estimate_eur"] = 0 if (b < 0 or b != b) else b
        except (TypeError, ValueError):
            out["budget_estimate_eur"] = 0
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


def resolve_slug_redirect(
    supabase, *, city_slug: str, old_slug: str
) -> Optional[Dict[str, Any]]:
    """Return {city_slug, slug, itinerary_id} if old_slug redirects to a published Pop."""
    if not supabase:
        return None
    city = str(city_slug or "").strip().lower()
    old = str(old_slug or "").strip().lower()
    if not city or not old:
        return None
    try:
        res = (
            supabase.table("itinerary_slug_redirects")
            .select("city_slug,old_slug,itinerary_id")
            .eq("city_slug", city)
            .eq("old_slug", old)
            .limit(1)
            .execute()
        )
        if not res.data:
            # Fallback: slug_history contains old slug on a published row
            res2 = (
                supabase.table("itineraries")
                .select("id,slug,city_slug,status,is_demo")
                .eq("city_slug", city)
                .contains("slug_history", [old])
                .eq("status", "published")
                .limit(1)
                .execute()
            )
            if not res2.data:
                return None
            row = res2.data[0]
            if row.get("is_demo"):
                return None
            return {
                "city_slug": str(row.get("city_slug") or city),
                "slug": str(row.get("slug") or ""),
                "itinerary_id": str(row.get("id") or ""),
            }
        row = res.data[0]
        iid = str(row.get("itinerary_id") or "")
        if not iid:
            return None
        itin = (
            supabase.table("itineraries")
            .select("id,slug,city_slug,status,is_demo")
            .eq("id", iid)
            .limit(1)
            .execute()
        )
        if not itin.data:
            return None
        live = itin.data[0]
        if live.get("status") != "published" or live.get("is_demo"):
            return None
        return {
            "city_slug": str(live.get("city_slug") or city),
            "slug": str(live.get("slug") or ""),
            "itinerary_id": iid,
        }
    except Exception as e:
        logger.warning("resolve_slug_redirect: %s", e)
        return None


def get_itinerary_status_by_slug(
    supabase, *, slug: str
) -> Optional[Dict[str, Any]]:
    """Any status (published/retired/draft) — for 410 vs 404."""
    if not supabase or not slug:
        return None
    try:
        res = (
            supabase.table("itineraries")
            .select("id,slug,city_slug,status,is_demo")
            .eq("slug", str(slug).strip().lower())
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        return _serialize(res.data[0])
    except Exception as e:
        logger.warning("get_itinerary_status_by_slug: %s", e)
        return None


def list_pop_index_cities(supabase) -> List[Dict[str, Any]]:
    if not supabase:
        return []
    try:
        res = (
            supabase.table("pop_index_cities")
            .select("city_slug,indexable,opened_at,notes,updated_at")
            .order("city_slug")
            .execute()
        )
        return list(res.data or [])
    except Exception as e:
        logger.warning("list_pop_index_cities: %s", e)
        return []


def is_city_indexable(supabase, city_slug: str) -> bool:
    city = str(city_slug or "").strip().lower()
    if not city:
        return False
    try:
        res = (
            supabase.table("pop_index_cities")
            .select("indexable")
            .eq("city_slug", city)
            .limit(1)
            .execute()
        )
        if not res.data:
            return False
        return bool(res.data[0].get("indexable"))
    except Exception as e:
        logger.warning("is_city_indexable: %s", e)
        return False


def upsert_pop_index_city(
    supabase,
    city_slug: str,
    *,
    indexable: Optional[bool] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """Create/update pop_index_cities row (admin SEO tab)."""
    from datetime import datetime, timezone

    city = str(city_slug or "").strip().lower()
    if not city or not re.match(r"^[a-z0-9-]{2,64}$", city):
        return {"ok": False, "error": "invalid_city_slug"}
    if not supabase:
        return {"ok": False, "error": "no_supabase"}

    now = datetime.now(timezone.utc).isoformat()
    try:
        existing = (
            supabase.table("pop_index_cities")
            .select("city_slug,indexable,opened_at,notes,updated_at")
            .eq("city_slug", city)
            .limit(1)
            .execute()
        )
        prev = (existing.data or [None])[0]
        payload: Dict[str, Any] = {"city_slug": city, "updated_at": now}
        if notes is not None:
            payload["notes"] = str(notes)[:2000] if notes else None
        if indexable is not None:
            payload["indexable"] = bool(indexable)
            was_open = bool(prev.get("indexable")) if prev else False
            if bool(indexable) and not was_open:
                payload["opened_at"] = now
            elif not prev:
                payload["opened_at"] = now if bool(indexable) else None
        elif not prev:
            payload["indexable"] = False

        res = (
            supabase.table("pop_index_cities")
            .upsert(payload, on_conflict="city_slug")
            .execute()
        )
        row = (res.data or [payload])[0]
        return {"ok": True, "city": _serialize(row)}
    except Exception as e:
        logger.warning("upsert_pop_index_city: %s", e)
        return {"ok": False, "error": str(e)}


def admin_seo_dashboard(supabase) -> Dict[str, Any]:
    """Cities indexation + published pops SEO gaps for admin tab."""
    if not supabase:
        return {"ok": False, "error": "no_supabase", "cities": [], "pops": []}

    cities = list_pop_index_cities(supabase)
    open_set = {
        str(c.get("city_slug") or "").lower()
        for c in cities
        if c.get("indexable")
    }

    pops: List[Dict[str, Any]] = []
    published_by_city: Dict[str, int] = {}
    try:
        res = (
            supabase.table("itineraries")
            .select(
                "id,slug,title,city_slug,status,is_demo,featured,"
                "target_query,intro,cover_image,photo_license,verified_at,"
                "indexable_override,canonical_itinerary_id,updated_at,published_at"
            )
            .eq("status", "published")
            .eq("is_demo", False)
            .order("city_slug")
            .limit(500)
            .execute()
        )
        for raw in res.data or []:
            row = _serialize(raw)
            city = str(row.get("city_slug") or "").strip().lower()
            if city:
                published_by_city[city] = published_by_city.get(city, 0) + 1
            gaps: List[str] = []
            intro_len = len(str(row.get("intro") or "").strip())
            if intro_len < 80:
                gaps.append("intro")
            if not str(row.get("cover_image") or "").strip():
                gaps.append("cover")
            if not str(row.get("photo_license") or "").strip():
                gaps.append("license")
            if not str(row.get("target_query") or "").strip():
                gaps.append("target_query")
            if not row.get("verified_at"):
                gaps.append("verified_at")
            if row.get("canonical_itinerary_id"):
                gaps.append("canonical")
            if row.get("indexable_override") is False:
                gaps.append("override_off")
            city_open = city in open_set
            if not city_open and row.get("indexable_override") is not True:
                gaps.append("city_closed")
            pops.append(
                {
                    "id": row.get("id"),
                    "slug": row.get("slug"),
                    "title": row.get("title"),
                    "city_slug": city,
                    "featured": bool(row.get("featured")),
                    "target_query": row.get("target_query"),
                    "intro_len": intro_len,
                    "gaps": gaps,
                    "seo_ready": len(gaps) == 0,
                    "updated_at": row.get("updated_at"),
                }
            )
    except Exception as e:
        logger.warning("admin_seo_dashboard pops: %s", e)
        return {
            "ok": False,
            "error": str(e),
            "cities": cities,
            "pops": [],
            "open_cities": sorted(open_set),
        }

    city_rows = []
    for c in cities:
        slug = str(c.get("city_slug") or "").lower()
        city_rows.append(
            {
                **_serialize(c),
                "published_count": published_by_city.get(slug, 0),
            }
        )
    # Cities with pops but no pop_index_cities row
    known = {str(c.get("city_slug") or "").lower() for c in cities}
    for slug, n in sorted(published_by_city.items()):
        if slug and slug not in known:
            city_rows.append(
                {
                    "city_slug": slug,
                    "indexable": False,
                    "opened_at": None,
                    "notes": None,
                    "updated_at": None,
                    "published_count": n,
                    "missing_row": True,
                }
            )

    ready = sum(1 for p in pops if p.get("seo_ready"))
    return {
        "ok": True,
        "cities": city_rows,
        "pops": pops,
        "open_cities": sorted(open_set),
        "stats": {
            "cities_total": len(city_rows),
            "cities_open": len(open_set),
            "pops_published": len(pops),
            "pops_seo_ready": ready,
        },
    }


def list_sitemap_pops(supabase) -> Dict[str, Any]:
    """Published non-demo pops for sitemap — light fields only."""
    if not supabase:
        return {"ok": False, "cities": {}, "error": "no_supabase"}
    try:
        res = (
            supabase.table("itineraries")
            .select(
                "id,slug,city_slug,updated_at,published_at,"
                "indexable_override,canonical_itinerary_id,is_demo,status,"
                "intro,cover_image,photo_license,verified_at"
            )
            .eq("status", "published")
            .eq("author_kind", "admin")
            .eq("is_demo", False)
            .order("city_slug")
            .limit(2000)
            .execute()
        )
        open_cities = {
            str(c.get("city_slug") or "").lower()
            for c in list_pop_index_cities(supabase)
            if c.get("indexable")
        }
        by_city: Dict[str, List[Dict[str, Any]]] = {}
        for raw in res.data or []:
            row = _serialize(raw)
            city = str(row.get("city_slug") or "").strip().lower()
            slug = str(row.get("slug") or "").strip().lower()
            if not city or not slug:
                continue
            if row.get("canonical_itinerary_id"):
                continue
            if row.get("indexable_override") is False:
                continue
            # Sitemap only cities opened for indexation
            if city not in open_cities and row.get("indexable_override") is not True:
                continue
            # Minimal content gate (full threshold on page)
            intro_len = len(str(row.get("intro") or "").strip())
            if intro_len < 80:
                continue
            if not str(row.get("cover_image") or "").strip():
                continue
            if not str(row.get("photo_license") or "").strip():
                continue
            lastmod = str(row.get("updated_at") or row.get("published_at") or "")[:10]
            by_city.setdefault(city, []).append(
                {"slug": slug, "lastmod": lastmod or None}
            )
        return {"ok": True, "cities": by_city, "open_cities": sorted(open_cities)}
    except Exception as e:
        logger.warning("list_sitemap_pops: %s", e)
        return {"ok": False, "cities": {}, "error": str(e)}
