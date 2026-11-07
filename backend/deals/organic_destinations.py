"""Ledger for on-demand (organic) destinations completed via user searches.

Seeded/top destinations stay in DESTINATIONS_SEED.
Organic rows are created when a user hits hotel upsell for an IATA outside
the catalogue: phase 1 inserts deal_destinations (coords optional), phase 2
bootstraps hotel_pool and infers center_lat/lng. Each subsequent search
bumps search_hits and retries completion if still partial/failed.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

logger = logging.getLogger("flightwatcher.deals.organic")

_SEED_IATAS: Optional[Set[str]] = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def seed_iata_set() -> Set[str]:
    global _SEED_IATAS
    if _SEED_IATAS is None:
        try:
            from deals.destinations_seed import DESTINATIONS_SEED

            _SEED_IATAS = {
                str(d.get("iata_arrival") or "").strip().upper()
                for d in DESTINATIONS_SEED
                if d.get("iata_arrival")
            }
        except Exception:
            _SEED_IATAS = set()
    return _SEED_IATAS


def is_seed_iata(iata: str) -> bool:
    code = (iata or "").strip().upper()
    return len(code) == 3 and code in seed_iata_set()


def _status_from(
    *,
    has_dest: bool,
    has_center: bool,
    pool_size: int,
    error: Optional[str] = None,
) -> str:
    if error and not has_dest:
        return "failed"
    if not has_dest:
        return "pending"
    if has_center and pool_size > 0:
        return "ready"
    if error:
        return "failed"
    if pool_size > 0 or has_center:
        return "partial"
    return "created"


def touch_organic_search(
    supabase: Any,
    *,
    iata: str,
    city_name: Optional[str] = None,
    country_code: Optional[str] = None,
    slug: Optional[str] = None,
    destination_id: Optional[str] = None,
    served_city_id: Optional[str] = None,
    has_center: Optional[bool] = None,
    pool_size: Optional[int] = None,
    error: Optional[str] = None,
    bootstrapped: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Upsert organic_destinations for this IATA and increment search_hits.
    No-op for curated seed IATAs. Safe if table missing (logs + returns None).
    """
    code = (iata or "").strip().upper()
    if len(code) != 3 or not supabase or is_seed_iata(code):
        return None

    now = _now()
    try:
        existing = (
            supabase.table("organic_destinations")
            .select("*")
            .eq("iata_arrival", code)
            .limit(1)
            .execute()
        )
        row = (existing.data or [None])[0]
    except Exception as e:
        logger.warning("organic_destinations select %s: %s", code, e)
        return None

    city = (city_name or (row or {}).get("city_name") or code).strip()
    country = (
        (country_code or (row or {}).get("country_code") or "")
        .strip()
        .upper()
    )
    dest_id = destination_id or (row or {}).get("destination_id")
    served_id = served_city_id or (row or {}).get("served_city_id")
    center = (
        bool(has_center)
        if has_center is not None
        else bool((row or {}).get("has_center"))
    )
    pool = (
        int(pool_size)
        if pool_size is not None
        else int((row or {}).get("pool_size") or 0)
    )
    status = _status_from(
        has_dest=bool(dest_id),
        has_center=center,
        pool_size=pool,
        error=error,
    )

    payload: Dict[str, Any] = {
        "iata_arrival": code,
        "city_name": city,
        "country_code": country,
        "slug": slug or (row or {}).get("slug"),
        "destination_id": dest_id,
        "served_city_id": served_id,
        "status": status,
        "has_center": center,
        "pool_size": pool,
        "search_hits": int((row or {}).get("search_hits") or 0) + 1,
        "last_searched_at": now,
        "updated_at": now,
        "last_error": (error or "")[:300] or None,
    }
    if bootstrapped:
        payload["last_bootstrap_at"] = now
    if not row:
        payload["created_at"] = now

    try:
        if row and row.get("id"):
            supabase.table("organic_destinations").update(payload).eq(
                "id", row["id"]
            ).execute()
            return {**row, **payload, "id": row["id"]}
        ins = supabase.table("organic_destinations").insert(payload).execute()
        return (ins.data or [payload])[0]
    except Exception as e:
        logger.warning("organic_destinations upsert %s: %s", code, e)
        return None


def sync_center_to_served_city(
    supabase: Any,
    *,
    served_city_id: Optional[str],
    center_lat: float,
    center_lng: float,
) -> None:
    """Fill served_cities centre when still null (organic completion)."""
    if not supabase or not served_city_id:
        return
    try:
        cur = (
            supabase.table("served_cities")
            .select("id, center_lat, center_lng")
            .eq("id", served_city_id)
            .limit(1)
            .execute()
        )
        row = (cur.data or [None])[0]
        if not row:
            return
        if row.get("center_lat") is not None and row.get("center_lng") is not None:
            return
        supabase.table("served_cities").update(
            {
                "center_lat": center_lat,
                "center_lng": center_lng,
                "updated_at": _now(),
            }
        ).eq("id", served_city_id).execute()
    except Exception as e:
        logger.warning("sync served_city center %s: %s", served_city_id, e)


def refresh_organic_from_dest(
    supabase: Any,
    *,
    iata: str,
    dest: Dict[str, Any],
    pool_size: int = 0,
    error: Optional[str] = None,
    bootstrapped: bool = False,
    bump_search: bool = False,
) -> Optional[Dict[str, Any]]:
    """Update ledger from a deal_destinations row (optionally bump search)."""
    code = (iata or "").strip().upper()
    if is_seed_iata(code):
        return None

    has_center = False
    try:
        if dest.get("center_lat") is not None and dest.get("center_lng") is not None:
            float(dest["center_lat"])
            float(dest["center_lng"])
            has_center = True
    except (TypeError, ValueError):
        has_center = False

    if bump_search:
        return touch_organic_search(
            supabase,
            iata=code,
            city_name=dest.get("city_name"),
            country_code=dest.get("country_code"),
            slug=dest.get("slug"),
            destination_id=str(dest["id"]) if dest.get("id") else None,
            served_city_id=dest.get("served_city_id"),
            has_center=has_center,
            pool_size=pool_size,
            error=error,
            bootstrapped=bootstrapped,
        )

    # Update without incrementing hits (internal bootstrap refresh)
    now = _now()
    status = _status_from(
        has_dest=bool(dest.get("id")),
        has_center=has_center,
        pool_size=pool_size,
        error=error,
    )
    patch: Dict[str, Any] = {
        "destination_id": str(dest["id"]) if dest.get("id") else None,
        "served_city_id": dest.get("served_city_id"),
        "city_name": dest.get("city_name") or code,
        "country_code": (dest.get("country_code") or "").upper(),
        "slug": dest.get("slug"),
        "status": status,
        "has_center": has_center,
        "pool_size": pool_size,
        "updated_at": now,
        "last_error": (error or "")[:300] or None,
    }
    if bootstrapped:
        patch["last_bootstrap_at"] = now
    try:
        supabase.table("organic_destinations").update(patch).eq(
            "iata_arrival", code
        ).execute()
    except Exception as e:
        logger.warning("organic refresh %s: %s", code, e)
    return patch
