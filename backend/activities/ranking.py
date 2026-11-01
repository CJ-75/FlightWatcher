"""Activity ranking — Bayesian rating + bonuses (Lot B). Shared logic lives here."""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional


def bayesian_score(
    rating: Optional[float],
    review_count: Optional[int],
    *,
    prior_rating: float = 4.2,
    prior_weight: float = 20.0,
) -> float:
    r = float(rating or 0)
    n = max(0, int(review_count or 0))
    if r <= 0 and n <= 0:
        return 0.0
    return (prior_weight * prior_rating + n * r) / (prior_weight + n)


def rank_activities(
    items: List[Dict[str, Any]],
    *,
    stay_hours: Optional[float] = None,
    distance_km: Optional[Dict[str, float]] = None,
) -> List[Dict[str, Any]]:
    """
    Sort copy of items by FW score (mutates each with `_fw_score`).
    distance_km: optional map productCode → km for nearby mode.
    """
    scored: List[Dict[str, Any]] = []
    for raw in items:
        it = dict(raw)
        rating = it.get("rating") or it.get("reviews", {}).get("combinedAverageRating")
        reviews = it.get("review_count")
        if reviews is None:
            reviews = (it.get("reviews") or {}).get("totalReviews")
        score = bayesian_score(
            float(rating) if rating is not None else None,
            int(reviews) if reviews is not None else None,
        )
        flags = it.get("flags") or {}
        if it.get("free_cancellation") or flags.get("freeCancellation"):
            score += 0.15
        if it.get("instant_confirmation") or flags.get("instantConfirmation"):
            score += 0.1
        dur = it.get("duration_hours") or it.get("durationHours")
        if stay_hours and dur:
            try:
                d = float(dur)
                # Prefer activities that fit the stay window
                if 0 < d <= float(stay_hours):
                    score += 0.12
            except (TypeError, ValueError):
                pass
        code = str(it.get("product_code") or it.get("productCode") or "")
        if distance_km and code in distance_km:
            km = float(distance_km[code])
            # Soft distance penalty
            score -= min(1.5, km / 50.0)
            it["distance_km"] = round(km, 1)
        it["_fw_score"] = round(score, 4)
        scored.append(it)

    # Light category diversity: demote consecutive same category
    scored.sort(key=lambda x: float(x.get("_fw_score") or 0), reverse=True)
    seen_cat: Dict[str, int] = {}
    diversified: List[Dict[str, Any]] = []
    rest: List[Dict[str, Any]] = []
    for it in scored:
        cat = str(it.get("category") or it.get("tag") or "other")
        c = seen_cat.get(cat, 0)
        if c < 2:
            diversified.append(it)
            seen_cat[cat] = c + 1
        else:
            rest.append(it)
    return diversified + rest


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
