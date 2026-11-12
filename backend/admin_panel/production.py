"""Production status probes + store readiness config."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

_DEFAULT_STORE = {
    "id": "default",
    "min_ios_version": os.getenv("MIN_IOS_VERSION", "1.0.0"),
    "min_android_version": os.getenv("MIN_ANDROID_VERSION", "1.0.0"),
    "force_update": False,
    "feature_kills": {},
}


def _svc():
    from supabase_client import get_supabase_service_client

    return get_supabase_service_client()


def status_probe() -> Dict[str, Any]:
    """Fast status — one DB probe + env checks, cached 45s."""
    from admin_panel.cache import get_cached, set_cached

    cached = get_cached("status_probe_v2")
    if cached:
        return {**cached, "cached": True}

    checks = [{"id": "api", "ok": True, "detail": "up"}]
    try:
        sb = _svc()
        res = sb.table("deals_active").select("id").limit(1).execute()
        checks.append({"id": "supabase", "ok": True, "detail": "reachable"})
        checks.append(
            {
                "id": "deals_wall",
                "ok": bool(res.data),
                "detail": "has deals" if res.data else "empty wall",
            }
        )
    except Exception as e:
        checks.append({"id": "supabase", "ok": False, "detail": str(e)})
        checks.append({"id": "deals_wall", "ok": False, "detail": "skipped"})

    missing = [
        k
        for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        if not os.getenv(k)
    ]
    checks.append(
        {
            "id": "env",
            "ok": len(missing) == 0,
            "detail": "ok" if not missing else f"missing {', '.join(missing)}",
        }
    )

    overall = all(c["ok"] for c in checks)
    out = {
        "ok": overall,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
        "env": os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "unknown",
        "cached": False,
    }
    set_cached("status_probe_v2", out, 45)
    return out


def get_store_config() -> Dict[str, Any]:
    try:
        sb = _svc()
        res = sb.table("admin_store_config").select("*").eq("id", "default").limit(1).execute()
        if res.data:
            return {"ok": True, "config": res.data[0]}
    except Exception:
        pass
    return {"ok": True, "config": dict(_DEFAULT_STORE), "source": "default"}


def update_store_config(payload: Dict[str, Any], updated_by: Optional[str] = None) -> Dict[str, Any]:
    row = {
        "id": "default",
        "min_ios_version": payload.get("min_ios_version"),
        "min_android_version": payload.get("min_android_version"),
        "force_update": bool(payload.get("force_update", False)),
        "feature_kills": payload.get("feature_kills") or {},
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": updated_by,
    }
    try:
        sb = _svc()
        res = sb.table("admin_store_config").upsert(row).execute()
        return {"ok": True, "config": (res.data or [row])[0]}
    except Exception as e:
        return {"ok": False, "error": str(e), "config": row}


def store_readiness() -> Dict[str, Any]:
    cfg = get_store_config()["config"]
    checklist = [
        {
            "id": "min_version",
            "ok": bool(cfg.get("min_ios_version") and cfg.get("min_android_version")),
            "label": "Min versions set",
        },
        {
            "id": "force_update_flag",
            "ok": True,
            "label": "Force update flag",
            "value": bool(cfg.get("force_update")),
        },
        {
            "id": "privacy_policy",
            "ok": True,
            "label": "Privacy / ToS links (manual)",
            "hint": "Verify App Store / Play Console listings",
        },
        {
            "id": "crash_free",
            "ok": True,
            "label": "Crash-free (manual)",
            "hint": "Check Sentry / store vitals",
        },
    ]
    return {"ok": True, "config": cfg, "checklist": checklist}
