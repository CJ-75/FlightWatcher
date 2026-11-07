"""
Cold-fill Travelpayouts for an origin with empty wall inventory.

Lean scan (~15–20 dest × 2 windows) → observations → optional promote.
Persists so the same origin is not hammered repeatedly.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger("deals.origin_ondemand")

_lock = threading.Lock()
_in_flight: Set[str] = set()
_last_run: Dict[str, float] = {}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)) or default)
    except (TypeError, ValueError):
        return default


def _cooldown_s() -> float:
    try:
        return max(60.0, float(os.getenv("DEALS_ONDEMAND_COOLDOWN_S", "900") or 900))
    except (TypeError, ValueError):
        return 900.0


def _lean_dests() -> List[str]:
    raw = (
        os.getenv("DEALS_ONDEMAND_DESTS")
        or "BCN,FCO,MXP,LIS,OPO,MAD,AMS,BER,ATH,VCE,IBZ,AGA,CMN,RAK,DXB,PMI,AGP,NAP,PRG,BUD"
    )
    out = [x.strip().upper() for x in raw.split(",") if x.strip()]
    return out[: max(8, _env_int("DEALS_ONDEMAND_MAX_DESTS", 18))]


def should_warm_origin(origin: str) -> bool:
    o = (origin or "").strip().upper()
    if len(o) != 3:
        return False
    now = time.monotonic()
    with _lock:
        if o in _in_flight:
            return False
        last = _last_run.get(o, 0.0)
        if now - last < _cooldown_s():
            return False
    return True


def schedule_origin_warm(
    supabase: Any,
    origin: str,
    *,
    promote: bool = True,
) -> Dict[str, Any]:
    """Fire-and-forget lean TP fill for origin. Returns immediately."""
    o = (origin or "").strip().upper()
    if not should_warm_origin(o):
        return {"ok": True, "scheduled": False, "reason": "cooldown_or_inflight", "origin": o}
    with _lock:
        _in_flight.add(o)
        _last_run[o] = time.monotonic()

    def _run() -> None:
        try:
            warm_origin_flights(supabase, o, promote=promote)
        except Exception as e:
            logger.warning("origin_ondemand %s failed: %s", o, e)
        finally:
            with _lock:
                _in_flight.discard(o)

    t = threading.Thread(target=_run, name=f"ondemand-{o}", daemon=True)
    t.start()
    return {"ok": True, "scheduled": True, "origin": o}


def warm_origin_flights(
    supabase: Any,
    origin: str,
    *,
    promote: bool = True,
) -> Dict[str, Any]:
    """
    Synchronous lean Travelpayouts scan for one origin.
    ~15–20 dests × 2 date windows; records observations; optional promote.
    """
    from api_models import DateAvecHoraire
    from deals.observations import record_price_observations
    from deals.seed_catalog import date_pairs_from_sets
    from providers.orchestrator import search_roundtrips
    from providers.throttle import is_circuit_open

    o = (origin or "").strip().upper()
    dests = _lean_dests()
    pairs = date_pairs_from_sets(os.getenv("DEALS_ONDEMAND_DATE_SETS", "WEEKEND2,SHORT1"))
    if not pairs:
        pairs = date_pairs_from_sets("WEEKEND2")
    pairs = pairs[:2]

    try:
        budget = int(float(os.getenv("DEALS_ONDEMAND_MAX_PP", "450") or 450))
    except (TypeError, ValueError):
        budget = 450

    trips_n = 0
    cells = 0
    errors = 0
    t0 = time.monotonic()

    if is_circuit_open("travelpayouts"):
        return {"ok": False, "error": "travelpayouts_circuit_open", "origin": o}

    for dest in dests:
        for out_d, ret_d in pairs:
            cells += 1
            try:
                trips, _nq = search_roundtrips(
                    aeroport_depart=o,
                    dates_depart=[DateAvecHoraire(date=out_d)],
                    dates_retour=[DateAvecHoraire(date=ret_d)],
                    budget_max=budget,
                    limite_allers=20,
                    destinations_incluses=[dest],
                    record_prices=False,
                    passengers=1,
                    direct=True,
                    providers=["travelpayouts"],
                )
                if trips:
                    record_price_observations(
                        trips,
                        source="organic_search",
                        fingerprint=f"ondemand:{o}:{dest}:{out_d}",
                        sync=True,
                    )
                    trips_n += len(trips)
            except Exception as e:
                errors += 1
                logger.debug("ondemand cell %s→%s: %s", o, dest, e)
            # Soft pause to stay polite
            time.sleep(float(os.getenv("DEALS_ONDEMAND_PAUSE_S", "0.35") or 0.35))

    promoted = None
    if promote and trips_n > 0:
        try:
            from deals.promote import promote_deals

            promoted = promote_deals(supabase)
            try:
                from deals.community_list import invalidate_list_cache

                invalidate_list_cache()
            except Exception:
                pass
        except Exception as e:
            promoted = {"ok": False, "error": str(e)}

    elapsed = round(time.monotonic() - t0, 2)
    out = {
        "ok": True,
        "origin": o,
        "dests": len(dests),
        "cells": cells,
        "trips": trips_n,
        "errors": errors,
        "elapsed_s": elapsed,
        "promote": promoted,
    }
    logger.info(
        "origin_ondemand origin=%s trips=%s cells=%s elapsed=%ss",
        o,
        trips_n,
        cells,
        elapsed,
    )
    return out


def maybe_schedule_if_empty(
    supabase: Any,
    *,
    origin: Optional[str],
    matched_count: int,
) -> Optional[Dict[str, Any]]:
    """Call from list path when origin has 0 match_origin deals."""
    if not origin or matched_count > 0:
        return None
    if (os.getenv("DEALS_ONDEMAND_ENABLED", "true") or "true").lower() in (
        "0",
        "false",
        "no",
        "off",
    ):
        return None
    return schedule_origin_warm(supabase, origin, promote=True)
