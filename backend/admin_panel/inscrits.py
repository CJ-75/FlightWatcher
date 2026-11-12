"""Admin inscrits + onboarding — lectures légères sur user_profiles."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from admin_panel.cache import get_cached, set_cached

_SELECT = (
    "id,email,full_name,display_name,created_at,"
    "onboarding_completed,onboarding_completed_at,last_onboarding_step,"
    "home_airport,home_city_slug"
)


def _svc():
    from supabase_client import get_supabase_service_client, get_supabase_client

    return get_supabase_service_client() or get_supabase_client()


def _count(sb, **filters) -> int:
    try:
        q = sb.table("user_profiles").select("id", count="exact")
        for k, v in filters.items():
            q = q.eq(k, v)
        return int(q.limit(1).execute().count or 0)
    except Exception:
        return 0


def stats_inscrits(force: bool = False) -> Dict[str, Any]:
    cache_key = "admin_inscrits_stats_v1"
    if not force:
        cached = get_cached(cache_key)
        if cached:
            return {**cached, "cached": True}

    sb = _svc()
    total = _count(sb)
    onboarded = _count(sb, onboarding_completed=True)
    # Fallback: last_onboarding_step = done if bool column sparse
    if onboarded == 0 and total > 0:
        try:
            res = (
                sb.table("user_profiles")
                .select("id", count="exact")
                .eq("last_onboarding_step", "done")
                .limit(1)
                .execute()
            )
            onboarded = int(res.count or 0)
        except Exception:
            pass
    pending = max(0, total - onboarded)
    pct = round(100.0 * onboarded / total, 1) if total else 0.0
    out = {
        "ok": True,
        "total": total,
        "onboarded": onboarded,
        "pending": pending,
        "onboarded_pct": pct,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cached": False,
    }
    set_cached(cache_key, out, 45)
    return out


def list_inscrits(
    *,
    page: int = 1,
    page_size: int = 50,
    q: Optional[str] = None,
    onboarding: str = "all",
) -> Dict[str, Any]:
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 50), 100))
    onboarding = (onboarding or "all").lower()
    if onboarding not in ("all", "done", "pending"):
        onboarding = "all"

    sb = _svc()
    stats = stats_inscrits()

    try:
        query = sb.table("user_profiles").select(_SELECT, count="exact")
        if q and q.strip():
            # PostgREST or — ilike on email (simple); name filter client-side if needed
            query = query.or_(
                f"email.ilike.%{q.strip()}%,full_name.ilike.%{q.strip()}%,display_name.ilike.%{q.strip()}%"
            )
        if onboarding == "done":
            query = query.eq("onboarding_completed", True)
        elif onboarding == "pending":
            query = query.eq("onboarding_completed", False)

        offset = (page - 1) * page_size
        result = query.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
        rows = result.data or []
        total_filtered = int(result.count or len(rows))
    except Exception as e:
        # Column onboarding_completed_at may be missing
        try:
            query = sb.table("user_profiles").select(
                "id,email,full_name,display_name,created_at,"
                "onboarding_completed,last_onboarding_step,home_airport,home_city_slug",
                count="exact",
            )
            if q and q.strip():
                query = query.ilike("email", f"%{q.strip()}%")
            if onboarding == "done":
                query = query.eq("onboarding_completed", True)
            elif onboarding == "pending":
                query = query.eq("onboarding_completed", False)
            offset = (page - 1) * page_size
            result = (
                query.order("created_at", desc=True)
                .range(offset, offset + page_size - 1)
                .execute()
            )
            rows = result.data or []
            total_filtered = int(result.count or len(rows))
        except Exception as e2:
            return {
                "ok": False,
                "error": str(e2) or str(e),
                "users": [],
                "total": 0,
                "page": page,
                "page_size": page_size,
                **{k: stats.get(k) for k in ("onboarded", "pending", "onboarded_pct")},
                "inscrits_total": stats.get("total", 0),
            }

    users = []
    for r in rows:
        done = bool(r.get("onboarding_completed")) or str(
            r.get("last_onboarding_step") or ""
        ).lower() in ("done", "completed")
        users.append(
            {
                "id": r.get("id"),
                "email": r.get("email"),
                "nom": r.get("full_name") or r.get("display_name") or "",
                "inscrit_le": r.get("created_at"),
                "onboarding_fait": done,
                "onboarding_le": r.get("onboarding_completed_at"),
                "ville": r.get("home_city_slug"),
                "aeroport": r.get("home_airport"),
            }
        )

    return {
        "ok": True,
        "users": users,
        "total": total_filtered,
        "page": page,
        "page_size": page_size,
        "inscrits_total": stats.get("total", 0),
        "onboarded": stats.get("onboarded", 0),
        "pending": stats.get("pending", 0),
        "onboarded_pct": stats.get("onboarded_pct", 0),
        "cached_stats": stats.get("cached", False),
    }
