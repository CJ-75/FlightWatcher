"""
v4 Occasions Lot C — list active occasion chips with deal counts.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from deals.occasions_config import OCCASIONS, launch_chip_slugs


def _chip_visible(occ: Dict[str, Any], today: date) -> bool:
    slug = occ.get("slug")
    if slug == "il-fera-beau":
        try:
            from deals.weather_service import weather_enabled

            if not weather_enabled():
                return False
        except Exception:
            return False
    elif not occ.get("verified", True):
        return False
    kind = occ.get("kind") or "evergreen"
    if kind == "evergreen":
        return True
    months = occ.get("promote_months")
    if months and today.month in months:
        return True
    pf = occ.get("promote_from")
    if isinstance(pf, str) and len(pf) >= 5:
        try:
            mm, dd = int(pf[:2]), int(pf[3:5])
            start = date(today.year, mm, dd)
            # From promote_from through end of winter season for Oct starts
            if today >= start:
                return True
            # Early year after Oct promote (e.g. Jan still shows winter chips)
            if mm >= 10 and today.month <= 3:
                return True
        except ValueError:
            pass
    # Always allow launch set if verified
    if occ.get("slug") in launch_chip_slugs():
        # only in Oct–Jan window for seasonal launch chips
        if kind == "seasonal" and today.month in (10, 11, 12, 1):
            return True
    return kind == "evergreen"


def list_active_occasions(
    supabase: Any,
    *,
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    adults: int = 2,
    duration: Optional[str] = None,
    today: Optional[date] = None,
    min_deals: int = 3,
) -> Dict[str, Any]:
    """
    Occasions with ≥ min_deals for current wall (same filters as deals mur).
    Main row = launch_chip_slugs order (max 6 with count≥min); rest in more[].
    """
    today = today or date.today()
    from deals.community_list import list_community_deals

    # Same wall filters as GET /api/deals so chip counts match the grid
    deals = list_community_deals(
        supabase,
        origin=origin,
        destination=destination,
        adults=adults,
        duration=duration,
        limit=48,
    )
    counts: Dict[str, int] = {}
    for d in deals:
        for t in d.get("occasion_tags") or []:
            slug = str(t).strip().lower()
            if not slug:
                continue
            counts[slug] = counts.get(slug, 0) + 1

    launch = launch_chip_slugs()
    launch_set = set(launch)

    # Always emit visible chips (incl. launch with count 0) — UI shows labels
    # first; counts fill once this response arrives.
    items: List[Dict[str, Any]] = []
    for occ in OCCASIONS:
        if not _chip_visible(occ, today):
            continue
        slug = str(occ["slug"])
        n = int(counts.get(slug, 0))
        if n < min_deals and slug not in launch_set:
            continue
        items.append(
            {
                "slug": slug,
                "label": occ.get("label"),
                "icon": occ.get("icon"),
                "kind": occ.get("kind"),
                "explain": occ.get("explain"),
                "count": n,
                "priority": int(occ.get("priority") or 99),
                "push": bool(occ.get("push")),
            }
        )

    items.sort(key=lambda x: (x["priority"], -x["count"]))
    main: List[Dict[str, Any]] = []
    by_slug = {i["slug"]: i for i in items}
    for slug in launch:
        if slug in by_slug and len(main) < 6:
            main.append(by_slug[slug])
    for i in items:
        if len(main) >= 6:
            break
        if i["slug"] not in {m["slug"] for m in main}:
            main.append(i)
    main_slugs = {m["slug"] for m in main}
    more = [i for i in items if i["slug"] not in main_slugs and i["count"] >= min_deals]

    return {
        "ok": True,
        "today": today.isoformat(),
        "origin": origin,
        "main": main[:6],
        "more": more,
        "min_deals": min_deals,
    }
