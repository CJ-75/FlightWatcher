"""Admin inscrits + onboarding — lectures parallèles + cache SWR."""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from admin_panel.cache import swr

_SELECT = (
    "id,email,full_name,display_name,created_at,"
    "onboarding_completed,onboarding_completed_at,last_onboarding_step,"
    "home_airport,home_city_slug"
)

# Pool réutilisé pour fan-out PostgREST (évite séquentiel RTT×N)
_POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix="admin-sb")


def _svc():
    from supabase_client import get_supabase_service_client, get_supabase_client

    return get_supabase_service_client() or get_supabase_client()


def _count_head(sb, table: str = "user_profiles", **filters) -> int:
    """Count exact without transferring rows (Prefer: count=exact, head)."""
    try:
        q = sb.table(table).select("id", count="exact", head=True)
        for k, v in filters.items():
            q = q.eq(k, v)
        return int(q.execute().count or 0)
    except TypeError:
        # Older supabase-py without head=
        try:
            q = sb.table(table).select("id", count="exact")
            for k, v in filters.items():
                q = q.eq(k, v)
            return int(q.limit(1).execute().count or 0)
        except Exception:
            return 0
    except Exception:
        return 0


def _count_gte(sb, table: str, col: str, since: str, **eq) -> int:
    try:
        q = sb.table(table).select("id", count="exact", head=True).gte(col, since)
        for k, v in eq.items():
            q = q.eq(k, v)
        return int(q.execute().count or 0)
    except TypeError:
        try:
            q = sb.table(table).select("id", count="exact").gte(col, since)
            for k, v in eq.items():
                q = q.eq(k, v)
            return int(q.limit(1).execute().count or 0)
        except Exception:
            return 0
    except Exception:
        return 0


def _run_parallel(jobs: Dict[str, Any]) -> Dict[str, Any]:
    """jobs: name -> callable. Returns name -> result (or exception)."""
    out: Dict[str, Any] = {}
    futs = {_POOL.submit(fn): name for name, fn in jobs.items()}
    for fut in as_completed(futs):
        name = futs[fut]
        try:
            out[name] = fut.result()
        except Exception as e:
            out[name] = e
    return out


def _build_stats_inscrits() -> Dict[str, Any]:
    sb = _svc()
    parts = _run_parallel(
        {
            "total": lambda: _count_head(sb),
            "onboarded": lambda: _count_head(sb, onboarding_completed=True),
        }
    )
    total = int(parts.get("total") or 0) if not isinstance(parts.get("total"), Exception) else 0
    onboarded = (
        int(parts.get("onboarded") or 0)
        if not isinstance(parts.get("onboarded"), Exception)
        else 0
    )
    if onboarded == 0 and total > 0:
        try:
            onboarded = _count_head(sb, last_onboarding_step="done")
        except Exception:
            pass
    pending = max(0, total - onboarded)
    pct = round(100.0 * onboarded / total, 1) if total else 0.0
    return {
        "ok": True,
        "total": total,
        "onboarded": onboarded,
        "pending": pending,
        "onboarded_pct": pct,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def stats_inscrits(force: bool = False) -> Dict[str, Any]:
    return swr(
        "admin_inscrits_stats_v2",
        _build_stats_inscrits,
        ttl_sec=60,
        stale_sec=240,
        force=force,
    )


def _build_dashboard(days: int) -> Dict[str, Any]:
    """Accueil léger : counts HEAD only (pas de scan 2k lignes / séries)."""
    t0 = time.perf_counter()
    sb = _svc()
    now = datetime.now(timezone.utc)
    since7 = (now - timedelta(days=7)).isoformat()
    since1 = (now - timedelta(days=1)).isoformat()

    parts = _run_parallel(
        {
            "stats": _build_stats_inscrits,
            "new_7d": lambda: _count_gte(sb, "user_profiles", "created_at", since7),
            "new_24h": lambda: _count_gte(sb, "user_profiles", "created_at", since1),
            "parcours_pub": lambda: _count_head(sb, "itineraries", status="published"),
        }
    )

    def _ok(name: str, default: Any) -> Any:
        v = parts.get(name, default)
        return default if isinstance(v, Exception) else v

    base = _ok("stats", {"total": 0, "onboarded": 0, "pending": 0, "onboarded_pct": 0})
    total = int(base.get("total") or 0)
    onboarded = int(base.get("onboarded") or 0)
    pending = int(base.get("pending") or 0)
    new_7d = int(_ok("new_7d", 0) or 0)
    new_24h = int(_ok("new_24h", 0) or 0)
    parcours_pub = int(_ok("parcours_pub", 0) or 0)
    if parcours_pub == 0:
        parcours_pub = _count_head(sb, "itineraries", published=True)

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    return {
        "ok": True,
        "days": days,
        "generated_at": now.isoformat(),
        "elapsed_ms": elapsed_ms,
        "kpis": {
            "total": total,
            "onboarded": onboarded,
            "pending": pending,
            "onboarded_pct": base.get("onboarded_pct", 0),
            "new_24h": new_24h,
            "new_7d": new_7d,
            "onboarded_in_window": 0,
            "pending_stale_7d": 0,
            "lag_hours_avg": None,
            "lag_hours_p50": None,
            "conversion_7d_pct": None,
            "signups_7d": new_7d,
            "onboarded_7d": 0,
        },
        "series": [],
        "top_cities": [],
        "top_airports": [],
        "contenu": {
            "parcours_published": parcours_pub,
            "parcours_draft": 0,
            "parcours_total": parcours_pub,
        },
    }


def dashboard(days: int = 30, force: bool = False) -> Dict[str, Any]:
    """KPIs Accueil — counts only + SWR (fresh 60s / stale 5min)."""
    days = max(7, min(int(days or 30), 90))
    return swr(
        f"admin_dashboard_v3_light_{days}",
        lambda: _build_dashboard(days),
        ttl_sec=60,
        stale_sec=300,
        force=force,
    )


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
    # Stats from cache only — never block list on fresh counts
    stats = stats_inscrits(force=False)

    def _query(select_cols: str):
        query = sb.table("user_profiles").select(select_cols, count="exact")
        if q and q.strip():
            qs = q.strip().replace(",", " ")
            query = query.or_(
                f"email.ilike.%{qs}%,full_name.ilike.%{qs}%,display_name.ilike.%{qs}%"
            )
        if onboarding == "done":
            query = query.eq("onboarding_completed", True)
        elif onboarding == "pending":
            query = query.eq("onboarding_completed", False)
        offset = (page - 1) * page_size
        return query.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()

    try:
        result = _query(_SELECT)
        rows = result.data or []
        total_filtered = int(result.count or len(rows))
    except Exception as e:
        try:
            result = _query(
                "id,email,full_name,display_name,created_at,"
                "onboarding_completed,last_onboarding_step,home_airport,home_city_slug"
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
        "cached_stats": bool(stats.get("cached")),
    }


_EDITABLE = (
    "full_name",
    "display_name",
    "home_city_slug",
    "home_airport",
    "onboarding_completed",
    "last_onboarding_step",
)


def update_inscrit(user_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    """Met à jour le profil (champs admin autorisés)."""
    from admin_panel.cache import clear_cached

    user_id = (user_id or "").strip()
    if not user_id:
        return {"ok": False, "error": "user_id requis"}

    body: Dict[str, Any] = {}
    for key in _EDITABLE:
        if key not in patch:
            continue
        val = patch.get(key)
        if key == "onboarding_completed":
            body[key] = bool(val)
            if body[key]:
                body.setdefault("last_onboarding_step", "done")
                if "onboarding_completed_at" not in body:
                    body["onboarding_completed_at"] = datetime.now(timezone.utc).isoformat()
            else:
                body["last_onboarding_step"] = None
        elif key in ("full_name", "display_name", "home_city_slug", "home_airport"):
            s = (str(val).strip() if val is not None else "") or None
            body[key] = s
        else:
            body[key] = val

    # Convenience: nom → full_name
    if "nom" in patch and "full_name" not in body:
        body["full_name"] = (str(patch.get("nom") or "").strip() or None)
    if "ville" in patch and "home_city_slug" not in body:
        body["home_city_slug"] = (str(patch.get("ville") or "").strip().lower() or None)
    if "aeroport" in patch and "home_airport" not in body:
        body["home_airport"] = (str(patch.get("aeroport") or "").strip().upper() or None)

    if not body:
        return {"ok": False, "error": "Aucun champ à mettre à jour"}

    sb = _svc()
    try:
        res = sb.table("user_profiles").update(body).eq("id", user_id).execute()
        row = (res.data or [None])[0]
    except Exception as e:
        return {"ok": False, "error": str(e)}

    clear_cached("admin_inscrits")
    clear_cached("admin_dashboard")
    if not row:
        return {"ok": True, "user_id": user_id, "updated": body, "warning": "no_row_returned"}
    return {
        "ok": True,
        "user": {
            "id": row.get("id"),
            "email": row.get("email"),
            "nom": row.get("full_name") or row.get("display_name") or "",
            "inscrit_le": row.get("created_at"),
            "onboarding_fait": bool(row.get("onboarding_completed")),
            "onboarding_le": row.get("onboarding_completed_at"),
            "ville": row.get("home_city_slug"),
            "aeroport": row.get("home_airport"),
        },
    }


def delete_inscrit(user_id: str, *, confirm: str = "") -> Dict[str, Any]:
    """Supprime compte auth + profil (détache bookings). Step-up côté route."""
    from admin_panel.cache import clear_cached

    user_id = (user_id or "").strip()
    if not user_id:
        return {"ok": False, "error": "user_id requis"}
    if (confirm or "").strip().upper() not in ("SUPPRIMER", "DELETE", "YES"):
        return {"ok": False, "error": 'Confirme avec confirm: "SUPPRIMER"'}

    sb = _svc()
    try:
        from routes.user import _best_effort_detach_then_delete_user

        _best_effort_detach_then_delete_user(sb, user_id)
    except Exception as e:
        # Fallback minimal
        try:
            sb.table("user_profiles").delete().eq("id", user_id).execute()
        except Exception as e2:
            return {"ok": False, "error": str(e2) or str(e)}

    try:
        sb.auth.admin.delete_user(user_id)
    except Exception as e:
        # Profile may already be gone; auth delete best-effort
        return {
            "ok": True,
            "deleted": True,
            "auth_warning": str(e),
            "user_id": user_id,
        }

    clear_cached("admin_inscrits")
    clear_cached("admin_dashboard")
    return {"ok": True, "deleted": True, "user_id": user_id}
