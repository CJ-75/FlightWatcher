"""Weekly snapshot refresh for major cities (Lot B/H)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from activities.config import ActivitiesConfig, load_activities_config
from activities.service import search_city_activities

logger = logging.getLogger("activities.snapshots")

DEFAULT_CITY_SLUGS: List[str] = [
    "paris",
    "rome",
    "barcelone",
    "lisbonne",
    "milan",
    "amsterdam",
    "barcelone",
    "madrid",
    "londres",
    "berlin",
]


def refresh_city_snapshots(
    supabase,
    *,
    city_slugs: Optional[List[str]] = None,
    adults: int = 2,
    cfg: Optional[ActivitiesConfig] = None,
) -> Dict[str, Any]:
    """
    Force-refresh Viator city caches for major destinations.
    Dedupes slug list. Continues on per-city errors.
    """
    cfg = cfg or load_activities_config()
    if cfg.snapshot_refresh not in ("weekly", "once", "daily"):
        return {"ok": False, "error": "snapshot_refresh_disabled", "refreshed": 0}

    seen = set()
    slugs: List[str] = []
    for s in city_slugs or DEFAULT_CITY_SLUGS:
        k = str(s or "").strip().lower()
        if not k or k in seen:
            continue
        seen.add(k)
        slugs.append(k)

    refreshed = 0
    errors: Dict[str, str] = {}
    for slug in slugs:
        try:
            # Bust cache key by writing a fresh search (search writes cache)
            # Delete prior cache row if present
            try:
                cache_key = f"city:{slug}::{adults}"
                supabase.table("provider_cache").delete().eq(
                    "provider", "viator"
                ).eq("resource", "city_search").eq("cache_key", cache_key).execute()
            except Exception:
                pass
            out = search_city_activities(
                supabase, city_slug=slug, adults=adults, cfg=cfg
            )
            if out.get("ok"):
                refreshed += 1
            else:
                errors[slug] = str(out.get("error") or "failed")
        except Exception as e:
            logger.warning("snapshot %s: %s", slug, e)
            errors[slug] = str(e)

    return {
        "ok": True,
        "refreshed": refreshed,
        "total": len(slugs),
        "errors": errors or None,
    }
