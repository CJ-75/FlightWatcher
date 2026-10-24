"""
Hotel budget coherence vs flight price.

Rule: hotel_pp <= HOTEL_FLIGHT_RATIO * flight_pp
Among candidates under the cap, prefer best rating (then reviews), not cheapest.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

HOTEL_FLIGHT_RATIO = 2.5


def max_hotel_pp(flight_pp: Optional[float]) -> Optional[float]:
    try:
        fp = float(flight_pp) if flight_pp is not None else None
    except (TypeError, ValueError):
        return None
    if fp is None or fp <= 0:
        return None
    return round(fp * HOTEL_FLIGHT_RATIO, 2)


def hotel_pp_of(offer: Dict[str, Any], *, adults: int = 2) -> Optional[float]:
    """Per-person hotel share from public total (or hotel_pp if already set)."""
    if offer.get("hotel_pp") is not None:
        try:
            return float(offer["hotel_pp"])
        except (TypeError, ValueError):
            pass
    public = (
        offer.get("public_hotel_price")
        or offer.get("public_price")
        or offer.get("total")
        or offer.get("price")
    )
    if public is None:
        return None
    try:
        return round(float(public) / max(1, int(adults or 2)), 2)
    except (TypeError, ValueError):
        return None


def filter_hotels_for_flight(
    offers: Sequence[Dict[str, Any]],
    *,
    flight_pp: Optional[float],
    adults: int = 2,
    top_n: int = 8,
    require_photo: bool = True,
) -> List[Dict[str, Any]]:
    """
    Keep hotels under 2.5× flight_pp, with photo if required.
    Sort by rating desc, then review_count, then score — never by price alone.
    """
    cap = max_hotel_pp(flight_pp)
    out: List[Dict[str, Any]] = []
    for raw in offers or []:
        if not isinstance(raw, dict):
            continue
        h = dict(raw)
        photo = (
            h.get("photo")
            or h.get("thumbnail")
            or h.get("main_photo")
            or h.get("mainPhoto")
        )
        if require_photo and not (isinstance(photo, str) and photo.strip()):
            continue
        if photo:
            h["photo"] = str(photo).strip()
            h.setdefault("thumbnail", h["photo"])
        hpp = hotel_pp_of(h, adults=adults)
        if hpp is None:
            continue
        if cap is not None and hpp > cap:
            continue
        h["hotel_pp"] = hpp
        hid = h.get("hotel_id") or h.get("id") or ""
        h["id"] = str(hid)
        h["hotel_id"] = hid
        out.append(h)

    def _key(h: Dict[str, Any]):
        try:
            rating = float(h.get("rating") or 0)
        except (TypeError, ValueError):
            rating = 0.0
        try:
            reviews = int(h.get("review_count") or 0)
        except (TypeError, ValueError):
            reviews = 0
        try:
            score = float(h.get("score") or 0)
        except (TypeError, ValueError):
            score = 0.0
        return (rating, reviews, score)

    out.sort(key=_key, reverse=True)
    return out[: max(1, int(top_n or 8))]


def pick_best_hotel_for_flight(
    offers: Sequence[Dict[str, Any]],
    *,
    flight_pp: Optional[float],
    adults: int = 2,
) -> Optional[Dict[str, Any]]:
    ranked = filter_hotels_for_flight(
        offers, flight_pp=flight_pp, adults=adults, top_n=1, require_photo=True
    )
    return ranked[0] if ranked else None
