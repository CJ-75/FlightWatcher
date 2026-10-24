"""
Materialize hotel onto deals_active at write time (after rates refresh).

List path must NOT compose — it only reads hotel_top3 + overlays pool photos.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

logger = logging.getLogger("deals.materialize_wall")


def _parse_ymd(s: Any) -> Optional[date]:
    try:
        return date.fromisoformat(str(s)[:10])
    except (TypeError, ValueError):
        return None


def _hotel_has_photo(h: Any) -> bool:
    if not isinstance(h, dict):
        return False
    for k in ("photo", "thumbnail", "main_photo", "mainPhoto"):
        v = h.get(k)
        if isinstance(v, str) and v.strip():
            return True
    return False


def _hotel_has_price(h: Any) -> bool:
    if not isinstance(h, dict):
        return False
    for k in ("public_hotel_price", "public_price"):
        try:
            if float(h.get(k) or 0) > 0:
                return True
        except (TypeError, ValueError):
            continue
    return False


def hotel_top3_ready(hotels: Any) -> bool:
    """Skip work when first hotel already has photo + bookable price."""
    if not isinstance(hotels, list) or not hotels:
        return False
    h0 = hotels[0]
    return _hotel_has_photo(h0) and _hotel_has_price(h0)


def batch_load_destinations(
    supabase: Any, iatas: Sequence[str]
) -> Dict[str, Dict[str, Any]]:
    from deals.upsell import find_destination_by_iata

    out: Dict[str, Dict[str, Any]] = {}
    for raw in iatas:
        code = (raw or "").strip().upper()
        if not code or code in out:
            continue
        dest = find_destination_by_iata(supabase, code)
        if dest:
            out[code] = dest
    return out


def batch_load_rates(
    supabase: Any,
    *,
    dest_ids: Sequence[str],
    adults: int = 2,
) -> Dict[Tuple[str, str, str, int], Dict[str, Any]]:
    """
    One (or few) queries: all ok rates for destinations, keyed by
    (destination_id, checkin, checkout, adults).
    """
    ids = [str(d) for d in dest_ids if d]
    if not ids or not supabase:
        return {}
    from deals.upsell import _rates_row_to_lookup

    out: Dict[Tuple[str, str, str, int], Dict[str, Any]] = {}
    try:
        for i in range(0, len(ids), 40):
            chunk = ids[i : i + 40]
            res = (
                supabase.table("hotel_rates_cache")
                .select(
                    "destination_id,checkin,checkout,adults,top,status,"
                    "expires_at,fetched_at"
                )
                .in_("destination_id", chunk)
                .eq("status", "ok")
                .eq("adults", int(adults))
                .execute()
            )
            for row in res.data or []:
                looked = _rates_row_to_lookup(row)
                if not looked:
                    continue
                did = str(row.get("destination_id") or "")
                cin = str(row.get("checkin") or "")[:10]
                cout = str(row.get("checkout") or "")[:10]
                a = int(row.get("adults") or adults)
                if did and cin and cout:
                    out[(did, cin, cout, a)] = looked
    except Exception as e:
        logger.warning("batch_load_rates: %s", e)
    return out


def batch_pool_by_dest(
    supabase: Any, dest_ids: Sequence[str], *, limit_per_dest: int = 3
) -> Dict[str, List[Dict[str, Any]]]:
    """destination_id → up to N pool hotels that already have a photo."""
    from deals.pool_photos import extract_main_photo

    ids = [str(d) for d in dest_ids if d]
    if not ids or not supabase:
        return {}
    out: Dict[str, List[Dict[str, Any]]] = {d: [] for d in ids}
    try:
        for i in range(0, len(ids), 40):
            chunk = ids[i : i + 40]
            res = (
                supabase.table("hotel_pool")
                .select(
                    "destination_id,hotel_id,name,stars,rating,review_count,"
                    "distance_m,main_photo,thumbnail,board,pool_rank,raw"
                )
                .in_("destination_id", chunk)
                .order("pool_rank")
                .limit(max(12, limit_per_dest * len(chunk)))
                .execute()
            )
            for h in res.data or []:
                did = str(h.get("destination_id") or "")
                if did not in out:
                    continue
                if len(out[did]) >= limit_per_dest:
                    continue
                photo = extract_main_photo(h)
                if not photo:
                    continue
                hid = h.get("hotel_id")
                out[did].append(
                    {
                        "id": str(hid) if hid is not None else "",
                        "hotel_id": hid,
                        "name": h.get("name"),
                        "stars": h.get("stars"),
                        "rating": h.get("rating"),
                        "review_count": h.get("review_count"),
                        "distance_m": h.get("distance_m"),
                        "board": h.get("board"),
                        "photo": photo,
                        "thumbnail": photo,
                        "main_photo": photo,
                        # no public_hotel_price → soft fill at read
                    }
                )
    except Exception as e:
        logger.warning("batch_pool_by_dest: %s", e)
    return out


def materialize_deals_wall(
    supabase: Any,
    *,
    adults: int = 2,
    limit: int = 800,
    force: bool = False,
) -> Dict[str, Any]:
    """
    Write hotel_top3 onto deals_active from rates cache (+ pool photo fallback).
    Call after refresh_deal_rates.
    """
    if not supabase:
        return {"ok": False, "error": "no_supabase"}

    try:
        res = (
            supabase.table("deals_active")
            .select(
                "deal_key,dest_iata,out_date,ret_date,hotel_top3,"
                "flight_snapshot,status"
            )
            .eq("status", "active")
            .limit(max(1, min(int(limit), 2000)))
            .execute()
        )
        rows = list(res.data or [])
    except Exception as e:
        return {"ok": False, "error": str(e)}

    need = []
    skipped_ready = 0
    for row in rows:
        if not force and hotel_top3_ready(row.get("hotel_top3")):
            skipped_ready += 1
            continue
        need.append(row)

    iatas = [str(r.get("dest_iata") or "").upper() for r in need]
    dest_map = batch_load_destinations(supabase, iatas)
    dest_ids = [str(d["id"]) for d in dest_map.values()]
    rates = batch_load_rates(supabase, dest_ids=dest_ids, adults=adults)
    pools = batch_pool_by_dest(supabase, dest_ids, limit_per_dest=3)

    from deals.hotel_budget import filter_hotels_for_flight
    from deals.pool_photos import overlay_pool_photos, photos_map_from_pool

    updated = 0
    soft = 0
    with_rates = 0
    errors = 0
    now = datetime.now(timezone.utc).isoformat()

    # Collect hotel ids for photo overlay across rate tops
    all_hids: List[str] = []
    pending_payloads: List[Tuple[str, List[Dict[str, Any]], bool]] = []

    for row in need:
        key = row.get("deal_key")
        if not key:
            continue
        iata = str(row.get("dest_iata") or "").upper()
        dest = dest_map.get(iata)
        cin = str(row.get("out_date") or "")[:10]
        cout = str(row.get("ret_date") or "")[:10]
        flight = row.get("flight_snapshot") or {}
        try:
            flight_pp = float(flight.get("price_pp_eur") or 0) or None
        except (TypeError, ValueError):
            flight_pp = None

        hotel_payload: Optional[List[Dict[str, Any]]] = None
        is_soft = False
        if dest:
            looked = rates.get((str(dest["id"]), cin, cout, int(adults)))
            if looked:
                top = looked.get("top") or ([looked["offer"]] if looked.get("offer") else [])
                ranked = filter_hotels_for_flight(
                    top if isinstance(top, list) else [],
                    flight_pp=flight_pp,
                    adults=adults,
                    top_n=3,
                    require_photo=False,
                    checkin=cin,
                    checkout=cout,
                )
                if ranked:
                    hotel_payload = ranked
                    with_rates += 1
            if not hotel_payload:
                pool = pools.get(str(dest["id"])) or []
                if pool:
                    hotel_payload = pool
                    is_soft = True
                    soft += 1

        if not hotel_payload:
            continue

        for h in hotel_payload:
            if isinstance(h, dict):
                hid = h.get("hotel_id") or h.get("id")
                if hid:
                    all_hids.append(str(hid))
        pending_payloads.append((str(key), hotel_payload, is_soft))

    photo_map = photos_map_from_pool(supabase, all_hids)

    for deal_key, payload, is_soft in pending_payloads:
        try:
            with_photos = overlay_pool_photos(payload, photo_map)
            # Drop hotels still without photo (card rule)
            with_photos = [h for h in with_photos if _hotel_has_photo(h)]
            if not with_photos:
                continue
            supabase.table("deals_active").update(
                {
                    "hotel_top3": with_photos,
                    "updated_at": now,
                }
            ).eq("deal_key", deal_key).execute()
            updated += 1
        except Exception as e:
            errors += 1
            logger.warning("materialize %s: %s", deal_key, e)

    try:
        from deals.community_list import invalidate_list_cache

        invalidate_list_cache()
    except Exception:
        pass

    summary = {
        "ok": True,
        "scanned": len(rows),
        "needed": len(need),
        "skipped_ready": skipped_ready,
        "updated": updated,
        "with_rates": with_rates,
        "soft_fill": soft,
        "errors": errors,
        "at": now,
    }
    logger.info("materialize_deals_wall %s", summary)
    return summary
