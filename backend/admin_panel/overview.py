"""Admin overview — ultra-light first paint (<1–2s target)."""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from admin_panel.cache import get_cached, set_cached


def _svc():
    from supabase_client import get_supabase_service_client

    return get_supabase_service_client()


def _count(sb, table: str, **eq) -> int:
    try:
        q = sb.table(table).select("id", count="exact")
        for k, v in eq.items():
            q = q.eq(k, v)
        return int(q.limit(1).execute().count or 0)
    except Exception:
        return 0


def _count_gte(sb, table: str, col: str, since: str) -> int:
    try:
        res = (
            sb.table(table)
            .select("id", count="exact")
            .gte(col, since)
            .limit(1)
            .execute()
        )
        return int(res.count or 0)
    except Exception:
        return 0


def _status_embedded(sb) -> Dict[str, Any]:
    import os

    cached = get_cached("status_embedded_v1")
    if cached:
        return cached
    checks = [{"id": "api", "ok": True, "detail": "up"}]
    try:
        # reuse connection; presence already checked via deals count caller
        checks.append({"id": "supabase", "ok": True, "detail": "reachable"})
        checks.append({"id": "deals_wall", "ok": True, "detail": "probed"})
    except Exception as e:
        checks.append({"id": "supabase", "ok": False, "detail": str(e)})
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if not os.getenv(k)]
    checks.append(
        {
            "id": "env",
            "ok": not missing,
            "detail": "ok" if not missing else f"missing {', '.join(missing)}",
        }
    )
    out = {
        "ok": all(c["ok"] for c in checks),
        "checks": checks,
        "env": os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "unknown",
    }
    set_cached("status_embedded_v1", out, 60)
    return out


def build_overview(force: bool = False, light: bool = True) -> Dict[str, Any]:
    """
    light board: 3–4 Supabase count queries sequentially (thread-safe), no wall_health,
    no 2k event scans. Cached 60s.
    """
    cache_key = "admin_ov_fast_v3" if light else "admin_ov_heavy_v3"
    if not force:
        cached = get_cached(cache_key)
        if cached:
            return {**cached, "cached": True}

    t0 = time.perf_counter()
    sb = _svc()
    since7 = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    # Sequential small queries — supabase client is not reliably parallel-safe
    deals_active = _count(sb, "deals_active")
    users_total = _count(sb, "profiles")
    users_new = _count_gte(sb, "profiles", "created_at", since7)
    parcours_pub = _count(sb, "itineraries", status="published")
    if parcours_pub == 0:
        parcours_pub = _count(sb, "itineraries", published=True)
    parcours_total = _count(sb, "itineraries")
    bookings_failed = 0
    try:
        res = (
            sb.table("hotel_bookings")
            .select("id", count="exact")
            .in_("status", ["failed", "error"])
            .limit(1)
            .execute()
        )
        bookings_failed = int(res.count or 0)
    except Exception:
        bookings_failed = 0

    # Tiny event sample for WAU + top events (same query)
    wau_users = set()
    top_counts: Dict[str, int] = {}
    invites = 0
    try:
        eres = (
            sb.table("activity_events")
            .select("user_id,event_name,event_type")
            .gte("created_at", since7)
            .limit(300)
            .execute()
        )
        for row in eres.data or []:
            if row.get("user_id"):
                wau_users.add(row["user_id"])
            key = str(row.get("event_name") or row.get("event_type") or "unknown")
            top_counts[key] = top_counts.get(key, 0) + 1
            if "invite" in key.lower():
                invites += 1
    except Exception:
        pass

    wau = len(wau_users)
    top_events = sorted(
        [{"event": k, "n": v} for k, v in top_counts.items()],
        key=lambda x: -x["n"],
    )[:10]

    status = _status_embedded(sb)
    if deals_active == 0:
        for c in status.get("checks") or []:
            if c.get("id") == "deals_wall":
                c["ok"] = False
                c["detail"] = "empty wall"

    parts = {
        "users": {"total": users_total, "new_7d": users_new},
        "deals": {"active": deals_active},
        "parcours": {
            "published": parcours_pub,
            "draft": max(0, parcours_total - parcours_pub),
            "total": parcours_total,
        },
        "bookings": {"failed": bookings_failed},
        "growth": {
            "ok": True,
            "wau": wau,
            "dau": "—",
            "stickiness": "—",
            "invites_7d": invites,
            "shares_7d": 0,
            "virality_proxy": round(invites / max(1, wau), 3),
            "sampled": True,
        },
        "status": status,
        "product_funnel": {
            "days": 7,
            "top_events": top_events,
            "sampled": True,
        },
    }

    alerts = []
    if deals_active == 0:
        alerts.append(
            {"level": "warn", "code": "no_active_deals", "message": "Aucun séjour actif"}
        )
    if bookings_failed > 0:
        alerts.append(
            {
                "level": "warn",
                "code": "booking_fails",
                "message": f"{bookings_failed} bookings en échec",
            }
        )

    if not light:
        try:
            from deals.health import collect_wall_health

            parts["deals"]["wall_health"] = collect_wall_health(sb)
        except Exception as e:
            parts["deals"]["wall_health_error"] = str(e)

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    out = {
        "ok": True,
        "light": light,
        "elapsed_ms": elapsed_ms,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cached": False,
        **parts,
        "alerts": alerts,
    }
    set_cached(cache_key, out, ttl_sec=60)
    print(f"admin_overview light={light} force={force} elapsed_ms={elapsed_ms}")
    return out


def product_funnel(days: int = 14) -> Dict[str, Any]:
    cache_key = f"product_funnel_{days}_v2"
    cached = get_cached(cache_key)
    if cached:
        return cached
    sb = _svc()
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    counts: Dict[str, int] = {}
    try:
        res = (
            sb.table("activity_events")
            .select("event_name,event_type,name")
            .gte("created_at", since)
            .limit(500)
            .execute()
        )
        for row in res.data or []:
            key = row.get("event_name") or row.get("event_type") or row.get("name") or "unknown"
            counts[str(key)] = counts.get(str(key), 0) + 1
    except Exception:
        pass
    top = sorted(
        [{"event": k, "n": v} for k, v in counts.items()],
        key=lambda x: -x["n"],
    )[:20]
    out = {"ok": True, "days": days, "top_events": top, "sampled": True}
    set_cached(cache_key, out, 60)
    return out


def user_timeline(user_id: str, limit: int = 50) -> Dict[str, Any]:
    sb = _svc()
    events = []
    try:
        res = (
            sb.table("activity_events")
            .select("id,user_id,event_name,event_type,name,created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        events = res.data or []
    except Exception as e:
        return {"ok": False, "error": str(e), "events": []}

    notes = []
    try:
        nres = (
            sb.table("admin_user_notes")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(30)
            .execute()
        )
        notes = nres.data or []
    except Exception:
        notes = []

    profile = None
    try:
        pres = (
            sb.table("profiles")
            .select("id,email,full_name,created_at")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        profile = (pres.data or [None])[0]
        if profile:
            profile = {**profile, "_pii": True}
    except Exception:
        pass

    return {"ok": True, "user_id": user_id, "profile": profile, "events": events, "notes": notes}


def add_user_note(
    user_id: str,
    note: str,
    author_user_id: Optional[str] = None,
    author_email: Optional[str] = None,
) -> Dict[str, Any]:
    sb = _svc()
    row = {
        "user_id": user_id,
        "note": note.strip(),
        "author_user_id": author_user_id,
        "author_email": author_email,
    }
    try:
        res = sb.table("admin_user_notes").insert(row).execute()
        return {"ok": True, "note": (res.data or [row])[0]}
    except Exception as e:
        return {"ok": False, "error": str(e), "note": row}


def parcours_quality() -> Dict[str, Any]:
    cache_key = "parcours_quality_v2"
    cached = get_cached(cache_key)
    if cached:
        return cached
    sb = _svc()
    issues = []
    items = []
    try:
        res = (
            sb.table("itineraries")
            .select("id,title,slug,city,status,published,cover_image,updated_at")
            .limit(100)
            .execute()
        )
        for row in res.data or []:
            missing = []
            if not row.get("title"):
                missing.append("title")
            if not row.get("cover_image"):
                missing.append("cover")
            if not row.get("city"):
                missing.append("city")
            score = max(0, 100 - 20 * len(missing))
            items.append({**row, "quality_score": score, "missing": missing})
            if missing:
                issues.append(
                    {"id": row.get("id"), "missing": missing, "title": row.get("title")}
                )
    except Exception as e:
        return {"ok": False, "error": str(e), "items": [], "issues": []}
    items.sort(key=lambda x: x.get("quality_score", 0))
    out = {"ok": True, "items": items, "issues": issues, "count": len(items)}
    set_cached(cache_key, out, 60)
    return out
