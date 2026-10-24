"""SSP pricing helpers for hotel deals (no network)."""
from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger("deals.pricing")

MoneyLike = Union[int, float, Dict[str, Any], List[Any], None]


def _as_amount(value: MoneyLike) -> Optional[float]:
    """Extract a numeric amount from LiteAPI money fields (object or array or scalar)."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, list):
        total = 0.0
        found = False
        for item in value:
            amt = _as_amount(item)
            if amt is not None:
                total += amt
                found = True
        return total if found else None
    if isinstance(value, dict):
        for key in ("amount", "value", "total", "price"):
            if key in value:
                amt = _as_amount(value.get(key))
                if amt is not None:
                    return amt
        # nested suggestedSellingPrice / retailRate shapes
        if "suggestedSellingPrice" in value:
            return _as_amount(value.get("suggestedSellingPrice"))
        if "total" in value:
            return _as_amount(value.get("total"))
    return None


def money_source(value: MoneyLike) -> Optional[str]:
    """Best-effort source label (e.g. booking.com) from SSP field."""
    if isinstance(value, dict):
        src = value.get("source")
        return str(src) if src else None
    if isinstance(value, list) and value:
        return money_source(value[0])
    return None


def sum_excluded_fees(taxes_and_fees: Any) -> float:
    """Sum taxesAndFees where included == false (payable on site)."""
    if not taxes_and_fees:
        return 0.0
    items = taxes_and_fees if isinstance(taxes_and_fees, list) else [taxes_and_fees]
    total = 0.0
    for item in items:
        if not isinstance(item, dict):
            continue
        included = item.get("included")
        if included is True:
            continue
        # Treat missing included as unknown — only count explicit false
        if included is not False:
            continue
        amt = _as_amount(item.get("amount") if "amount" in item else item)
        if amt is not None:
            total += amt
    return total


def sum_commission(commission: Any) -> float:
    if not commission:
        return 0.0
    items = commission if isinstance(commission, list) else [commission]
    total = 0.0
    for item in items:
        amt = _as_amount(item)
        if amt is not None:
            total += amt
    return total


def public_hotel_price(
    retail_total: Optional[float],
    ssp_total: Optional[float],
) -> Tuple[float, bool]:
    """
    Public sell price must never go below SSP when SSP is present.
    Returns (price, ssp_missing).
    """
    if retail_total is None and ssp_total is None:
        return 0.0, True
    if ssp_total is None:
        logger.info("ssp_missing: falling back to retail_total=%s", retail_total)
        return float(retail_total or 0.0), True
    if retail_total is None:
        return float(ssp_total), False
    return float(max(ssp_total, retail_total)), False


def price_per_person(
    flight_price_pp_ar: float,
    public_hotel_total: float,
    adults: int,
) -> float:
    adults = max(1, int(adults or 1))
    return float(flight_price_pp_ar) + float(public_hotel_total) / adults


def margin_gap(public_hotel: float, retail_total: float) -> float:
    return float(public_hotel) - float(retail_total)


def ceil_margin_pct(ssp_total: float, net: float, max_pct: float) -> Optional[float]:
    """
    margin_pct = ceil1((ssp / net - 1) * 100) rounded up to 0.1, capped at max_pct.
    Returns None if net <= 0 or ssp <= net (no extra margin needed).
    """
    if net <= 0 or ssp_total <= 0:
        return None
    if ssp_total <= net:
        return None
    raw = (ssp_total / net - 1.0) * 100.0
    # round up to 1 decimal (epsilon avoids float noise e.g. 10.0000000002 → 10.1)
    rounded = math.ceil(raw * 10.0 - 1e-9) / 10.0
    return min(float(max_pct), rounded)


def extract_rate_money(rate: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize money fields from a LiteAPI rate / roomType node.
    Handles object-vs-array variants for offerRetailRate / suggestedSellingPrice.
    """
    retail = (
        _as_amount(rate.get("offerRetailRate"))
        or _as_amount((rate.get("retailRate") or {}).get("total") if isinstance(rate.get("retailRate"), dict) else None)
        or _as_amount(rate.get("retailRate"))
    )
    ssp_raw = rate.get("suggestedSellingPrice")
    if ssp_raw is None and isinstance(rate.get("retailRate"), dict):
        ssp_raw = rate["retailRate"].get("suggestedSellingPrice")
    ssp = _as_amount(ssp_raw)
    ssp_src = money_source(ssp_raw)

    taxes = None
    if isinstance(rate.get("retailRate"), dict):
        taxes = rate["retailRate"].get("taxesAndFees")
    if taxes is None:
        taxes = rate.get("taxesAndFees")
    excluded = sum_excluded_fees(taxes)
    commission = sum_commission(rate.get("commission"))
    public, ssp_missing = public_hotel_price(retail, ssp)

    return {
        "retail_total": retail,
        "ssp_total": ssp,
        "ssp_source": ssp_src,
        "excluded_fees": excluded,
        "commission_total": commission,
        "public_hotel_price": public,
        "ssp_missing": ssp_missing,
        "margin_gap": margin_gap(public, retail or 0.0) if retail is not None else 0.0,
        "net": (retail - commission) if retail is not None else None,
    }


def price_delta_action(
    displayed: float,
    revalidated: float,
) -> str:
    """
    §5.5: silent | confirm | fallback
    """
    if displayed <= 0:
        return "confirm" if revalidated > 0 else "fallback"
    pct = abs(revalidated - displayed) / displayed * 100.0
    if pct <= 2.0:
        return "silent"
    if pct <= 10.0:
        return "confirm"
    return "fallback"
