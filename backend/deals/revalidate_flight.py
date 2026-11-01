"""
Lot D3 — revalidate live flight price with requested passenger count.
Also soft-refresh Mon voyage drafts (Bookings / TripSummary).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from deals.verification import LEVEL_LIVE

logger = logging.getLogger("deals.revalidate_flight")


def _live_roundtrip_price(
    *,
    origin: str,
    dest: str,
    out_d: str,
    ret_d: str,
    adults: int,
    displayed: float,
    prefer_airline: Optional[str] = None,
) -> Dict[str, Any]:
    """Shared Ryanair-capable live scan. Returns available / checked_pp / trip bits."""
    from api_models import DateAvecHoraire
    from providers.orchestrator import search_roundtrips
    from providers.ryanair_budget import PURPOSE_CLICK

    trips, _ = search_roundtrips(
        aeroport_depart=origin,
        dates_depart=[DateAvecHoraire(date=out_d)],
        dates_retour=[DateAvecHoraire(date=ret_d)],
        budget_max=int(max(float(displayed or 0) * 2.5, 250)),
        limite_allers=20,
        destinations_incluses=[dest],
        record_prices=False,
        passengers=adults,
        direct=True,
        ryanair_purpose=PURPOSE_CLICK,
    )
    match = [
        t
        for t in trips
        if (getattr(t, "destination_code", None) or "").upper() == (dest or "").upper()
    ]
    if not match:
        return {"available": False, "checked_pp": None, "trip": None}

    prefer = (prefer_airline or "").strip().upper()
    if prefer in ("FR", "RK", "RYANAIR"):
        same = [
            t
            for t in match
            if str(getattr(t, "airline", "") or getattr(t, "provider", "") or "")
            .upper()
            .startswith(("FR", "RK", "RYANAIR"))
        ]
        if same:
            match = same

    best = min(match, key=lambda t: float(getattr(t, "prix_total", 9999)))
    checked = float(best.prix_total)
    aller = getattr(best, "aller", None)
    retour = getattr(best, "retour", None)
    return {
        "available": True,
        "checked_pp": round(checked, 2),
        "booking_url": getattr(best, "booking_url", None),
        "airline": getattr(best, "airline", None),
        "provider": getattr(best, "provider", None),
        "outbound_local": getattr(aller, "departureTime", None) if aller else None,
        "inbound_local": getattr(retour, "departureTime", None) if retour else None,
        "trip": best,
    }


def revalidate_flight_for_passengers(
    supabase,
    deal_key: str,
    *,
    adults: int = 2,
) -> Dict[str, Any]:
    """
    For verification_level=live deals: rescan Ryanair-capable path with N passengers.
    Returns displayed vs checked price_pp.
    """
    adults = max(1, min(6, int(adults or 2)))
    try:
        res = (
            supabase.table("deals_active")
            .select("*")
            .eq("deal_key", deal_key)
            .limit(1)
            .execute()
        )
    except Exception as e:
        return {"ok": False, "error": str(e)}
    if not res.data:
        return {"ok": False, "error": "deal_not_found"}
    row = res.data[0]
    vlevel = row.get("verification_level") or LEVEL_LIVE
    snap = row.get("flight_snapshot") or {}
    displayed = float(snap.get("price_pp_eur") or 0)
    origin = row.get("origin_iata")
    dest = row.get("dest_iata")
    out_d = str(row.get("out_date") or "")[:10]
    ret_d = str(row.get("ret_date") or "")[:10]

    if vlevel != LEVEL_LIVE:
        return {
            "ok": True,
            "verification_level": vlevel,
            "revalidated": False,
            "reason": "cached_skip",
            "displayed_pp": displayed,
            "checked_pp": displayed,
            "adults": adults,
            "price_note": "Prix pour 1–2 voyageurs"
            if adults > 2
            else None,
        }

    if adults <= 2:
        return {
            "ok": True,
            "verification_level": vlevel,
            "revalidated": False,
            "reason": "adults_le_2",
            "displayed_pp": displayed,
            "checked_pp": displayed,
            "adults": adults,
        }

    try:
        live = _live_roundtrip_price(
            origin=str(origin or "").upper(),
            dest=str(dest or "").upper(),
            out_d=out_d,
            ret_d=ret_d,
            adults=adults,
            displayed=displayed,
        )
        if not live.get("available"):
            return {
                "ok": True,
                "verification_level": vlevel,
                "revalidated": True,
                "available": False,
                "displayed_pp": displayed,
                "checked_pp": None,
                "adults": adults,
            }
        checked = float(live["checked_pp"])
        return {
            "ok": True,
            "verification_level": vlevel,
            "revalidated": True,
            "available": True,
            "displayed_pp": displayed,
            "checked_pp": checked,
            "adults": adults,
            "booking_url": live.get("booking_url") or snap.get("booking_url"),
            "delta_pct": round((checked - displayed) / displayed * 100, 1)
            if displayed > 0
            else None,
        }
    except Exception as e:
        logger.warning("revalidate_flight %s: %s", deal_key, e)
        return {"ok": False, "error": str(e), "displayed_pp": displayed, "adults": adults}


def revalidate_my_trip_flight(supabase, draft_token: str) -> Dict[str, Any]:
    """
    Soft live refresh for Mon voyage: update payload.flight.price_pp (+ times)
    whenever O/D + dates are known. Used from Bookings / TripSummary.
    """
    from deals.draft_pricing import _as_float, _hotel_public_total
    from deals.my_trips import apply_flight_price_refresh, get_draft
    from deals.pricing import price_per_person

    row = get_draft(supabase, draft_token)
    if not row:
        return {"ok": False, "error": "not_found"}

    payload = dict(row.get("payload") or {})
    flight = dict(payload.get("flight") or {})
    if payload.get("flight_external") or payload.get("external_flight"):
        return {
            "ok": True,
            "revalidated": False,
            "reason": "external",
            "displayed_pp": _as_float(flight.get("price_pp")),
        }
    if row.get("flight_booked_at") or payload.get("flight_booked") or payload.get(
        "flight_booked_at"
    ):
        return {
            "ok": True,
            "revalidated": False,
            "reason": "booked",
            "displayed_pp": _as_float(flight.get("price_pp")),
        }

    origin = str(
        row.get("origin_iata")
        or flight.get("origin_iata")
        or payload.get("origin_iata")
        or payload.get("departure_airport")
        or ""
    ).upper()
    dest = str(
        row.get("dest_iata")
        or flight.get("destination_iata")
        or payload.get("destination")
        or payload.get("destination_iata")
        or ""
    ).upper()
    dates = payload.get("dates") or {}
    out_d = str(row.get("out_date") or dates.get("outbound") or "")[:10]
    ret_d = str(row.get("ret_date") or dates.get("inbound") or "")[:10]
    adults = max(1, min(6, int(row.get("adults") or payload.get("adults") or 2)))
    displayed = float(_as_float(flight.get("price_pp")) or 0)

    if not (origin and dest and out_d and ret_d):
        return {
            "ok": False,
            "error": "missing_route",
            "displayed_pp": displayed,
            "adults": adults,
        }

    try:
        live = _live_roundtrip_price(
            origin=origin,
            dest=dest,
            out_d=out_d,
            ret_d=ret_d,
            adults=adults,
            displayed=displayed or 80,
            prefer_airline=str(flight.get("airline") or flight.get("carrier") or ""),
        )
    except Exception as e:
        logger.warning("revalidate_my_trip_flight %s: %s", draft_token, e)
        return {"ok": False, "error": str(e), "displayed_pp": displayed, "adults": adults}

    if not live.get("available") or live.get("checked_pp") is None:
        return {
            "ok": True,
            "revalidated": True,
            "available": False,
            "displayed_pp": displayed,
            "checked_pp": None,
            "adults": adults,
            "draft": row,
        }

    checked = float(live["checked_pp"])
    hotel = payload.get("hotel") if isinstance(payload.get("hotel"), dict) else None
    # Prefer paid/locked hotel total so /pers stay consistent after booking
    hotel_total = None
    try:
        locked = payload.get("hotel_charged_total")
        if locked is not None and float(locked) > 0:
            hotel_total = float(locked)
    except (TypeError, ValueError):
        hotel_total = None
    if hotel_total is None and hotel:
        hotel_total = _hotel_public_total(hotel, adults)
    pp = (
        round(price_per_person(checked, float(hotel_total or 0), adults), 2)
        if hotel_total is not None
        else round(checked, 2)
    )

    updated = apply_flight_price_refresh(
        supabase,
        draft_token,
        price_pp=checked,
        airline=live.get("airline") or flight.get("airline"),
        provider=live.get("provider") or flight.get("provider"),
        booking_url=live.get("booking_url") or flight.get("booking_url"),
        outbound_local=live.get("outbound_local") or flight.get("outbound_local"),
        inbound_local=live.get("inbound_local") or flight.get("inbound_local"),
        origin_iata=origin,
        destination_iata=dest,
        price_per_person=pp,
        hotel_total=hotel_total,
        adults=adults,
    )

    delta = (
        round((checked - displayed) / displayed * 100, 1) if displayed > 0 else None
    )
    return {
        "ok": True,
        "revalidated": True,
        "available": True,
        "displayed_pp": displayed,
        "checked_pp": checked,
        "delta_pct": delta,
        "adults": adults,
        "booking_url": live.get("booking_url"),
        "draft": updated or row,
    }
