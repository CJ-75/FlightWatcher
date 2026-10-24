"""
L13 / D0 — compose a hotel offer for a city + dates.

Minimal stub: resolve city name / IATA → catalogue destination → reuse upsell
(lookup cache, else start fetch). Display city name first; details after ready.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from deals.city_mapping import city_name_for_iata, resolve_served_city
from deals.upsell import find_destination_by_iata, lookup_upsell, start_upsell_fetch

logger = logging.getLogger("deals.compose_hotel")


def _iata_from_input(supabase, *, iata: Optional[str], city: Optional[str]) -> Optional[str]:
    code = (iata or "").strip().upper()
    if len(code) == 3:
        return code
    name = (city or "").strip()
    if not name or not supabase:
        return None
    try:
        res = (
            supabase.table("served_cities")
            .select("primary_iata, city_name")
            .ilike("city_name", name)
            .limit(1)
            .execute()
        )
        if res.data and res.data[0].get("primary_iata"):
            return str(res.data[0]["primary_iata"]).upper()
    except Exception as e:
        logger.warning("compose_hotel city lookup %s: %s", name, e)
    # Fallback: deal_destinations
    try:
        res = (
            supabase.table("deal_destinations")
            .select("iata_arrival, city_name")
            .ilike("city_name", name)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        if res.data and res.data[0].get("iata_arrival"):
            return str(res.data[0]["iata_arrival"]).upper()
    except Exception:
        pass
    return None


def compose_hotel(
    supabase,
    *,
    checkin: str,
    checkout: str,
    iata: Optional[str] = None,
    city: Optional[str] = None,
    adults: int = 2,
    fetch_if_miss: bool = False,
    rate_bucket: str = "compose",
) -> Dict[str, Any]:
    """
    Compose hotel for city/dates.

    Returns:
      city_name, iata, status (ready|miss|pending|unavailable),
      hotel (optional), distance_m_to_center (only if known), job_id?
    """
    code = _iata_from_input(supabase, iata=iata, city=city)
    city_label = city_name_for_iata(supabase, code or "", fallback=city or code or "")

    if not code:
        return {
            "city_name": city_label or (city or ""),
            "iata": None,
            "status": "unavailable",
            "reason": "unknown_city",
            "hotel": None,
        }

    served = resolve_served_city(supabase, code)
    if served:
        city_label = served.get("city_name") or city_label
        # Prefer primary IATA for hotel pool (catalogue often keyed on one airport)
        primary = (served.get("primary_iata") or code).upper()
        dest = find_destination_by_iata(supabase, primary) or find_destination_by_iata(
            supabase, code
        )
        lookup_iata = primary if dest else code
    else:
        lookup_iata = code
        dest = find_destination_by_iata(supabase, code)

    if not dest:
        return {
            "city_name": city_label,
            "iata": code,
            "status": "unavailable",
            "reason": "not_in_catalogue",
            "hotel": None,
            "served_city_id": served.get("served_city_id") if served else None,
        }

    participants = max(1, int(adults or 2))
    looked = lookup_upsell(
        supabase,
        iata=lookup_iata,
        checkin=checkin,
        checkout=checkout,
        participants=participants,
    )
    status = looked.get("status") or "miss"
    hotel = looked.get("hotel")
    out: Dict[str, Any] = {
        "city_name": city_label,
        "iata": lookup_iata,
        "status": status,
        "hotel": hotel,
        "hotel_pp": looked.get("hotel_pp"),
        "served_city_id": served.get("served_city_id") if served else dest.get("id"),
        "destination_id": dest.get("id"),
        "distance_m_to_center": None,
    }
    if hotel and isinstance(hotel, dict):
        dist = hotel.get("distance_m")
        if dist is not None:
            try:
                out["distance_m_to_center"] = int(dist)
            except (TypeError, ValueError):
                pass

    if status in ("miss", "pending") and fetch_if_miss and status != "pending":
        started = start_upsell_fetch(
            supabase,
            iata=lookup_iata,
            checkin=checkin,
            checkout=checkout,
            participants=participants,
            rate_bucket=rate_bucket,
        )
        out["status"] = started.get("status") or "pending"
        out["job_id"] = started.get("job_id")
        if started.get("hotel"):
            out["hotel"] = started["hotel"]
            out["hotel_pp"] = started.get("hotel_pp")

    return out
