"""
Assemble community deals_active rows into TravelDeal-shaped dicts for the API.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _verified_today_label(last_verified_at: Any) -> Optional[str]:
    if not last_verified_at:
        return None
    try:
        dt = datetime.fromisoformat(str(last_verified_at).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if dt.date() == now.date():
            return "Prix vérifié aujourd'hui"
    except ValueError:
        return None
    return None


def badge_for_baseline(baseline: Dict[str, Any]) -> Dict[str, Any]:
    """
    Honest badge: flight-only vs usual price (30d).
    reliable → percent; estimated → soft label.
    """
    kind = baseline.get("baseline_kind") or "observed"
    disc = baseline.get("discount_pct")
    if kind == "estimated" or disc is None:
        return {
            "label": "Très bon prix",
            "discount_pct": None,
            "scope": "flight",
            "tooltip": (
                "Comparaison estimée au prix attendu sur ce type de trajet "
                "(historique encore limité sur FlightWatcher)."
            ),
        }
    return {
        "label": f"Vol −{int(round(float(disc)))} % moins cher que d'habitude",
        "discount_pct": float(disc),
        "scope": "flight",
        "tooltip": (
            "Par rapport au prix médian observé sur FlightWatcher pour ce trajet "
            "et cette période, sur les 30 derniers jours. Ce n'est pas une promo compagnie."
        ),
    }


def row_to_travel_deal(
    row: Dict[str, Any],
    *,
    adults: int = 2,
    baselines_fresh: bool = True,
) -> Dict[str, Any]:
    from deals.baseline_guard import soften_badge_if_stale

    flight = row.get("flight_snapshot") or {}
    baseline = row.get("baseline_snapshot") or {}
    hotels = row.get("hotel_top3") or []
    hotel = hotels[0] if hotels else None
    price_flight = float(flight.get("price_pp_eur") or 0)
    city = flight.get("city_name") or row.get("dest_iata") or ""
    badge = soften_badge_if_stale(
        badge_for_baseline(baseline), baselines_fresh=baselines_fresh
    )

    hotel_pp = None
    hotel_name = None
    hotel_stars = None
    if hotel and isinstance(hotel, dict):
        hotel_name = hotel.get("name") or hotel.get("hotel_name")
        hotel_stars = hotel.get("stars")
        # public total / adults if present
        public = hotel.get("public_price") or hotel.get("total") or hotel.get("price")
        if public is not None:
            try:
                hotel_pp = round(float(public) / max(1, adults), 2)
            except (TypeError, ValueError):
                hotel_pp = None

    price_pp = price_flight
    if hotel_pp is not None:
        price_pp = round(price_flight + hotel_pp, 2)

    out_date = str(row.get("out_date") or "")[:10]
    ret_date = str(row.get("ret_date") or "")[:10]
    verified = _verified_today_label(row.get("last_verified_at"))

    return {
        "id": row.get("deal_key"),
        "deal_key": row.get("deal_key"),
        "title": f"Week-end à {city}" if city else "Deal",
        "city": city,
        "country": "",
        "image_url": "",  # city image resolved client-side
        "price_per_person": price_pp,
        "currency": "EUR",
        "nights": int(row.get("nights") or 2),
        "departure_airport": row.get("origin_iata"),
        "origin_iata": row.get("origin_iata"),
        "destination": row.get("dest_iata"),
        "dates": {"outbound": out_date, "inbound": ret_date},
        "hotel_name": hotel_name,
        "hotel_stars": hotel_stars,
        "provider": "community",
        "booking_url": flight.get("booking_url") or "",
        "badge": badge.get("label"),
        "badge_meta": badge,
        "adults": adults,
        "flight": {
            "price_pp": price_flight,
            "provider": flight.get("provider"),
            "carrier": flight.get("carrier"),
            "booking_url": flight.get("booking_url"),
            "direct": flight.get("direct", True),
            "out_dep_local": flight.get("out_dep_local"),
            "ret_dep_local": flight.get("ret_dep_local"),
        },
        "hotel": hotel,
        "alt_hotels": hotels[1:3] if hotels else [],
        "price_breakdown": {
            "flight_pp": price_flight,
            "hotel_pp": hotel_pp,
            "total_pp": price_pp,
        },
        "flags": {
            "has_hotel": bool(hotel),
            "source_mix": row.get("source_mix"),
            "verified_label": verified,
        },
        "deal_score": row.get("deal_score"),
        "fetched_at": row.get("last_verified_at"),
        "served_city_id": row.get("served_city_id"),
    }


def _baselines_fresh_flag(supabase) -> bool:
    try:
        from deals.baseline_guard import baselines_freshness, log_stale_alert
        from deals.liteapi_config import load_deals_config

        cfg = load_deals_config()
        fresh, last, reason = baselines_freshness(
            supabase, max_age_h=cfg.baseline_max_age_h
        )
        if not fresh:
            log_stale_alert(last, reason)
        return fresh
    except Exception:
        return True


def _parse_origin_codes(origin: Optional[str]) -> List[str]:
    """Accept 'BVA' or 'CDG,ORY,BVA' (city multi-airport)."""
    if not origin:
        return []
    import re

    parts = re.split(r"[,;|/\s]+", origin.strip().upper())
    out: List[str] = []
    for p in parts:
        code = p.strip()
        if len(code) == 3 and code.isalpha() and code not in out:
            out.append(code)
    return out


def list_community_deals(
    supabase,
    *,
    origin: Optional[str] = None,
    adults: Optional[int] = None,
    max_pp: Optional[float] = None,
    limit: int = 40,
) -> List[Dict[str, Any]]:
    q = (
        supabase.table("deals_active")
        .select("*")
        .eq("status", "active")
        .order("deal_score", desc=True)
        .limit(limit * 2 if origin else limit)
    )
    codes = _parse_origin_codes(origin)
    if len(codes) == 1:
        q = q.eq("origin_iata", codes[0])
    elif len(codes) > 1:
        q = q.in_("origin_iata", codes)
    try:
        res = q.execute()
    except Exception:
        return []
    adults_n = int(adults or 2)
    fresh = _baselines_fresh_flag(supabase)
    deals = []
    for row in res.data or []:
        d = row_to_travel_deal(row, adults=adults_n, baselines_fresh=fresh)
        if max_pp is not None and float(d.get("price_per_person") or 0) > float(max_pp):
            continue
        deals.append(d)
        if len(deals) >= limit:
            break
    return deals


def get_community_deal(supabase, deal_key: str) -> Optional[Dict[str, Any]]:
    try:
        res = (
            supabase.table("deals_active")
            .select("*")
            .eq("deal_key", deal_key)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        fresh = _baselines_fresh_flag(supabase)
        return row_to_travel_deal(res.data[0], baselines_fresh=fresh)
    except Exception:
        return None
