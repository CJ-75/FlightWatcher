"""
Pack budget gate for séjours (vol + hôtel / pers.).

DEALS_BUDGET_PACK_PP (default 350) is the max stay total shown on the wall.
Applied on list + after price refresh / materialize (expire over-budget deals).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from deals.hotel_budget import hotel_pp_of
from deals.liteapi_config import DealsConfig, load_deals_config

logger = logging.getLogger("deals.pack_budget")


def pack_budget_pp(cfg: Optional[DealsConfig] = None) -> float:
    cfg = cfg or load_deals_config()
    try:
        return max(0.0, float(cfg.budget_pack_pp or 0))
    except (TypeError, ValueError):
        return 350.0


def pack_budget_pp_for_dest(
    dest_iata: Optional[str],
    *,
    cfg: Optional[DealsConfig] = None,
) -> float:
    """Higher pack cap for long-haul so BKK/JFK packs aren't expired at 350 €."""
    import os

    base = pack_budget_pp(cfg)
    code = (dest_iata or "").strip().upper()
    if not code:
        return base
    try:
        from deals.destinations_seed import LONGHAUL_IATAS

        if code not in LONGHAUL_IATAS:
            return base
    except Exception:
        return base
    try:
        lh = float(os.getenv("DEALS_BUDGET_PACK_PP_LONGHAUL", "0") or 0)
    except (TypeError, ValueError):
        lh = 0.0
    if lh <= 0:
        lh = max(base, 1200.0)
    return lh


def flight_pp_of_row(row: Dict[str, Any]) -> float:
    flight = row.get("flight_snapshot") or {}
    try:
        return float(flight.get("price_pp_eur") or 0)
    except (TypeError, ValueError):
        return 0.0


def estimate_pack_pp(
    row: Dict[str, Any],
    *,
    adults: int = 2,
) -> Optional[float]:
    """
    Vol/pers + hôtel/pers when a bookable hotel price exists; else flight only.
    Returns None if we cannot price anything.
    """
    fpp = flight_pp_of_row(row)
    hotels = row.get("hotel_top3") or []
    hotel = hotels[0] if isinstance(hotels, list) and hotels else None
    hpp = hotel_pp_of(hotel, adults=adults) if isinstance(hotel, dict) else None
    if fpp <= 0 and (hpp is None or hpp <= 0):
        return None
    if hpp is not None and hpp > 0:
        return round(max(0.0, fpp) + float(hpp), 2)
    return round(fpp, 2) if fpp > 0 else None


def is_over_pack_budget(
    pack_pp: Optional[float],
    *,
    cfg: Optional[DealsConfig] = None,
    cap: Optional[float] = None,
    dest_iata: Optional[str] = None,
) -> bool:
    if cap is not None:
        limit = float(cap)
    elif dest_iata:
        limit = pack_budget_pp_for_dest(dest_iata, cfg=cfg)
    else:
        limit = pack_budget_pp(cfg)
    if limit <= 0 or pack_pp is None:
        return False
    try:
        return float(pack_pp) > limit
    except (TypeError, ValueError):
        return False


def expire_over_budget_deals(
    supabase: Any,
    *,
    cfg: Optional[DealsConfig] = None,
    adults: int = 2,
    limit: int = 2000,
) -> Dict[str, Any]:
    """
    Soft-expire active deals whose refreshed pack price exceeds DEALS_BUDGET_PACK_PP.
    Also expires when flight alone already exceeds the pack cap (impossible cheap stay).
    """
    cfg = cfg or load_deals_config()
    cap = pack_budget_pp(cfg)
    if cap <= 0:
        return {"ok": True, "skipped": True, "reason": "pack_budget_disabled", "cap": cap}

    try:
        res = (
            supabase.table("deals_active")
            .select(
                "deal_key,flight_snapshot,hotel_top3,status,origin_iata,dest_iata"
            )
            .eq("status", "active")
            .limit(max(1, int(limit)))
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        logger.warning("expire_over_budget read failed: %s", e)
        return {"ok": False, "error": str(e), "cap": cap}

    now = datetime.now(timezone.utc).isoformat()
    expired = 0
    kept = 0
    samples: list = []

    for row in rows:
        dest = str(row.get("dest_iata") or "").upper()
        row_cap = pack_budget_pp_for_dest(dest, cfg=cfg)
        pack = estimate_pack_pp(row, adults=adults)
        fpp = flight_pp_of_row(row)
        over = is_over_pack_budget(pack, cap=row_cap) or (
            fpp > 0 and is_over_pack_budget(fpp, cap=row_cap)
        )
        if not over:
            kept += 1
            continue
        key = row.get("deal_key")
        if not key:
            continue
        try:
            supabase.table("deals_active").update(
                {
                    "status": "expired",
                    "updated_at": now,
                }
            ).eq("deal_key", key).execute()
            expired += 1
            if len(samples) < 8:
                samples.append(
                    {
                        "deal_key": key,
                        "route": f"{row.get('origin_iata')}→{row.get('dest_iata')}",
                        "pack_pp": pack,
                        "flight_pp": fpp,
                    }
                )
        except Exception as e:
            logger.warning("expire %s: %s", key, e)

    if expired:
        try:
            from deals.community_list import invalidate_list_cache

            invalidate_list_cache()
        except Exception:
            pass

    summary = {
        "ok": True,
        "cap": cap,
        "scanned": len(rows),
        "expired": expired,
        "kept": kept,
        "samples": samples,
        "at": now,
    }
    logger.info(
        "expire_over_budget_deals cap=%s scanned=%s expired=%s",
        cap,
        len(rows),
        expired,
    )
    return summary
