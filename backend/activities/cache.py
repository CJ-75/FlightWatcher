"""provider_cache helpers — Lot A."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("activities.cache")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def cache_get(
    supabase,
    *,
    provider: str,
    resource: str,
    cache_key: str,
) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = (
            supabase.table("provider_cache")
            .select("*")
            .eq("provider", provider)
            .eq("resource", resource)
            .eq("cache_key", cache_key)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        row = res.data[0]
        exp = row.get("expires_at")
        if exp:
            try:
                exp_dt = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                if _now() > exp_dt:
                    return None
            except ValueError:
                pass
        return row.get("payload") if isinstance(row.get("payload"), dict) else row.get("payload")
    except Exception as e:
        logger.debug("cache_get: %s", e)
        return None


def cache_set(
    supabase,
    *,
    provider: str,
    resource: str,
    cache_key: str,
    payload: Any,
    ttl_h: float = 24,
    license_class: str = "basic_ephemeral",
) -> bool:
    if not supabase:
        return False
    now = _now()
    expires = now + timedelta(hours=float(ttl_h or 24))
    row = {
        "provider": provider,
        "resource": resource,
        "cache_key": str(cache_key)[:500],
        "payload": payload,
        "license_class": license_class,
        "fetched_at": now.isoformat(),
        "expires_at": expires.isoformat(),
    }
    try:
        supabase.table("provider_cache").upsert(
            row, on_conflict="provider,resource,cache_key"
        ).execute()
        return True
    except Exception as e:
        logger.warning("cache_set: %s", e)
        return False


def purge_expired(supabase) -> Dict[str, Any]:
    if not supabase:
        return {"ok": False, "deleted": 0}
    try:
        now = _now().isoformat()
        res = (
            supabase.table("provider_cache")
            .delete()
            .lt("expires_at", now)
            .execute()
        )
        n = len(res.data or [])
        return {"ok": True, "deleted": n}
    except Exception as e:
        logger.warning("purge_expired: %s", e)
        return {"ok": False, "deleted": 0, "error": str(e)}
