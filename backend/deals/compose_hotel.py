"""
L13 / D0 — compose a hotel offer for a city + dates.

Resolve arrival IATA / city name → served city → catalogue destination → upsell.
Display city name first; hotel shortlist is city-axis (not origin, not raw airport).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from deals.city_mapping import resolve_hotel_destination
from deals.upsell import lookup_upsell, start_upsell_fetch

logger = logging.getLogger("deals.compose_hotel")


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
    flight_pp: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Compose hotel for arrival city/dates.

    Returns:
      city_name, iata, status (ready|miss|pending|unavailable),
      hotel (optional), options, distance_m_to_center, job_id?
    """
    resolved = resolve_hotel_destination(supabase, iata=iata, city=city)
    if not resolved or not resolved.get("destination"):
        label = (city or iata or "").strip()
        return {
            "city_name": label,
            "iata": (iata or "").strip().upper() or None,
            "status": "unavailable",
            "reason": "not_in_catalogue" if (iata or city) else "unknown_city",
            "hotel": None,
            "served_city_id": (resolved or {}).get("served_city_id"),
        }

    dest = resolved["destination"]
    city_label = resolved.get("city_name") or dest.get("city_name") or ""
    lookup_iata = (
        resolved.get("primary_iata")
        or dest.get("iata_arrival")
        or (iata or "")
    ).upper()
    served_city_id = resolved.get("served_city_id") or dest.get("served_city_id")

    participants = max(1, int(adults or 2))
    looked = lookup_upsell(
        supabase,
        iata=lookup_iata,
        checkin=checkin,
        checkout=checkout,
        participants=participants,
        flight_pp=flight_pp,
    )
    status = looked.get("status") or "miss"
    hotel = looked.get("hotel")
    out: Dict[str, Any] = {
        "city_name": city_label,
        "iata": lookup_iata,
        "status": status,
        "hotel": hotel,
        "hotel_pp": looked.get("hotel_pp"),
        "options": looked.get("options") or ([hotel] if hotel else []),
        "max_hotel_pp": looked.get("max_hotel_pp"),
        "served_city_id": served_city_id,
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
        if started.get("options"):
            out["options"] = started["options"]

    return out
