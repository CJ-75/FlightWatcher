"""Batch refresh of hotel_rates_cache (LiteAPI /hotels/rates + scoring + TTL)."""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from deals.hotel_scoring import build_candidates
from deals.liteapi_client import LiteApiClient, LiteApiError
from deals.liteapi_config import DealsConfig, load_deals_config
from deals.ttl import expires_at_for
from deals.windows import canonical_windows, upsert_windows

logger = logging.getLogger("deals.hotel_rates")


def is_due(
    supabase: Any,
    *,
    destination_id: str,
    window_id: str,
    adults: int,
    force: bool = False,
) -> bool:
    """True if no cache row or expires_at is past."""
    if force:
        return True
    result = (
        supabase.table("hotel_rates_cache")
        .select("expires_at,status")
        .eq("destination_id", destination_id)
        .eq("window_id", window_id)
        .eq("adults", adults)
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


def _any_late_arrival(
    supabase: Any, *, destination_id: str, window_id: str
) -> bool:
    result = (
        supabase.table("deal_flight_cache")
        .select("late_arrival")
        .eq("destination_id", destination_id)
        .eq("window_id", window_id)
        .eq("status", "ok")
        .eq("late_arrival", True)
        .limit(1)
        .execute()
    )
    return bool(result.data)


def _load_pool(supabase: Any, destination_id: str) -> List[Dict[str, Any]]:
    result = (
        supabase.table("hotel_pool")
        .select("*")
        .eq("destination_id", destination_id)
        .order("pool_rank")
        .execute()
    )
    return list(result.data or [])


def _pool_by_id(pool: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for h in pool:
        hid = str(h.get("hotel_id") or "")
        if hid:
            out[hid] = h
    return out


def _upsert_rates_cache(supabase: Any, row: Dict[str, Any]) -> None:
    supabase.table("hotel_rates_cache").upsert(
        row,
        on_conflict="destination_id,window_id,adults",
    ).execute()


def _fetch_rates(
    client: LiteApiClient,
    *,
    hotel_ids: List[str],
    checkin: str,
    checkout: str,
    adults: int,
    timeout: float,
) -> Tuple[Any, str]:
    """Returns (payload, status_note). Retries once with top 20 on timeout."""
    body = {
        "hotelIds": hotel_ids,
        "checkin": checkin,
        "checkout": checkout,
        "occupancies": [{"adults": adults}],
        "maxRatesPerHotel": 3,
        "includeHotelData": False,
        "timeout": int(timeout),
    }
    try:
        return client.hotels_rates(body, timeout=timeout), "ok"
    except LiteApiError as e:
        msg = str(e).lower()
        is_timeout = "timeout" in msg or e.status_code in (408, 504)
        if is_timeout and len(hotel_ids) > 20:
            logger.warning(
                "rates_timeout retry_top20 checkin=%s hotels=%s",
                checkin,
                min(20, len(hotel_ids)),
            )
            body["hotelIds"] = hotel_ids[:20]
            body["timeout"] = int(timeout) + 2
            try:
                return client.hotels_rates(body, timeout=timeout + 2), "ok_retry_top20"
            except LiteApiError as e2:
                raise e2 from e
        raise


def _fallback_geo_rates(
    client: LiteApiClient,
    dest: Dict[str, Any],
    *,
    checkin: str,
    checkout: str,
    adults: int,
    timeout: float,
) -> Any:
    """
    Last resort: rates without explicit hotelIds is not supported by LiteAPI.
    Instead re-query hotel list by geo with quality filters, then rates on those IDs.
    """
    from deals.hotel_pool import extract_hotels_list

    lat = float(dest["center_lat"])
    lng = float(dest["center_lng"])
    radius = max(1000, int(dest.get("pool_radius_m") or 2000) + 500)
    listing = client.list_hotels(
        latitude=lat,
        longitude=lng,
        radius=radius,
        limit=40,
        min_rating=8.0,
        min_reviews_count=200,
        star_rating="3.0,3.5,4.0,4.5",
    )
    hotels = extract_hotels_list(listing)
    ids = []
    for h in hotels:
        hid = h.get("id") or h.get("hotelId")
        if hid:
            ids.append(str(hid))
        if len(ids) >= 25:
            break
    if not ids:
        return None
    body = {
        "hotelIds": ids,
        "checkin": checkin,
        "checkout": checkout,
        "occupancies": [{"adults": adults}],
        "maxRatesPerHotel": 3,
        "timeout": int(timeout),
    }
    return client.hotels_rates(body, timeout=timeout)


def refresh_one_combo(
    supabase: Any,
    client: LiteApiClient,
    *,
    dest: Dict[str, Any],
    window: Dict[str, Any],
    adults: int,
    cfg: DealsConfig,
    force: bool = False,
    require_flight: bool = True,
) -> Dict[str, Any]:
    dest_id = dest["id"]
    window_id = window["id"]
    slug = dest.get("slug")
    key = f"{slug}|{window_id}|a{adults}"
    fetched = datetime.now(timezone.utc).isoformat()
    expires = expires_at_for(window["checkin"]).isoformat()

    if not is_due(
        supabase,
        destination_id=dest_id,
        window_id=window_id,
        adults=adults,
        force=force,
    ):
        return {"key": key, "status": "skipped_fresh"}

    # v3.3 FREE windows (community deal dates): no deal_flight_cache gate
    kind = str(window.get("kind") or "")
    skip_flight = (not require_flight) or kind == "FREE"
    if not skip_flight:
        from deals.flight_cache import has_valid_roundtrip

        if not has_valid_roundtrip(
            supabase,
            destination_id=dest_id,
            window_id=window_id,
            max_pp=cfg.budget_flight_pp,
        ):
            _upsert_rates_cache(
                supabase,
                {
                    "destination_id": dest_id,
                    "window_id": window_id,
                    "checkin": window["checkin"],
                    "checkout": window["checkout"],
                    "adults": adults,
                    "top": [],
                    "pool_size_requested": 0,
                    "hotels_returned": 0,
                    "fetched_at": fetched,
                    "expires_at": expires,
                    "status": "skipped_no_flight",
                },
            )
            return {"key": key, "status": "skipped_no_flight"}

    pool = _load_pool(supabase, dest_id)
    if not pool:
        _upsert_rates_cache(
            supabase,
            {
                "destination_id": dest_id,
                "window_id": window_id,
                "checkin": window["checkin"],
                "checkout": window["checkout"],
                "adults": adults,
                "top": [],
                "pool_size_requested": 0,
                "hotels_returned": 0,
                "fetched_at": fetched,
                "expires_at": expires,
                "status": "error",
            },
        )
        return {"key": key, "status": "error", "error": "empty_pool"}

    hotel_ids = [str(h["hotel_id"]) for h in pool if h.get("hotel_id")]
    pool_map = _pool_by_id(pool)
    late = False
    if not skip_flight:
        try:
            late = _any_late_arrival(
                supabase, destination_id=dest_id, window_id=window_id
            )
        except Exception:
            late = False
    radius = int(dest.get("pool_radius_m") or 2000)

    try:
        payload, note = _fetch_rates(
            client,
            hotel_ids=hotel_ids,
            checkin=window["checkin"],
            checkout=window["checkout"],
            adults=adults,
            timeout=cfg.timeout_s,
        )
        cands = build_candidates(
            payload,
            pool_map,
            pool_radius_m=radius,
            adults=adults,
            late_arrival=late,
            weights=cfg.score_weights,
            top_n=12,
        )
        if not cands:
            logger.info("no_rates_fallback_geo key=%s", key)
            try:
                fb = _fallback_geo_rates(
                    client,
                    dest,
                    checkin=window["checkin"],
                    checkout=window["checkout"],
                    adults=adults,
                    timeout=cfg.timeout_s,
                )
                # For fallback, enrich pool_map with minimal meta from response if needed
                cands = build_candidates(
                    fb,
                    pool_map,
                    pool_radius_m=radius,
                    adults=adults,
                    late_arrival=late,
                    weights=cfg.score_weights,
                    top_n=12,
                )
                # If still empty because hotels not in pool, build loose map from offers
                if not cands and fb:
                    from deals.hotel_scoring import extract_hotels_from_rates, iter_room_offers

                    loose: Dict[str, Dict[str, Any]] = {}
                    for h in extract_hotels_from_rates(fb):
                        hid = str(h.get("hotelId") or h.get("id") or "")
                        if hid:
                            loose[hid] = {
                                "hotel_id": hid,
                                "name": h.get("name"),
                                "stars": h.get("stars"),
                                "rating": h.get("rating"),
                                "review_count": h.get("reviewCount") or 0,
                                "distance_m": 0,
                                "has_24h_reception": False,
                                "main_photo": h.get("main_photo"),
                                "thumbnail": h.get("thumbnail"),
                            }
                    if loose:
                        cands = build_candidates(
                            fb,
                            loose,
                            pool_radius_m=radius,
                            adults=adults,
                            late_arrival=late,
                            weights=cfg.score_weights,
                            top_n=12,
                        )
            except Exception as fe:
                logger.warning("fallback_geo_failed key=%s: %s", key, fe)

        hotels_returned = 0
        try:
            from deals.hotel_scoring import extract_hotels_from_rates

            hotels_returned = len(extract_hotels_from_rates(payload))
        except Exception:
            pass

        status = "ok" if cands else "no_rates"
        _upsert_rates_cache(
            supabase,
            {
                "destination_id": dest_id,
                "window_id": window_id,
                "checkin": window["checkin"],
                "checkout": window["checkout"],
                "adults": adults,
                "top": cands,
                "pool_size_requested": len(hotel_ids),
                "hotels_returned": hotels_returned,
                "fetched_at": fetched,
                "expires_at": expires,
                "status": status,
            },
        )
        logger.info(
            "rates_done key=%s status=%s top=%s note=%s ssp_missing=%s",
            key,
            status,
            len(cands),
            note,
            sum(1 for c in cands if c.get("ssp_missing")),
        )
        return {
            "key": key,
            "status": status,
            "top": len(cands),
            "pool_size": len(hotel_ids),
            "hotels_returned": hotels_returned,
            "note": note,
        }
    except LiteApiError as e:
        status = "timeout" if "timeout" in str(e).lower() else "error"
        _upsert_rates_cache(
            supabase,
            {
                "destination_id": dest_id,
                "window_id": window_id,
                "checkin": window["checkin"],
                "checkout": window["checkout"],
                "adults": adults,
                "top": [],
                "pool_size_requested": len(hotel_ids),
                "hotels_returned": 0,
                "fetched_at": fetched,
                "expires_at": expires,
                "status": status,
            },
        )
        logger.warning("rates_error key=%s status=%s err=%s", key, status, e)
        return {"key": key, "status": status, "error": str(e)}
    except Exception as e:
        logger.exception("rates_unexpected key=%s", key)
        try:
            _upsert_rates_cache(
                supabase,
                {
                    "destination_id": dest_id,
                    "window_id": window_id,
                    "checkin": window["checkin"],
                    "checkout": window["checkout"],
                    "adults": adults,
                    "top": [],
                    "pool_size_requested": len(hotel_ids),
                    "hotels_returned": 0,
                    "fetched_at": fetched,
                    "expires_at": expires,
                    "status": "error",
                },
            )
        except Exception:
            pass
        return {"key": key, "status": "error", "error": str(e)}


def refresh_hotel_rates(
    supabase: Any,
    *,
    client: Optional[LiteApiClient] = None,
    cfg: Optional[DealsConfig] = None,
    slugs: Optional[Sequence[str]] = None,
    force: bool = False,
) -> Dict[str, Any]:
    """
    Process due (dest × window × occupancy) combos with limited concurrency.
    Never raises for a single combo failure.
    """
    cfg = cfg or load_deals_config()
    owns = client is None
    client = client or LiteApiClient(cfg=cfg)
    if not cfg.api_key:
        raise LiteApiError("LiteAPI API key required for refresh_hotel_rates")

    try:
        windows = canonical_windows(cfg.weekends_ahead, kinds=cfg.window_kinds)
        upsert_windows(supabase, windows)

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

        combos: List[Tuple[Dict[str, Any], Dict[str, Any], int]] = []
        for dest in destinations:
            for w in windows:
                for adults in cfg.occupancies:
                    combos.append((dest, w, int(adults)))

        results: List[Dict[str, Any]] = []
        api_calls = 0
        workers = max(1, min(int(cfg.max_concurrency), 8))

        def _run(item: Tuple[Dict[str, Any], Dict[str, Any], int]) -> Dict[str, Any]:
            dest, w, adults = item
            # Fresh check before calling API (reduces wasted work under concurrency)
            if not force and not is_due(
                supabase,
                destination_id=dest["id"],
                window_id=w["id"],
                adults=adults,
            ):
                return {
                    "key": f"{dest.get('slug')}|{w['id']}|a{adults}",
                    "status": "skipped_fresh",
                }
            out = refresh_one_combo(
                supabase,
                client,
                dest=dest,
                window=w,
                adults=adults,
                cfg=cfg,
                force=force,
            )
            return out

        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = [ex.submit(_run, c) for c in combos]
            for fut in as_completed(futs):
                try:
                    r = fut.result()
                except Exception as e:
                    r = {"status": "error", "error": str(e)}
                results.append(r)
                if r.get("status") in ("ok", "no_rates", "timeout", "error") and r.get(
                    "status"
                ) not in ("skipped_fresh", "skipped_no_flight"):
                    # approximate: each non-skip that attempted rates
                    if r.get("status") != "skipped_no_flight":
                        api_calls += 1

        # recount api-ish statuses more accurately
        attempted = [
            r
            for r in results
            if r.get("status")
            in ("ok", "no_rates", "timeout", "error", "ok_retry_top20")
            or r.get("note")
        ]
        summary = {
            "destinations": len(destinations),
            "windows": len(windows),
            "occupancies": list(cfg.occupancies),
            "combos": len(combos),
            "ok": sum(1 for r in results if r.get("status") == "ok"),
            "no_rates": sum(1 for r in results if r.get("status") == "no_rates"),
            "skipped_no_flight": sum(
                1 for r in results if r.get("status") == "skipped_no_flight"
            ),
            "skipped_fresh": sum(
                1 for r in results if r.get("status") == "skipped_fresh"
            ),
            "timeout": sum(1 for r in results if r.get("status") == "timeout"),
            "errors": sum(1 for r in results if r.get("status") == "error"),
            "liteapi_calls_approx": len(attempted),
            "concurrency": workers,
            "results": results,
        }
        logger.info(
            "refresh_hotel_rates_done ok=%s no_rates=%s skipped_flight=%s fresh=%s errors=%s calls≈%s",
            summary["ok"],
            summary["no_rates"],
            summary["skipped_no_flight"],
            summary["skipped_fresh"],
            summary["errors"],
            summary["liteapi_calls_approx"],
        )
        return summary
    finally:
        if owns:
            client.close()
