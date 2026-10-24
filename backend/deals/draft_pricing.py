"""
Trusted draft pricing — never trust client price_per_person / hotel totals.

Client may send references: deal_key, hotelId, dates, adults.
Server rebuilds amounts from deals_active / rates cache.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from deals.pricing import price_per_person

logger = logging.getLogger("deals.draft_pricing")


def _hotel_id(hotel: Optional[Dict[str, Any]]) -> Optional[str]:
    if not hotel or not isinstance(hotel, dict):
        return None
    hid = hotel.get("id") or hotel.get("hotel_id") or hotel.get("hotelId")
    if hid is None:
        return None
    s = str(hid).strip()
    return s if s and s != "primary" else None


def _as_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _flight_pp_from_deal(deal: Dict[str, Any]) -> float:
    bd = deal.get("price_breakdown") or {}
    v = _as_float(bd.get("flight_pp"))
    if v is not None and v > 0:
        return v
    flight = deal.get("flight") or {}
    v = _as_float(flight.get("price_pp"))
    return float(v or 0)


def _hotel_public_total(hotel: Dict[str, Any], adults: int) -> Optional[float]:
    pub = _as_float(
        hotel.get("public_hotel_price")
        or hotel.get("public_price")
        or hotel.get("hotel_public_total")
    )
    if pub is not None and pub > 0:
        return pub
    hpp = _as_float(hotel.get("hotel_pp"))
    if hpp is not None and hpp > 0:
        return round(hpp * max(1, adults), 2)
    return None


def _match_hotel_in_list(
    hotels: list, hotel_id: str
) -> Optional[Dict[str, Any]]:
    for h in hotels:
        if not isinstance(h, dict):
            continue
        if _hotel_id(h) == hotel_id:
            return h
    return None


def _hotels_from_deal(deal: Dict[str, Any]) -> list:
    out = []
    if deal.get("hotel"):
        out.append(deal["hotel"])
    for h in deal.get("alt_hotels") or []:
        out.append(h)
    return out


def _resolve_hotel_from_rates(
    supabase,
    *,
    hotel_id: str,
    iata: str,
    checkin: str,
    checkout: str,
    adults: int,
    flight_pp: Optional[float],
) -> Optional[Dict[str, Any]]:
    if not supabase or not hotel_id or not iata or not checkin or not checkout:
        return None
    try:
        from deals.upsell import lookup_upsell

        looked = lookup_upsell(
            supabase,
            iata=iata,
            checkin=checkin[:10],
            checkout=checkout[:10],
            participants=adults,
            flight_pp=flight_pp,
        )
    except Exception as e:
        logger.warning("draft hotel rates lookup: %s", e)
        return None
    if looked.get("status") != "ready":
        return None
    options = list(looked.get("options") or [])
    if looked.get("hotel"):
        options = [looked["hotel"], *options]
    return _match_hotel_in_list(options, hotel_id)


def _load_deal(supabase, deal_key: Optional[str]) -> Optional[Dict[str, Any]]:
    if not deal_key or not supabase:
        return None
    try:
        from deals.provider import get_deal_provider

        return get_deal_provider().get_deal(str(deal_key))
    except Exception as e:
        logger.warning("draft load deal %s: %s", deal_key, e)
        return None


def resolve_trusted_hotel(
    supabase,
    *,
    hotel_ref: Optional[Dict[str, Any]],
    deal: Optional[Dict[str, Any]],
    dest_iata: str,
    checkin: str,
    checkout: str,
    adults: int,
    flight_pp: float,
) -> Optional[Dict[str, Any]]:
    """Resolve hotel offer from deal candidates or rates cache (never client totals)."""
    hid = _hotel_id(hotel_ref)
    if deal:
        candidates = _hotels_from_deal(deal)
        if hid:
            matched = _match_hotel_in_list(candidates, hid)
            if matched and _hotel_public_total(matched, adults) is not None:
                return matched
        elif deal.get("hotel") and _hotel_public_total(deal["hotel"], adults) is not None:
            return deal["hotel"]

    if hid:
        from_rates = _resolve_hotel_from_rates(
            supabase,
            hotel_id=hid,
            iata=dest_iata,
            checkin=checkin,
            checkout=checkout,
            adults=adults,
            flight_pp=flight_pp or None,
        )
        if from_rates:
            return from_rates

    # Last resort: deal primary hotel already server-built
    if deal and deal.get("hotel"):
        return deal["hotel"]
    return None


def trust_create_payload(supabase, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Rebuild draft payload prices from server sources.
    Drops client price_per_person; replaces hotel/flight money when possible.
    """
    out = dict(payload or {})
    adults = max(1, min(6, int(out.get("adults") or 2)))
    out["adults"] = adults
    dates = dict(out.get("dates") or {})
    checkin = str(dates.get("outbound") or "")[:10]
    checkout = str(dates.get("inbound") or "")[:10]
    deal_key = out.get("deal_key")
    deal = _load_deal(supabase, deal_key)

    flight_pp = 0.0
    trusted_flight = dict(out.get("flight") or {})

    if deal:
        # Prefer server deal geometry
        out["deal_key"] = deal.get("deal_key") or deal_key
        out["origin_iata"] = deal.get("origin_iata") or out.get("origin_iata")
        out["destination"] = deal.get("destination") or out.get("destination")
        out["city"] = deal.get("city") or out.get("city")
        if deal.get("dates"):
            dates = {
                "outbound": str(deal["dates"].get("outbound") or checkin)[:10],
                "inbound": str(deal["dates"].get("inbound") or checkout)[:10],
            }
            checkin, checkout = dates["outbound"], dates["inbound"]
            out["dates"] = dates
        flight_pp = _flight_pp_from_deal(deal)
        if deal.get("flight"):
            trusted_flight = {**trusted_flight, **deal["flight"]}
        trusted_flight["price_pp"] = flight_pp
        if deal.get("booking_url") and not out.get("booking_url"):
            out["booking_url"] = deal["booking_url"]
        if deal.get("baggage_line"):
            out["baggage_line"] = deal["baggage_line"]
        if deal.get("route_hint"):
            out["route_hint"] = deal["route_hint"]
        if deal.get("price_pax_note"):
            out["price_pax_note"] = deal["price_pax_note"]
    else:
        # Wizard / search path: flight quote not in deals_active.
        # Keep itinerary metadata; do not invent a trusted flight_pp from client.
        # Hotel still resolved from rates; pack price = flight_pp(client quote locked
        # only when we cannot revalidate — marked untrusted_flight).
        quoted = _as_float((out.get("flight") or {}).get("price_pp"))
        flight_pp = float(quoted or 0)
        trusted_flight["price_pp"] = flight_pp
        out["price_trust"] = "flight_quoted_unverified"

    dest = str(
        out.get("destination")
        or trusted_flight.get("destination_iata")
        or ""
    ).upper()

    hotel = resolve_trusted_hotel(
        supabase,
        hotel_ref=out.get("hotel"),
        deal=deal,
        dest_iata=dest,
        checkin=checkin,
        checkout=checkout,
        adults=adults,
        flight_pp=flight_pp,
    )

    hotel_total = _hotel_public_total(hotel, adults) if hotel else None
    if hotel and hotel_total is not None:
        hotel = {
            **hotel,
            "id": _hotel_id(hotel) or hotel.get("id"),
            "public_hotel_price": hotel_total,
            "hotel_pp": round(hotel_total / adults, 2),
        }
        out["hotel"] = hotel
    elif "hotel" in out and not hotel:
        # Client sent a hotel we cannot verify — drop money fields
        raw = dict(out.get("hotel") or {})
        for k in ("public_hotel_price", "public_price", "hotel_pp", "price", "total"):
            raw.pop(k, None)
        out["hotel"] = raw or None
        hotel_total = None

    pp = round(price_per_person(flight_pp, float(hotel_total or 0), adults), 2)
    out["flight"] = trusted_flight
    out["price_per_person"] = pp
    out["price_breakdown"] = {
        "flight_pp": round(flight_pp, 2),
        "hotel_public_total": float(hotel_total or 0),
        "hotel_pp": round(float(hotel_total or 0) / adults, 2) if hotel_total else None,
        "total_pp": pp,
    }
    if deal and out.get("price_trust") != "flight_quoted_unverified":
        out["price_trust"] = "server"
    return out


def trust_hotel_patch(
    supabase,
    row: Dict[str, Any],
    hotel_ref: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Rebuild payload after hotel switch — ignores client price_per_person."""
    payload = dict(row.get("payload") or {})
    adults = max(1, min(6, int(row.get("adults") or payload.get("adults") or 2)))
    dates = payload.get("dates") or {}
    checkin = str(row.get("out_date") or dates.get("outbound") or "")[:10]
    checkout = str(row.get("ret_date") or dates.get("inbound") or "")[:10]
    dest = str(
        row.get("dest_iata")
        or payload.get("destination")
        or (payload.get("flight") or {}).get("destination_iata")
        or ""
    ).upper()
    deal_key = row.get("deal_key") or payload.get("deal_key")
    deal = _load_deal(supabase, deal_key)

    flight = dict(payload.get("flight") or {})
    if deal:
        flight_pp = _flight_pp_from_deal(deal)
        if deal.get("flight"):
            flight = {**flight, **deal["flight"]}
        flight["price_pp"] = flight_pp
    else:
        flight_pp = float(_as_float(flight.get("price_pp")) or 0)

    hotel = resolve_trusted_hotel(
        supabase,
        hotel_ref=hotel_ref,
        deal=deal,
        dest_iata=dest,
        checkin=checkin,
        checkout=checkout,
        adults=adults,
        flight_pp=flight_pp,
    )
    if not hotel:
        raise ValueError("hotel_unverified")

    hotel_total = _hotel_public_total(hotel, adults)
    if hotel_total is None:
        raise ValueError("hotel_price_missing")

    hotel = {
        **hotel,
        "id": _hotel_id(hotel) or hotel.get("id"),
        "public_hotel_price": hotel_total,
        "hotel_pp": round(hotel_total / adults, 2),
    }
    pp = round(price_per_person(flight_pp, hotel_total, adults), 2)
    payload.update(
        {
            "flight": flight,
            "hotel": hotel,
            "price_per_person": pp,
            "price_breakdown": {
                "flight_pp": round(flight_pp, 2),
                "hotel_public_total": hotel_total,
                "hotel_pp": round(hotel_total / adults, 2),
                "total_pp": pp,
            },
            "price_trust": "server" if deal else payload.get("price_trust") or "hotel_server",
            "compose_hotel": False,
        }
    )
    return payload
