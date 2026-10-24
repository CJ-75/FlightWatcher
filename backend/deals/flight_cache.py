"""Refresh deal_flight_cache: scan + attach best A/R per origin×dest×window."""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

from api_models import DateAvecHoraire
from deals.destinations_seed import DESTINATIONS_SEED
from deals.flight_attach import (
    flight_snapshot,
    is_direct,
    pick_best_trip,
    trip_price_pp,
)
from deals.liteapi_config import DealsConfig, load_deals_config
from deals.ttl import expires_at_for
from deals.windows import canonical_windows, upsert_windows
from flight_scanner import scanner_vols_api

logger = logging.getLogger("deals.flight_cache")

DEFAULT_ORIGINS = ("BVA", "ORY", "CDG", "MRS", "NCE", "LYS", "TLS")


def deals_origins() -> List[str]:
    raw = (os.getenv("DEALS_ORIGINS") or "").strip()
    if raw:
        return [p.strip().upper() for p in raw.split(",") if len(p.strip()) == 3]
    return list(DEFAULT_ORIGINS)


def _load_destinations(supabase: Any) -> List[Dict[str, Any]]:
    result = (
        supabase.table("deal_destinations")
        .select("*")
        .eq("active", True)
        .order("priority")
        .execute()
    )
    rows = list(result.data or [])
    if rows:
        return rows
    # Fallback seed shapes (no id) — caller should seed first
    return [{**d, "id": None, "active": True} for d in DESTINATIONS_SEED]


def _scan_roundtrips(
    *,
    origin: str,
    dest_iata: str,
    checkin: str,
    checkout: str,
    budget_pp: float,
) -> List[Any]:
    """One scanner call for a single origin→dest window."""
    dates_depart = [
        DateAvecHoraire(date=checkin, heure_min="00:00", heure_max="23:59")
    ]
    dates_retour = [
        DateAvecHoraire(date=checkout, heure_min="00:00", heure_max="23:59")
    ]
    try:
        results, _n = scanner_vols_api(
            aeroport_depart=origin,
            dates_depart=dates_depart,
            dates_retour=dates_retour,
            budget_max=int(math_ceil_budget(budget_pp)),
            limite_allers=40,
            destinations_exclues=[],
            destinations_incluses=[dest_iata],
            record_prices=False,
            passengers=1,
            direct=False,
        )
        return list(results or [])
    except Exception as e:
        logger.warning("scan_failed origin=%s dest=%s: %s", origin, dest_iata, e)
        return []


def math_ceil_budget(budget_pp: float) -> int:
    return max(1, int(budget_pp) if budget_pp == int(budget_pp) else int(budget_pp) + 1)


def upsert_flight_cache_row(supabase: Any, row: Dict[str, Any]) -> None:
    supabase.table("deal_flight_cache").upsert(
        row,
        on_conflict="origin_iata,destination_id,window_id",
    ).execute()


def refresh_deal_flights(
    supabase: Any,
    *,
    cfg: Optional[DealsConfig] = None,
    origins: Optional[Sequence[str]] = None,
    slugs: Optional[Sequence[str]] = None,
    kinds: Optional[Sequence[str]] = None,
    weekends_ahead: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Upsert canonical windows, then fill deal_flight_cache for each
    origin × destination × window. Isolated errors per combo.
    """
    cfg = cfg or load_deals_config()
    origins = [o.upper() for o in (origins or deals_origins())]
    kinds = list(kinds or cfg.window_kinds or ("FRI_SUN",))
    n = weekends_ahead or cfg.weekends_ahead or 3
    budget = float(cfg.budget_flight_pp)

    windows = canonical_windows(n, kinds=kinds)
    upsert_windows(supabase, windows)

    destinations = _load_destinations(supabase)
    if slugs:
        want = {s.strip().lower() for s in slugs}
        destinations = [d for d in destinations if (d.get("slug") or "").lower() in want]

    results = []
    ok = no_flight = errors = 0

    for dest in destinations:
        dest_id = dest.get("id")
        if not dest_id:
            results.append({"slug": dest.get("slug"), "error": "missing_destination_id", "status": "error"})
            errors += 1
            continue
        dest_iata = (dest.get("iata_arrival") or "").upper()
        dest_tz = dest.get("timezone") or "Europe/Paris"
        slug = dest.get("slug")

        for w in windows:
            checkin = date.fromisoformat(w["checkin"])
            checkout = date.fromisoformat(w["checkout"])
            expires = expires_at_for(checkin).isoformat()
            fetched = datetime.now(timezone.utc).isoformat()

            for origin in origins:
                key = f"{origin}-{dest_iata}-{w['id']}"
                try:
                    trips = _scan_roundtrips(
                        origin=origin,
                        dest_iata=dest_iata,
                        checkin=w["checkin"],
                        checkout=w["checkout"],
                        budget_pp=budget,
                    )
                    picked = pick_best_trip(
                        trips,
                        checkin=checkin,
                        checkout=checkout,
                        dest_timezone=dest_tz,
                        budget_pp=budget,
                    )
                    if not picked:
                        upsert_flight_cache_row(
                            supabase,
                            {
                                "origin_iata": origin,
                                "destination_id": dest_id,
                                "iata_arrival": dest_iata,
                                "window_id": w["id"],
                                "checkin": w["checkin"],
                                "checkout": w["checkout"],
                                "flight": None,
                                "price_pp": None,
                                "direct": None,
                                "late_arrival": False,
                                "late_departure": False,
                                "fetched_at": fetched,
                                "expires_at": expires,
                                "status": "no_flight",
                            },
                        )
                        no_flight += 1
                        results.append({"key": key, "status": "no_flight", "candidates": len(trips)})
                        continue

                    trip, att = picked
                    price = trip_price_pp(trip)
                    upsert_flight_cache_row(
                        supabase,
                        {
                            "origin_iata": origin,
                            "destination_id": dest_id,
                            "iata_arrival": dest_iata,
                            "window_id": w["id"],
                            "checkin": w["checkin"],
                            "checkout": w["checkout"],
                            "flight": flight_snapshot(trip, att),
                            "price_pp": price,
                            "direct": is_direct(trip),
                            "late_arrival": att.late_arrival,
                            "late_departure": att.late_departure,
                            "fetched_at": fetched,
                            "expires_at": expires,
                            "status": "ok",
                        },
                    )
                    ok += 1
                    results.append(
                        {
                            "key": key,
                            "status": "ok",
                            "price_pp": price,
                            "late_arrival": att.late_arrival,
                            "late_departure": att.late_departure,
                        }
                    )
                    logger.info(
                        "flight_cache_ok key=%s price_pp=%s late_arr=%s late_dep=%s",
                        key,
                        price,
                        att.late_arrival,
                        att.late_departure,
                    )
                except Exception as e:
                    errors += 1
                    logger.exception("flight_cache_error key=%s", key)
                    try:
                        upsert_flight_cache_row(
                            supabase,
                            {
                                "origin_iata": origin,
                                "destination_id": dest_id,
                                "iata_arrival": dest_iata,
                                "window_id": w["id"],
                                "checkin": w["checkin"],
                                "checkout": w["checkout"],
                                "flight": None,
                                "price_pp": None,
                                "direct": None,
                                "late_arrival": False,
                                "late_departure": False,
                                "fetched_at": fetched,
                                "expires_at": expires,
                                "status": "error",
                            },
                        )
                    except Exception:
                        pass
                    results.append({"key": key, "status": "error", "error": str(e)})

    return {
        "windows": len(windows),
        "destinations": len(destinations),
        "origins": origins,
        "ok": ok,
        "no_flight": no_flight,
        "errors": errors,
        "results": results,
    }


def has_valid_roundtrip(
    supabase: Any,
    *,
    destination_id: str,
    window_id: str,
    max_pp: float,
) -> bool:
    """Used by L4 hotel rates refresh: any origin with ok flight under budget."""
    result = (
        supabase.table("deal_flight_cache")
        .select("price_pp,status,expires_at")
        .eq("destination_id", destination_id)
        .eq("window_id", window_id)
        .eq("status", "ok")
        .not_.is_("price_pp", "null")
        .lte("price_pp", max_pp)
        .gt("expires_at", datetime.now(timezone.utc).isoformat())
        .limit(1)
        .execute()
    )
    return bool(result.data)
