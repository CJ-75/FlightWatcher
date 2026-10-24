"""Parse LiteAPI /hotels/rates + score candidates (§5 + §6.2)."""
from __future__ import annotations

import logging
import statistics
from typing import Any, Dict, List, Optional, Sequence, Set

from deals.pricing import extract_rate_money

logger = logging.getLogger("deals.hotel_scoring")

BREAKFAST_BOARDS: Set[str] = {"BI", "HB", "FB", "AI", "BDI", "BLI"}
BREAKFAST_SURCHARGE_MAX_PP = 12.0

DEFAULT_WEIGHTS = {
    "prix": 1.0,
    "note": 0.35,
    "dist": 0.25,
    "breakfast": 0.15,
    "refundable": 0.05,
    "late": 0.3,
}


def _g(obj: Any, *keys: str, default: Any = None) -> Any:
    cur = obj
    for k in keys:
        if cur is None:
            return default
        if isinstance(cur, dict):
            cur = cur.get(k, default)
        else:
            cur = getattr(cur, k, default)
    return cur


def extract_hotels_from_rates(payload: Any) -> List[Dict[str, Any]]:
    """Normalize rates response to a list of hotel nodes with roomTypes."""
    if payload is None:
        return []
    if isinstance(payload, list):
        return [h for h in payload if isinstance(h, dict)]
    if not isinstance(payload, dict):
        return []
    data = payload.get("data")
    if isinstance(data, list):
        return [h for h in data if isinstance(h, dict)]
    if isinstance(data, dict):
        hotels = data.get("hotels") or data.get("data")
        if isinstance(hotels, list):
            return [h for h in hotels if isinstance(h, dict)]
    hotels = payload.get("hotels")
    if isinstance(hotels, list):
        return [h for h in hotels if isinstance(h, dict)]
    return []


def _board_code(rate_or_room: Dict[str, Any]) -> Optional[str]:
    for key in ("boardType", "board_type", "boardName", "board"):
        v = rate_or_room.get(key)
        if v:
            # boardName may be long; prefer boardType
            if key in ("boardType", "board_type"):
                return str(v).upper().strip()
    rates = rate_or_room.get("rates")
    if isinstance(rates, list) and rates:
        return _board_code(rates[0]) if isinstance(rates[0], dict) else None
    return None


def _board_name(rate_or_room: Dict[str, Any]) -> Optional[str]:
    for key in ("boardName", "board_name"):
        v = rate_or_room.get(key)
        if v:
            return str(v)
    rates = rate_or_room.get("rates")
    if isinstance(rates, list) and rates and isinstance(rates[0], dict):
        return rates[0].get("boardName") or rates[0].get("board_name")
    return None


def _refundable(rate_or_room: Dict[str, Any]) -> bool:
    policies = rate_or_room.get("cancellationPolicies") or rate_or_room.get(
        "cancellation_policies"
    )
    if isinstance(policies, dict):
        tag = str(policies.get("refundableTag") or policies.get("refundable_tag") or "").upper()
        if tag == "RFN":
            return True
        if tag == "NRFN":
            return False
    rates = rate_or_room.get("rates")
    if isinstance(rates, list):
        for r in rates:
            if isinstance(r, dict) and _refundable(r):
                return True
    return False


def _cancel_deadline(rate_or_room: Dict[str, Any]) -> Optional[str]:
    policies = rate_or_room.get("cancellationPolicies") or {}
    if not isinstance(policies, dict):
        return None
    infos = policies.get("cancelPolicyInfos") or policies.get("cancel_policy_infos") or []
    if not isinstance(infos, list) or not infos:
        return None
    # earliest cancel deadline
    deadlines = []
    for info in infos:
        if not isinstance(info, dict):
            continue
        for k in ("cancelTime", "cancel_time", "deadline"):
            if info.get(k):
                deadlines.append(str(info[k]))
    return min(deadlines) if deadlines else None


def _offer_id(room: Dict[str, Any]) -> Optional[str]:
    oid = room.get("offerId") or room.get("offer_id")
    return str(oid) if oid else None


def iter_room_offers(hotel_node: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Flatten roomTypes (and nested rates) into offer dicts with money extracted."""
    hotel_id = str(hotel_node.get("hotelId") or hotel_node.get("hotel_id") or hotel_node.get("id") or "")
    room_types = hotel_node.get("roomTypes") or hotel_node.get("room_types") or []
    if not isinstance(room_types, list):
        room_types = []

    offers: List[Dict[str, Any]] = []
    for room in room_types:
        if not isinstance(room, dict):
            continue
        money = extract_rate_money(room)
        # Sometimes money lives on nested rates[0]
        if money.get("retail_total") is None:
            rates = room.get("rates")
            if isinstance(rates, list) and rates and isinstance(rates[0], dict):
                nested = extract_rate_money(rates[0])
                for k, v in nested.items():
                    if money.get(k) is None:
                        money[k] = v

        if money.get("public_hotel_price") is None and money.get("retail_total") is None:
            continue

        offers.append(
            {
                "hotel_id": hotel_id,
                "offer_id": _offer_id(room),
                "board": _board_code(room),
                "board_name": _board_name(room),
                "refundable": _refundable(room),
                "cancel_deadline": _cancel_deadline(room),
                **money,
            }
        )
    return offers


def breakfast_bonus(
    offers_same_hotel: Sequence[Dict[str, Any]],
    candidate: Dict[str, Any],
    *,
    adults: int,
    bonus: float,
) -> float:
    """+B if board has breakfast and surcharge vs cheapest RO ≤ 12€/pers."""
    board = (candidate.get("board") or "").upper()
    if board not in BREAKFAST_BOARDS:
        return 0.0
    adults = max(1, int(adults or 1))
    cand_price = float(candidate.get("public_hotel_price") or 0)
    ro_prices = [
        float(o.get("public_hotel_price") or 0)
        for o in offers_same_hotel
        if (o.get("board") or "").upper() == "RO" and o.get("public_hotel_price") is not None
    ]
    if not ro_prices:
        # no RO comparator — still give half bonus if breakfast board
        return bonus * 0.5
    cheapest_ro = min(ro_prices)
    surcharge_pp = (cand_price - cheapest_ro) / adults
    if surcharge_pp <= BREAKFAST_SURCHARGE_MAX_PP:
        return bonus
    return 0.0


def score_offer(
    offer: Dict[str, Any],
    *,
    pool_meta: Dict[str, Any],
    median_total_reel: float,
    pool_radius_m: int,
    adults: int,
    late_arrival: bool,
    offers_same_hotel: Sequence[Dict[str, Any]],
    weights: Optional[Dict[str, float]] = None,
) -> float:
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    public = float(offer.get("public_hotel_price") or 0)
    excluded = float(offer.get("excluded_fees") or 0)
    total_reel = public + excluded
    if total_reel <= 0:
        return -999.0

    median = median_total_reel if median_total_reel > 0 else total_reel
    w_prix = float(w.get("prix", 1.0))
    w_note = float(w.get("note", 0.35))
    w_dist = float(w.get("dist", 0.25))
    b_bf = float(w.get("breakfast", 0.15))
    b_ref = float(w.get("refundable", 0.05))
    p_late = float(w.get("late", 0.3))

    rating = float(pool_meta.get("rating") or 0)
    # rating already normalized to /10 in hotel_pool
    dist = float(pool_meta.get("distance_m") or 0)
    radius = max(1.0, float(pool_radius_m or 2000))

    score = 0.0
    score += w_prix * (median / total_reel)
    score += w_note * (rating - 8.0)
    score += w_dist * max(0.0, 1.0 - dist / radius)
    score += breakfast_bonus(offers_same_hotel, offer, adults=adults, bonus=b_bf)
    if offer.get("refundable"):
        score += b_ref
    if late_arrival and not pool_meta.get("has_24h_reception"):
        score -= p_late
    return score


def build_candidates(
    rates_payload: Any,
    pool_by_id: Dict[str, Dict[str, Any]],
    *,
    pool_radius_m: int,
    adults: int,
    late_arrival: bool = False,
    weights: Optional[Dict[str, float]] = None,
    top_n: int = 12,
) -> List[Dict[str, Any]]:
    """
    Best rate per hotel, then top N hotels by score.
    Each candidate includes fields stored in hotel_rates_cache.top.
    Keep ≥8–12 so confort-tier filter still leaves several options
    (with top_n=3 the median cut almost always left only 2).
    """
    hotels = extract_hotels_from_rates(rates_payload)
    all_offers: List[Dict[str, Any]] = []
    by_hotel: Dict[str, List[Dict[str, Any]]] = {}

    for h in hotels:
        offers = iter_room_offers(h)
        for o in offers:
            hid = o.get("hotel_id") or ""
            if hid not in pool_by_id:
                # still allow if hotel returned with includeHotelData outside pool
                # but prefer pool only
                continue
            by_hotel.setdefault(hid, []).append(o)
            all_offers.append(o)

    if not all_offers:
        return []

    totals = [
        float(o.get("public_hotel_price") or 0) + float(o.get("excluded_fees") or 0)
        for o in all_offers
        if (o.get("public_hotel_price") or 0) > 0
    ]
    median = statistics.median(totals) if totals else 0.0

    best_per_hotel: List[Dict[str, Any]] = []
    ssp_missing_count = 0
    margin_gaps: List[float] = []

    for hid, offers in by_hotel.items():
        meta = pool_by_id.get(hid) or {}
        scored = []
        for o in offers:
            s = score_offer(
                o,
                pool_meta=meta,
                median_total_reel=median,
                pool_radius_m=pool_radius_m,
                adults=adults,
                late_arrival=late_arrival,
                offers_same_hotel=offers,
                weights=weights,
            )
            scored.append((s, o))
        scored.sort(key=lambda x: x[0], reverse=True)
        best_score, best = scored[0]
        if best.get("ssp_missing"):
            ssp_missing_count += 1
        if best.get("margin_gap") is not None:
            margin_gaps.append(float(best["margin_gap"]))

        best_per_hotel.append(
            {
                "hotel_id": hid,
                "name": meta.get("name"),
                "stars": meta.get("stars"),
                "rating": meta.get("rating"),
                "review_count": meta.get("review_count"),
                "distance_m": meta.get("distance_m"),
                "photo": meta.get("main_photo") or meta.get("thumbnail"),
                "thumbnail": meta.get("thumbnail"),
                "board": best.get("board"),
                "board_name": best.get("board_name"),
                "refundable": bool(best.get("refundable")),
                "cancel_deadline": best.get("cancel_deadline"),
                "offer_id": best.get("offer_id"),
                "retail_total": best.get("retail_total"),
                "ssp_total": best.get("ssp_total"),
                "ssp_source": best.get("ssp_source"),
                "excluded_fees": best.get("excluded_fees") or 0,
                "public_hotel_price": best.get("public_hotel_price"),
                "ssp_missing": bool(best.get("ssp_missing")),
                "margin_gap": best.get("margin_gap") or 0,
                "score": round(best_score, 4),
                "has_24h_reception": bool(meta.get("has_24h_reception")),
            }
        )

    best_per_hotel.sort(key=lambda c: c["score"], reverse=True)
    top = best_per_hotel[:top_n]

    logger.info(
        "score_summary hotels_scored=%s top=%s median_total=%.2f ssp_missing=%s margin_gap_avg=%.2f",
        len(best_per_hotel),
        len(top),
        median,
        ssp_missing_count,
        (sum(margin_gaps) / len(margin_gaps)) if margin_gaps else 0.0,
    )
    return top
