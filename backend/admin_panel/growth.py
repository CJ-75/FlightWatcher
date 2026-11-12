"""Growth / conversion / digests health for admin board."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from admin_panel.cache import get_cached, set_cached


def _svc():
    from supabase_client import get_supabase_service_client

    return get_supabase_service_client()


def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def conversion_cohorts(days: int = 28) -> Dict[str, Any]:
    cache_key = f"growth_cohorts_{days}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    sb = _svc()
    since = _iso_days_ago(days)
    signups_by_day: Dict[str, int] = {}
    try:
        res = (
            sb.table("profiles")
            .select("id,created_at")
            .gte("created_at", since)
            .limit(5000)
            .execute()
        )
        for row in res.data or []:
            day = str(row.get("created_at") or "")[:10]
            if day:
                signups_by_day[day] = signups_by_day.get(day, 0) + 1
    except Exception:
        pass

    activated = 0
    try:
        eres = (
            sb.table("activity_events")
            .select("user_id,event_name,event_type,created_at")
            .gte("created_at", since)
            .limit(3000)
            .execute()
        )
        users = set()
        for row in eres.data or []:
            name = str(row.get("event_name") or row.get("event_type") or "")
            if any(x in name for x in ("book", "save", "invite", "itinerary_open", "deal_view")):
                if row.get("user_id"):
                    users.add(row["user_id"])
        activated = len(users)
    except Exception:
        pass

    out = {
        "ok": True,
        "days": days,
        "signups_by_day": [
            {"day": d, "n": signups_by_day[d]} for d in sorted(signups_by_day.keys())
        ],
        "signups_total": sum(signups_by_day.values()),
        "activated_users": activated,
        "activation_rate": round(
            activated / max(1, sum(signups_by_day.values())), 3
        ),
    }
    set_cached(cache_key, out, 45)
    return out


def growth_kpis() -> Dict[str, Any]:
    cache_key = "growth_kpis_v2"
    cached = get_cached(cache_key)
    if cached:
        return cached

    sb = _svc()
    now = datetime.now(timezone.utc)
    wau_users = set()
    dau_users = set()
    invites = 0
    shares = 0
    try:
        res = (
            sb.table("activity_events")
            .select("user_id,event_name,event_type,created_at")
            .gte("created_at", (now - timedelta(days=7)).isoformat())
            .limit(800)
            .execute()
        )
        day_cut = (now - timedelta(days=1)).isoformat()
        for row in res.data or []:
            uid = row.get("user_id")
            if uid:
                wau_users.add(uid)
                if str(row.get("created_at") or "") >= day_cut:
                    dau_users.add(uid)
            name = str(row.get("event_name") or row.get("event_type") or "").lower()
            if "invite" in name:
                invites += 1
            if "share" in name or "viral" in name:
                shares += 1
    except Exception:
        pass

    wau = len(wau_users)
    dau = len(dau_users)
    out = {
        "ok": True,
        "wau": wau,
        "dau": dau,
        "stickiness": round(dau / max(1, wau), 3),
        "invites_7d": invites,
        "shares_7d": shares,
        "virality_proxy": round((invites + shares) / max(1, wau), 3),
        "loops": {
            "invite": invites,
            "share": shares,
        },
    }
    set_cached(cache_key, out, 60)
    return out


def digests_health() -> Dict[str, Any]:
    sb = _svc()
    out: Dict[str, Any] = {"ok": True, "queued": 0, "sent_7d": 0, "failed_7d": 0}
    since = _iso_days_ago(7)
    for table in ("email_digests", "digest_logs", "notification_logs"):
        try:
            res = (
                sb.table(table)
                .select("id,status,created_at")
                .gte("created_at", since)
                .limit(500)
                .execute()
            )
            rows = res.data or []
            out["source_table"] = table
            out["sent_7d"] = sum(
                1 for r in rows if str(r.get("status") or "").lower() in ("sent", "ok", "delivered")
            )
            out["failed_7d"] = sum(
                1 for r in rows if str(r.get("status") or "").lower() in ("failed", "error", "bounced")
            )
            out["queued"] = sum(
                1 for r in rows if str(r.get("status") or "").lower() in ("queued", "pending")
            )
            break
        except Exception:
            continue
    return out


def content_calendar() -> Dict[str, Any]:
    sb = _svc()
    items: List[Dict[str, Any]] = []
    try:
        res = (
            sb.table("itineraries")
            .select("id,title,city,status,published,publish_at,updated_at,created_at")
            .order("updated_at", desc=True)
            .limit(100)
            .execute()
        )
        for row in res.data or []:
            items.append(
                {
                    "id": row.get("id"),
                    "title": row.get("title"),
                    "city": row.get("city"),
                    "status": "published"
                    if row.get("published")
                    else (row.get("status") or "draft"),
                    "when": row.get("publish_at") or row.get("updated_at") or row.get("created_at"),
                    "type": "parcours",
                }
            )
    except Exception as e:
        return {"ok": False, "error": str(e), "items": []}
    return {"ok": True, "items": items}
