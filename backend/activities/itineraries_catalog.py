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

# Wikimedia city heroes (aligned with packages/shared cityImages) — fill empty covers in API.
_CITY_COVER_FALLBACK = {
    "paris": (
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/"
        "La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/"
        "1280px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg"
    ),
    "marseille": (
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/"
        "Notre-Dame_de_la_Garde_aerial_view_2020.jpeg/"
        "1280px-Notre-Dame_de_la_Garde_aerial_view_2020.jpeg"
    ),
    "lisbon": (
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/"
        "Lisboa_-_Portugal_%2852597836992%29.jpg/"
        "1280px-Lisboa_-_Portugal_%2852597836992%29.jpg"
    ),
    "lisbonne": (
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/"
        "Lisboa_-_Portugal_%2852597836992%29.jpg/"
        "1280px-Lisboa_-_Portugal_%2852597836992%29.jpg"
    ),
    "porto": (
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e5/"
        "Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG/"
        "1280px-Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG"
    ),
}

# Per-slug covers so demo cards are not all identical for a city.
_SLUG_COVER_FALLBACK = {
    "ferie-11-novembre-paris": (
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/"
        "Paris_-_Eiffelturm_und_Marsfeld2.jpg/"
        "1280px-Paris_-_Eiffelturm_und_Marsfeld2.jpg"
    ),
    "marseille-en-amoureux": (
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1a/"
        "Vieux-Port_de_Marseille.jpg/"
        "1280px-Vieux-Port_de_Marseille.jpg"
    ),
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
    cover = str(out.get("cover_image") or "").strip()
    if not cover:
        slug = str(out.get("slug") or "").strip().lower()
        city = str(out.get("city_slug") or "").strip().lower()
        out["cover_image"] = (
            _SLUG_COVER_FALLBACK.get(slug)
            or _CITY_COVER_FALLBACK.get(city)
            or None
        )
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
    """Simple FR label for À la une — refined in Lot 3."""
    if not itineraries:
        return None
    occasions = itineraries[0].get("occasions") or []
    if "ferie" in occasions:
        return "Pour le férié"
    return "À la une"
