"""
Hotel targeting relative to the city pool (per night), not flight price.

Tiers from the distribution of night prices among candidates:
  eco     → ≤ p33
  confort → ≤ median (p50)  — default
  charme  → ≤ p67

Ranking (default): best value = bayesian_rating / night_price
Optional: sort by bayesian rating only.
"""
from __future__ import annotations

import math
import statistics
from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional, Sequence, Tuple

HotelTier = Literal["eco", "confort", "charme"]
HotelSort = Literal["value", "rating"]

DEFAULT_TIER: HotelTier = "confort"
# Bayesian prior: pull sparse ratings toward global mean
BAYES_PRIOR_MEAN = 8.0
BAYES_PRIOR_WEIGHT = 25.0  # equivalent reviews


def _parse_ymd(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def nights_between(checkin: Optional[str], checkout: Optional[str]) -> int:
    a = _parse_ymd(checkin)
    b = _parse_ymd(checkout)
    if not a or not b or b <= a:
        return 2
    return max(1, (b - a).days)


def hotel_public_total(offer: Dict[str, Any]) -> Optional[float]:
    public = (
        offer.get("public_hotel_price")
        or offer.get("public_price")
        or offer.get("total")
        or offer.get("price")
    )
    if public is None:
        return None
    try:
        v = float(public)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def hotel_pp_of(offer: Dict[str, Any], *, adults: int = 2) -> Optional[float]:
    if offer.get("hotel_pp") is not None:
        try:
            return float(offer["hotel_pp"])
        except (TypeError, ValueError):
            pass
    total = hotel_public_total(offer)
    if total is None:
        return None
    return round(total / max(1, int(adults or 2)), 2)


def night_price(
    offer: Dict[str, Any],
    *,
    nights: int = 2,
) -> Optional[float]:
    """Room total / nights (not per person)."""
    total = hotel_public_total(offer)
    if total is None:
        return None
    return round(total / max(1, int(nights or 2)), 2)


def bayesian_rating(
    rating: Optional[float],
    review_count: Optional[int],
    *,
    prior_mean: float = BAYES_PRIOR_MEAN,
    prior_weight: float = BAYES_PRIOR_WEIGHT,
) -> float:
    try:
        r = float(rating or 0)
    except (TypeError, ValueError):
        r = 0.0
    try:
        n = max(0, int(review_count or 0))
    except (TypeError, ValueError):
        n = 0
    if r <= 0 and n <= 0:
        return prior_mean * 0.5
    return (prior_weight * prior_mean + n * r) / (prior_weight + n)


def _percentile(sorted_vals: List[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals) - 1) * p
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)


def tier_night_cap(
    night_prices: Sequence[float],
    tier: HotelTier = DEFAULT_TIER,
) -> Optional[float]:
    vals = sorted(float(x) for x in night_prices if x and x > 0)
    if not vals:
        return None
    if tier == "eco":
        return round(_percentile(vals, 0.33), 2)
    if tier == "charme":
        return round(_percentile(vals, 0.67), 2)
    # confort = median
    return round(statistics.median(vals), 2)


def value_score(bayes: float, night: float) -> float:
    """Higher is better: quality per euro-night."""
    if night <= 0:
        return 0.0
    return bayes / night


def filter_hotels_for_city(
    offers: Sequence[Dict[str, Any]],
    *,
    adults: int = 2,
    nights: int = 2,
    tier: HotelTier = DEFAULT_TIER,
    sort: HotelSort = "value",
    top_n: int = 8,
    require_photo: bool = True,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Filter by city-relative night price tier, rank by value or bayesian rating.
    Returns (ranked hotels, meta with caps / tier).
    """
    nights = max(1, int(nights or 2))
    prepared: List[Dict[str, Any]] = []
    night_prices: List[float] = []

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
        np = night_price(h, nights=nights)
        hpp = hotel_pp_of(h, adults=adults)
        if np is None or hpp is None:
            continue
        bayes = bayesian_rating(h.get("rating"), h.get("review_count"))
        h["hotel_pp"] = hpp
        h["night_price"] = np
        h["bayesian_rating"] = round(bayes, 3)
        h["value_score"] = round(value_score(bayes, np), 5)
        hid = h.get("hotel_id") or h.get("id") or ""
        h["id"] = str(hid)
        h["hotel_id"] = hid
        prepared.append(h)
        night_prices.append(np)

    cap = tier_night_cap(night_prices, tier)
    filtered = prepared
    # Need a real distribution before cutting: with ≤4 scored hotels the
    # median/confort cap almost always drops the list to 2.
    if cap is not None and len(prepared) >= 6:
        filtered = [h for h in prepared if float(h["night_price"]) <= cap + 1e-6]

    # If tier empties the list (tiny pool), fall back to all with photos
    if not filtered and prepared:
        filtered = prepared
        cap = tier_night_cap(night_prices, "charme")

    if sort == "rating":
        filtered.sort(
            key=lambda h: (
                float(h.get("bayesian_rating") or 0),
                int(h.get("review_count") or 0),
            ),
            reverse=True,
        )
    else:
        filtered.sort(
            key=lambda h: (
                float(h.get("value_score") or 0),
                float(h.get("bayesian_rating") or 0),
            ),
            reverse=True,
        )

    meta = {
        "tier": tier,
        "sort": sort,
        "nights": nights,
        "night_cap": cap,
        "pool_nights": len(night_prices),
        "median_night": round(statistics.median(night_prices), 2) if night_prices else None,
    }
    return filtered[: max(1, int(top_n or 8))], meta


# --- Backward-compatible wrappers (flight_pp ignored for capping) ---


def max_hotel_pp(flight_pp: Optional[float]) -> Optional[float]:
    """Deprecated: flight-relative cap removed. Kept for API shape."""
    return None


def filter_hotels_for_flight(
    offers: Sequence[Dict[str, Any]],
    *,
    flight_pp: Optional[float] = None,
    adults: int = 2,
    top_n: int = 8,
    require_photo: bool = True,
    checkin: Optional[str] = None,
    checkout: Optional[str] = None,
    tier: HotelTier = DEFAULT_TIER,
    sort: HotelSort = "value",
) -> List[Dict[str, Any]]:
    nights = nights_between(checkin, checkout)
    ranked, _meta = filter_hotels_for_city(
        offers,
        adults=adults,
        nights=nights,
        tier=tier,
        sort=sort,
        top_n=top_n,
        require_photo=require_photo,
    )
    return ranked


def pick_best_hotel_for_flight(
    offers: Sequence[Dict[str, Any]],
    *,
    flight_pp: Optional[float] = None,
    adults: int = 2,
    checkin: Optional[str] = None,
    checkout: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    ranked = filter_hotels_for_flight(
        offers,
        flight_pp=flight_pp,
        adults=adults,
        top_n=1,
        require_photo=True,
        checkin=checkin,
        checkout=checkout,
    )
    return ranked[0] if ranked else None
