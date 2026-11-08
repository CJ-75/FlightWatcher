"""Public catalogue read for editorial itineraries (Parcours Lot 1)."""
from __future__ import annotations

import logging
import os
from datetime import date
from typing import Any, Dict, List, Optional

logger = logging.getLogger("activities.itineraries_catalog")

PUBLIC_COLS = (
    "id,slug,title,subtitle,intro,cover_image,city_slug,served_city_id,"
    "status,author_kind,duration_kind,occasions,featured_from,featured_to,"
    "budget_estimate_eur,budget_basis,sort_weight,published_at,is_demo"
)

# Unsplash covers (mobile-friendly) — aligned with packages/shared cityUnsplash.ts
_CITY_COVER_FALLBACK = {
    "paris": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1280&q=80&fm=jpg",
    "marseille": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1280&q=80&fm=jpg",
    "lisbon": "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1280&q=80&fm=jpg",
    "lisbonne": "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1280&q=80&fm=jpg",
    "porto": "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1280&q=80&fm=jpg",
}

_SLUG_COVER_FALLBACK = {
    "balade-romantique-paris": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1280&q=80&fm=jpg",
    "ferie-11-novembre-paris": "https://images.unsplash.com/photo-1522093007474-d86e9bf7ba6f?auto=format&fit=crop&w=1280&q=80&fm=jpg",
    "marseille-au-soleil": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1280&q=80&fm=jpg",
    "marseille-en-amoureux": "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1280&q=80&fm=jpg",
    "lisbonne-week-end": "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1280&q=80&fm=jpg",
    "porto-tout-doux": "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1280&q=80&fm=jpg",
}


def _allow_demo() -> bool:
    return (os.getenv("ITINERARIES_DEMO") or "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
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
    ):
        out["cover_image"] = curated
    elif not cover and curated:
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
    try:
        q = (
            supabase.table("itineraries")
            .select(PUBLIC_COLS)
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
        return {"ok": True, "itineraries": rows}
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
    try:
        q = (
            supabase.table("itineraries")
            .select(f"{PUBLIC_COLS}, itinerary_items(*, places(*))")
            .eq("status", "published")
            .limit(1)
        )
        if slug:
            q = q.eq("slug", str(slug).strip().lower())
        else:
            q = q.eq("id", itinerary_id)
        res = q.execute()
        if not res.data:
            return {"ok": False, "error": "not_found"}
        row = _serialize(res.data[0])
        if row.get("is_demo") and not demo:
            return {"ok": False, "error": "not_found"}
        return {"ok": True, "itinerary": row}
    except Exception as e:
        logger.warning("get_published_itinerary: %s", e)
        return {"ok": False, "error": str(e)}


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
