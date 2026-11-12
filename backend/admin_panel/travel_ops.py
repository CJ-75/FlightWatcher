"""Travel ops — séjour inventory freshness + partners health."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from admin_panel.cache import get_cached, set_cached


def _svc():
    from supabase_client import get_supabase_service_client

    return get_supabase_service_client()


def _parse_dt(val) -> Optional[datetime]:
    if not val:
        return None
    try:
        s = str(val).replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except Exception:
        return None


def sejours_inventory() -> Dict[str, Any]:
    cache_key = "sejours_inventory_v1"
    cached = get_cached(cache_key)
    if cached:
        return cached

    sb = _svc()
    now = datetime.now(timezone.utc)
    rows: List[Dict[str, Any]] = []
    try:
        res = (
            sb.table("deals_active")
            .select(
                "id,origin,destination,depart_date,return_date,updated_at,"
                "hotel_top3,price_total,weekend,nights"
            )
            .limit(800)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        return {"ok": False, "error": str(e)}

    fresh = 0
    stale = 0
    fri_sun = 0
    missing_hotel = 0
    by_origin: Dict[str, int] = {}
    by_dest: Dict[str, int] = {}

    for row in rows:
        origin = str(row.get("origin") or "?")
        dest = str(row.get("destination") or "?")
        by_origin[origin] = by_origin.get(origin, 0) + 1
        by_dest[dest] = by_dest.get(dest, 0) + 1
        updated = _parse_dt(row.get("updated_at"))
        age_h = (now - updated).total_seconds() / 3600 if updated else 999
        if age_h <= 36:
            fresh += 1
        else:
            stale += 1
        # Fri→Sun heuristic: nights==2 or weekend flag
        if row.get("weekend") or int(row.get("nights") or 0) == 2:
            fri_sun += 1
        top3 = row.get("hotel_top3")
        if not top3 or (isinstance(top3, list) and len(top3) == 0):
            missing_hotel += 1

    out = {
        "ok": True,
        "total": len(rows),
        "fresh": fresh,
        "stale": stale,
        "freshness_pct": round(100 * fresh / max(1, len(rows)), 1),
        "fri_sun_count": fri_sun,
        "fri_sun_pct": round(100 * fri_sun / max(1, len(rows)), 1),
        "missing_hotel": missing_hotel,
        "coverage_origins": len(by_origin),
        "coverage_destinations": len(by_dest),
        "top_origins": sorted(
            [{"code": k, "n": v} for k, v in by_origin.items()],
            key=lambda x: -x["n"],
        )[:15],
        "top_destinations": sorted(
            [{"code": k, "n": v} for k, v in by_dest.items()],
            key=lambda x: -x["n"],
        )[:15],
    }
    set_cached(cache_key, out, 35)
    return out


def partners_health() -> Dict[str, Any]:
    sb = _svc()
    partners = []

    # LiteAPI / hotel
    lite_ok = False
    lite_detail = ""
    try:
        from deals.metrics import collect_deals_metrics

        snap = collect_deals_metrics(sb)
        lite_ok = True
        lite_detail = "metrics ok"
        partners.append(
            {
                "id": "liteapi",
                "name": "LiteAPI hotels",
                "ok": True,
                "detail": lite_detail,
                "extra": {
                    "booking_funnel": (snap or {}).get("booking_funnel"),
                },
            }
        )
    except Exception as e:
        partners.append(
            {"id": "liteapi", "name": "LiteAPI hotels", "ok": False, "detail": str(e)}
        )

    # Flights / observations freshness
    try:
        res = (
            sb.table("deal_observations")
            .select("id,created_at")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        last = (res.data or [{}])[0].get("created_at")
        dt = _parse_dt(last)
        age_h = (datetime.now(timezone.utc) - dt).total_seconds() / 3600 if dt else None
        partners.append(
            {
                "id": "flight_obs",
                "name": "Flight observations",
                "ok": age_h is not None and age_h < 48,
                "detail": f"last {last}" if last else "no observations",
                "age_hours": round(age_h, 1) if age_h is not None else None,
            }
        )
    except Exception as e:
        partners.append(
            {"id": "flight_obs", "name": "Flight observations", "ok": False, "detail": str(e)}
        )

    # Booking fails
    fails = 0
    try:
        res = (
            sb.table("hotel_bookings")
            .select("id,status,created_at")
            .in_("status", ["failed", "error"])
            .limit(50)
            .execute()
        )
        fails = len(res.data or [])
    except Exception:
        fails = 0
    partners.append(
        {
            "id": "bookings",
            "name": "Hotel bookings",
            "ok": fails < 5,
            "detail": f"{fails} recent fails",
            "fails": fails,
        }
    )

    return {"ok": True, "partners": partners, "liteapi_reachable": lite_ok}


def booking_fails(limit: int = 50) -> Dict[str, Any]:
    sb = _svc()
    try:
        res = (
            sb.table("hotel_bookings")
            .select("id,status,user_id,created_at,error,provider,hotel_name")
            .in_("status", ["failed", "error", "cancelled"])
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"ok": True, "items": res.data or []}
    except Exception as e:
        return {"ok": False, "error": str(e), "items": []}
