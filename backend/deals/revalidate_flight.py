"""
Lot D3 — revalidate live flight price with requested passenger count.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from deals.verification import LEVEL_LIVE

logger = logging.getLogger("deals.revalidate_flight")


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

    from api_models import DateAvecHoraire
    from providers.orchestrator import search_roundtrips

    try:
        trips, _ = search_roundtrips(
            aeroport_depart=origin,
            dates_depart=[DateAvecHoraire(date=out_d)],
            dates_retour=[DateAvecHoraire(date=ret_d)],
            budget_max=int(max(displayed * 2, 200)),
            limite_allers=20,
            destinations_incluses=[dest],
            record_prices=False,
            passengers=adults,
            direct=True,
        )
        match = [
            t
            for t in trips
            if (getattr(t, "destination_code", None) or "").upper()
            == (dest or "").upper()
        ]
        if not match:
            return {
                "ok": True,
                "verification_level": vlevel,
                "revalidated": True,
                "available": False,
                "displayed_pp": displayed,
                "checked_pp": None,
                "adults": adults,
            }
        best = min(match, key=lambda t: float(getattr(t, "prix_total", 9999)))
        # prix_total is already per-person for Ryanair adultPaxCount scans
        checked = float(best.prix_total)
        return {
            "ok": True,
            "verification_level": vlevel,
            "revalidated": True,
            "available": True,
            "displayed_pp": displayed,
            "checked_pp": round(checked, 2),
            "adults": adults,
            "booking_url": getattr(best, "booking_url", None) or snap.get("booking_url"),
            "delta_pct": round((checked - displayed) / displayed * 100, 1)
            if displayed > 0
            else None,
        }
    except Exception as e:
        logger.warning("revalidate_flight %s: %s", deal_key, e)
        return {"ok": False, "error": str(e), "displayed_pp": displayed, "adults": adults}
