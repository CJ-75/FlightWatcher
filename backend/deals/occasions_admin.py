"""
v4 Occasions Lot G — admin snapshot: actives, volume, unverified events.
"""
from __future__ import annotations

from collections import Counter
from datetime import date
from typing import Any, Dict, List, Optional

from deals.occasions_config import OCCASIONS, occasion_by_slug
from deals.occasions_api import _chip_visible


def collect_occasions_admin(
    supabase: Any,
    *,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    today = today or date.today()
    out: Dict[str, Any] = {
        "ok": True,
        "today": today.isoformat(),
        "weather_enabled": False,
        "active_chips": [],
        "tag_volume": [],
        "unverified": [],
        "pushable": [],
        "wall_active": 0,
        "error": None,
    }
    try:
        from deals.weather_service import weather_enabled

        out["weather_enabled"] = weather_enabled()
    except Exception:
        pass

    # Config inventory
    for occ in OCCASIONS:
        slug = str(occ.get("slug"))
        verified = bool(occ.get("verified", True))
        if slug == "il-fera-beau":
            verified = bool(out["weather_enabled"])
        entry = {
            "slug": slug,
            "label": occ.get("label"),
            "kind": occ.get("kind"),
            "verified": verified,
            "push": bool(occ.get("push")),
            "priority": occ.get("priority"),
            "chip_visible_today": _chip_visible(occ, today)
            if (verified or slug == "il-fera-beau")
            else False,
        }
        if not verified:
            out["unverified"].append(entry)
        if occ.get("push") and verified:
            out["pushable"].append(slug)

    if not supabase:
        out["error"] = "no_supabase"
        return out

    # Tag volume from deals_active
    try:
        res = (
            supabase.table("deals_active")
            .select("occasion_tags,occasion_badge,status")
            .eq("status", "active")
            .limit(2000)
            .execute()
        )
        rows = list(res.data or [])
        out["wall_active"] = len(rows)
        counts: Counter = Counter()
        badge_counts: Counter = Counter()
        for row in rows:
            for t in row.get("occasion_tags") or []:
                counts[str(t)] += 1
            b = row.get("occasion_badge")
            if b:
                badge_counts[str(b)] += 1
        volume = []
        for occ in OCCASIONS:
            slug = str(occ["slug"])
            n = int(counts.get(slug, 0))
            volume.append(
                {
                    "slug": slug,
                    "label": occ.get("label"),
                    "count": n,
                    "badge_count": int(badge_counts.get(slug, 0)),
                    "meets_chip_min": n >= 3,
                    "verified": (
                        bool(out["weather_enabled"])
                        if slug == "il-fera-beau"
                        else bool(occ.get("verified", True))
                    ),
                    "kind": occ.get("kind"),
                    "push": bool(occ.get("push")),
                }
            )
        volume.sort(key=lambda x: (-x["count"], x["slug"]))
        out["tag_volume"] = volume
        out["active_chips"] = [
            v
            for v in volume
            if v["meets_chip_min"]
            and v["verified"]
            and _chip_visible(occasion_by_slug(v["slug"]) or {}, today)
        ][:12]
    except Exception as e:
        out["error"] = str(e)
        out["ok"] = False

    # Recent seasonal sends (Lot F)
    try:
        sends = (
            supabase.table("deal_occasion_alert_sends")
            .select("channel,occasion_slug,sent_at,deal_count")
            .order("sent_at", desc=True)
            .limit(30)
            .execute()
        )
        out["recent_sends"] = list(sends.data or [])
    except Exception:
        out["recent_sends"] = []

    return out
