"""
Deal weekend calendar via LiteAPI /hotels/min-rates (batch only, 12 h cache).

Never call min-rates from GET — only from refresh_deal_calendar.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from deals.liteapi_client import LiteApiClient, LiteApiError
from deals.liteapi_config import DealsConfig, load_deals_config
from deals.pricing import _as_amount, price_per_person, public_hotel_price
from deals.windows import canonical_windows, upsert_windows

logger = logging.getLogger("deals.calendar")

CALENDAR_TTL = timedelta(hours=12)


def parse_min_rate_entry(row: Any) -> Optional[Dict[str, Any]]:
    """Normalize one min-rates hotel row → hotel_id, retail, ssp, public, offer_id."""
    if not isinstance(row, dict):
        return None
    hotel_id = row.get("hotelId") or row.get("hotel_id") or row.get("id")
    if not hotel_id:
        return None
    retail = _as_amount(row.get("price") if "price" in row else row.get("offerRetailRate"))
    ssp = _as_amount(
        row.get("suggestedSellingPrice")
        if "suggestedSellingPrice" in row
        else row.get("ssp")
    )
    public, ssp_missing = public_hotel_price(retail, ssp)
    if public <= 0:
        return None
    offer_id = row.get("offerId") or row.get("offer_id")
    return {
        "hotel_id": str(hotel_id),
        "retail_total": retail,
        "ssp_total": ssp,
        "public_hotel_price": public,
        "ssp_missing": ssp_missing,
        "offer_id": str(offer_id) if offer_id else None,
    }


def parse_min_rates_response(raw: Any) -> List[Dict[str, Any]]:
    """Extract hotel min-rate rows from LiteAPI response (defensive shapes)."""
    if raw is None:
        return []
    data = raw
    if isinstance(raw, dict):
        data = raw.get("data") if "data" in raw else raw
        if isinstance(data, dict):
            for key in ("hotels", "rates", "items", "results"):
                if isinstance(data.get(key), list):
                    data = data[key]
                    break
    if not isinstance(data, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in data:
        parsed = parse_min_rate_entry(item)
        if parsed:
            out.append(parsed)
    return out


def cheapest_min_rate(entries: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not entries:
        return None
    return min(entries, key=lambda e: float(e.get("public_hotel_price") or 1e18))


def _origins(cfg: DealsConfig, override: Optional[Sequence[str]] = None) -> List[str]:
    if override:
        return [o.strip().upper() for o in override if o and o.strip()]
    raw = (os.getenv("DEALS_ORIGINS") or "BVA,ORY,CDG").strip()
    return [p.strip().upper() for p in raw.split(",") if p.strip()]


def _calendar_expires_at(now: Optional[datetime] = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now + CALENDAR_TTL


def _is_calendar_due(
    supabase: Any,
    *,
    destination_id: str,
    origin_iata: str,
    adults: int,
    window_kind: str,
    force: bool = False,
) -> bool:
    if force:
        return True
    result = (
        supabase.table("deal_calendar_cache")
        .select("expires_at")
        .eq("destination_id", destination_id)
        .eq("origin_iata", origin_iata)
        .eq("adults", adults)
        .eq("window_kind", window_kind)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return True
    exp = rows[0].get("expires_at")
    if not exp:
        return True
    try:
        exp_dt = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
        if exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) >= exp_dt
    except ValueError:
        return True


def _flight_pp(
    supabase: Any,
    *,
    destination_id: str,
    window_id: str,
    origin_iata: str,
) -> Optional[float]:
    result = (
        supabase.table("deal_flight_cache")
        .select("price_pp,status")
        .eq("destination_id", destination_id)
        .eq("window_id", window_id)
        .eq("origin_iata", origin_iata)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return None
    row = rows[0]
    if row.get("status") and row.get("status") != "ok":
        return None
    pp = row.get("price_pp")
    try:
        return float(pp) if pp is not None else None
    except (TypeError, ValueError):
        return None


def _fetch_min_rates(
    client: LiteApiClient,
    *,
    hotel_ids: List[str],
    checkin: str,
    checkout: str,
    adults: int,
    cfg: DealsConfig,
) -> List[Dict[str, Any]]:
    body = {
        "hotelIds": hotel_ids,
        "checkin": checkin,
        "checkout": checkout,
        "occupancies": [{"adults": adults}],
        "currency": cfg.currency,
        "guestNationality": cfg.guest_nationality,
    }
    raw = client.hotels_min_rates(body)
    return parse_min_rates_response(raw)


def build_calendar_cells(
    *,
    windows: Sequence[Dict[str, Any]],
    min_by_window: Dict[str, Optional[Dict[str, Any]]],
    flight_pp_by_window: Dict[str, Optional[float]],
    adults: int,
) -> List[Dict[str, Any]]:
    """Pure assembly of calendar cells (no I/O)."""
    adults = max(1, int(adults or 1))
    cells: List[Dict[str, Any]] = []
    for w in windows:
        wid = str(w["id"])
        hotel = min_by_window.get(wid)
        flight_pp = flight_pp_by_window.get(wid)
        if hotel and flight_pp is not None:
            price_pp = round(
                price_per_person(flight_pp, float(hotel["public_hotel_price"]), adults),
                2,
            )
            status = "ok"
        elif hotel and flight_pp is None:
            price_pp = None
            status = "no_flight"
        elif not hotel and flight_pp is not None:
            price_pp = None
            status = "no_hotel"
        else:
            price_pp = None
            status = "empty"

        cells.append(
            {
                "window_id": wid,
                "kind": w.get("kind"),
                "checkin": w.get("checkin"),
                "checkout": w.get("checkout"),
                "nights": w.get("nights") or 2,
                "hotel_id": hotel.get("hotel_id") if hotel else None,
                "hotel_min_public": (
                    float(hotel["public_hotel_price"]) if hotel else None
                ),
                "flight_pp": flight_pp,
                "price_pp": price_pp,
                "status": status,
            }
        )
    return cells


def refresh_deal_calendar(
    supabase: Any,
    *,
    client: Optional[LiteApiClient] = None,
    cfg: Optional[DealsConfig] = None,
    slugs: Optional[Sequence[str]] = None,
    origins: Optional[Sequence[str]] = None,
    force: bool = False,
) -> Dict[str, Any]:
    """
    Batch: 1 min-rates call per dest × weekend × occupancy, then join flights per origin.
    """
    cfg = cfg or load_deals_config()
    owns = client is None
    client = client or LiteApiClient(cfg=cfg)
    if not cfg.api_key:
        raise LiteApiError("LiteAPI API key required for refresh_deal_calendar")

    weekends_n = max(1, int(getattr(cfg, "calendar_weekends_ahead", 8) or 8))
    summary = {
        "destinations": 0,
        "windows": 0,
        "api_calls": 0,
        "upserted": 0,
        "skipped_fresh": 0,
        "errors": 0,
        "details": [],
    }

    try:
        windows_all = canonical_windows(weekends_n, kinds=cfg.window_kinds)
        upsert_windows(supabase, windows_all)
        summary["windows"] = len(windows_all)

        dest_q = (
            supabase.table("deal_destinations")
            .select("*")
            .eq("active", True)
            .order("priority")
            .execute()
        )
        destinations = list(dest_q.data or [])
        if slugs:
            want = {s.strip().lower() for s in slugs}
            destinations = [
                d for d in destinations if (d.get("slug") or "").lower() in want
            ]
        summary["destinations"] = len(destinations)
        origin_list = _origins(cfg, origins)

        for dest in destinations:
            dest_id = dest["id"]
            pool = (
                supabase.table("hotel_pool")
                .select("hotel_id")
                .eq("destination_id", dest_id)
                .order("pool_rank")
                .execute()
            )
            hotel_ids = [
                str(h["hotel_id"])
                for h in (pool.data or [])
                if h.get("hotel_id")
            ]
            if not hotel_ids:
                summary["details"].append(
                    {"slug": dest.get("slug"), "error": "empty_pool"}
                )
                continue

            for kind in cfg.window_kinds:
                kind_windows = [w for w in windows_all if w.get("kind") == kind]
                if not kind_windows:
                    continue

                for adults in cfg.occupancies:
                    adults_n = int(adults)
                    # Skip if all origins still fresh
                    if not force and all(
                        not _is_calendar_due(
                            supabase,
                            destination_id=dest_id,
                            origin_iata=o,
                            adults=adults_n,
                            window_kind=kind,
                            force=False,
                        )
                        for o in origin_list
                    ):
                        summary["skipped_fresh"] += len(origin_list)
                        continue

                    min_by_window: Dict[str, Optional[Dict[str, Any]]] = {}
                    for w in kind_windows:
                        try:
                            entries = _fetch_min_rates(
                                client,
                                hotel_ids=hotel_ids,
                                checkin=str(w["checkin"]),
                                checkout=str(w["checkout"]),
                                adults=adults_n,
                                cfg=cfg,
                            )
                            summary["api_calls"] += 1
                            min_by_window[str(w["id"])] = cheapest_min_rate(entries)
                        except LiteApiError as e:
                            logger.warning(
                                "calendar_min_rates_fail slug=%s window=%s: %s",
                                dest.get("slug"),
                                w.get("id"),
                                e,
                            )
                            summary["errors"] += 1
                            min_by_window[str(w["id"])] = None

                    now = datetime.now(timezone.utc)
                    expires = _calendar_expires_at(now)

                    for origin in origin_list:
                        if not _is_calendar_due(
                            supabase,
                            destination_id=dest_id,
                            origin_iata=origin,
                            adults=adults_n,
                            window_kind=kind,
                            force=force,
                        ):
                            summary["skipped_fresh"] += 1
                            continue

                        flight_map: Dict[str, Optional[float]] = {}
                        for w in kind_windows:
                            flight_map[str(w["id"])] = _flight_pp(
                                supabase,
                                destination_id=dest_id,
                                window_id=str(w["id"]),
                                origin_iata=origin,
                            )

                        cells = build_calendar_cells(
                            windows=kind_windows,
                            min_by_window=min_by_window,
                            flight_pp_by_window=flight_map,
                            adults=adults_n,
                        )
                        ok_n = sum(1 for c in cells if c.get("status") == "ok")
                        if ok_n == 0:
                            status = "empty"
                        elif ok_n < len(cells):
                            status = "partial"
                        else:
                            status = "ok"

                        row = {
                            "destination_id": dest_id,
                            "origin_iata": origin,
                            "adults": adults_n,
                            "window_kind": kind,
                            "cells": cells,
                            "weekends_requested": len(kind_windows),
                            "fetched_at": now.isoformat(),
                            "expires_at": expires.isoformat(),
                            "status": status,
                        }
                        try:
                            supabase.table("deal_calendar_cache").upsert(
                                row,
                                on_conflict="destination_id,origin_iata,adults,window_kind",
                            ).execute()
                            summary["upserted"] += 1
                        except Exception as e:
                            logger.exception("calendar_upsert_fail: %s", e)
                            summary["errors"] += 1

        return summary
    finally:
        if owns:
            client.close()


def get_deal_calendar(
    supabase: Any,
    *,
    destination_slug: Optional[str] = None,
    destination_id: Optional[str] = None,
    iata_arrival: Optional[str] = None,
    origin: str,
    adults: int = 2,
    window_kind: str = "FRI_SUN",
) -> Optional[Dict[str, Any]]:
    """Cache-only read. Returns None if destination unknown."""
    origin = (origin or "").strip().upper()
    if not origin:
        return None
    adults = max(1, int(adults or 2))
    window_kind = (window_kind or "FRI_SUN").strip().upper()
    if window_kind not in ("FRI_SUN", "SAT_MON"):
        window_kind = "FRI_SUN"

    dest = None
    select = "id,slug,city_name,iata_arrival"
    if destination_id:
        r = (
            supabase.table("deal_destinations")
            .select(select)
            .eq("id", destination_id)
            .limit(1)
            .execute()
        )
        dest = (r.data or [None])[0]
    elif destination_slug:
        r = (
            supabase.table("deal_destinations")
            .select(select)
            .eq("slug", destination_slug.strip().lower())
            .limit(1)
            .execute()
        )
        dest = (r.data or [None])[0]
    elif iata_arrival:
        r = (
            supabase.table("deal_destinations")
            .select(select)
            .eq("iata_arrival", iata_arrival.strip().upper())
            .eq("active", True)
            .limit(1)
            .execute()
        )
        dest = (r.data or [None])[0]
    if not dest:
        return None

    cache = (
        supabase.table("deal_calendar_cache")
        .select("*")
        .eq("destination_id", dest["id"])
        .eq("origin_iata", origin)
        .eq("adults", adults)
        .eq("window_kind", window_kind)
        .limit(1)
        .execute()
    )
    rows = cache.data or []
    if not rows:
        return {
            "destination": dest,
            "origin_iata": origin,
            "adults": adults,
            "window_kind": window_kind,
            "cells": [],
            "status": "missing",
            "fetched_at": None,
            "expires_at": None,
        }

    row = rows[0]
    return {
        "destination": dest,
        "origin_iata": origin,
        "adults": adults,
        "window_kind": window_kind,
        "cells": row.get("cells") or [],
        "status": row.get("status") or "ok",
        "fetched_at": row.get("fetched_at"),
        "expires_at": row.get("expires_at"),
    }
