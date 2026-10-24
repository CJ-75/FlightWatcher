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


def _hotel_id(h: Any) -> Optional[str]:
    if not isinstance(h, dict):
        return None
    hid = h.get("hotel_id") or h.get("id")
    return str(hid) if hid is not None and str(hid).strip() else None


def primary_hotel_id(hotels: Any) -> Optional[str]:
    if not isinstance(hotels, list) or not hotels:
        return None
    return _hotel_id(hotels[0])


def pick_diverse_hotels(
    candidates: Sequence[Any],
    *,
    used_ids: Set[str],
    top_n: int = 1,
    allow_reuse: bool = False,
) -> List[Dict[str, Any]]:
    """
    Prefer hotels not already used as a card primary (global wall set).
    Default allow_reuse=False → empty if nothing unique left (stricter).
    """
    clean: List[Dict[str, Any]] = [h for h in candidates if isinstance(h, dict)]
    if not clean:
        return []
    n = max(1, int(top_n))
    fresh: List[Dict[str, Any]] = []
    for h in clean:
        hid = _hotel_id(h)
        if not hid or hid in used_ids:
            continue
        fresh.append(h)
        if len(fresh) >= n:
            break
    if fresh:
        return fresh[:n]
    if allow_reuse:
        return clean[:n]
    return []


def collect_duplicate_primary_keys(rows: Sequence[Dict[str, Any]]) -> Set[str]:
    """deal_keys whose primary hotel_id appears on more than one active card."""
    counts: Dict[str, List[str]] = {}
    for row in rows:
        prim = primary_hotel_id(row.get("hotel_top3"))
        key = str(row.get("deal_key") or "")
        if not prim or not key:
            continue
        counts.setdefault(prim, []).append(key)
    dup_keys: Set[str] = set()
    for _hid, keys in counts.items():
        if len(keys) > 1:
            # Keep first occurrence; force reassign the rest
            dup_keys.update(keys[1:])
    return dup_keys


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
    supabase: Any, dest_ids: Sequence[str], *, limit_per_dest: int = 24
) -> Dict[str, List[Dict[str, Any]]]:
    """destination_id → up to N pool hotels with photo (enough to diversify cards)."""
    from deals.pool_photos import extract_main_photo

    ids = [str(d) for d in dest_ids if d]
    if not ids or not supabase:
        return {}
    out: Dict[str, List[Dict[str, Any]]] = {d: [] for d in ids}
    try:
        for i in range(0, len(ids), 40):
            chunk = ids[i : i + 40]
            # Fetch a wide slice then bucket per dest (PostgREST can't LIMIT PER GROUP)
            res = (
                supabase.table("hotel_pool")
                .select(
                    "destination_id,hotel_id,name,stars,rating,review_count,"
                    "distance_m,main_photo,thumbnail,board,pool_rank,raw"
                )
                .in_("destination_id", chunk)
                .order("pool_rank")
                .limit(max(limit_per_dest * len(chunk), 48))
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

    dup_keys = collect_duplicate_primary_keys(rows)
    need = []
    skipped_ready = 0
    # Global wall set: one hotel_id = one card primary max
    used_global: Set[str] = set()
    for row in rows:
        key = str(row.get("deal_key") or "")
        prim = primary_hotel_id(row.get("hotel_top3"))
        must_fix = force or key in dup_keys or not hotel_top3_ready(
            row.get("hotel_top3")
        )
        if not must_fix:
            if prim:
                used_global.add(prim)
            skipped_ready += 1
            continue
        need.append(row)

    all_iatas = list(
        {
            str(r.get("dest_iata") or "").upper()
            for r in rows
            if str(r.get("dest_iata") or "").strip()
        }
    )
    dest_map = batch_load_destinations(supabase, all_iatas)
    dest_ids = [str(d["id"]) for d in dest_map.values()]
    rates = batch_load_rates(supabase, dest_ids=dest_ids, adults=adults)
    pools = batch_pool_by_dest(supabase, dest_ids, limit_per_dest=40)

    from deals.hotel_budget import filter_hotels_for_flight
    from deals.pool_photos import overlay_pool_photos, photos_map_from_pool

    updated = 0
    soft = 0
    with_rates = 0
    errors = 0
    diversified = 0
    skipped_no_unique = 0
    now = datetime.now(timezone.utc).isoformat()

    all_hids: List[str] = []
    pending_payloads: List[Tuple[str, str, List[Dict[str, Any]], bool]] = []

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
        dest_id = str(dest["id"]) if dest else ""

        if dest:
            looked = rates.get((dest_id, cin, cout, int(adults)))
            ranked: List[Dict[str, Any]] = []
            if looked:
                top = looked.get("top") or (
                    [looked["offer"]] if looked.get("offer") else []
                )
                ranked = filter_hotels_for_flight(
                    top if isinstance(top, list) else [],
                    flight_pp=flight_pp,
                    adults=adults,
                    top_n=12,
                    require_photo=False,
                    checkin=cin,
                    checkout=cout,
                )
            pool = pools.get(dest_id) or []
            # Merge rates then pool — first unique primary wins
            candidates = list(ranked) + [
                h for h in pool if _hotel_id(h) not in {_hotel_id(x) for x in ranked}
            ]
            picked = pick_diverse_hotels(
                candidates, used_ids=used_global, top_n=1, allow_reuse=False
            )
            if not picked:
                skipped_no_unique += 1
                continue
            prim_id = _hotel_id(picked[0])
            used_alts = set(used_global)
            if prim_id:
                used_alts.add(prim_id)
            alts = pick_diverse_hotels(
                [h for h in candidates if _hotel_id(h) and _hotel_id(h) != prim_id],
                used_ids=used_alts,
                top_n=2,
                allow_reuse=False,
            )
            hotel_payload = picked + alts
            if ranked and any(_hotel_id(h) == prim_id for h in ranked):
                with_rates += 1
            else:
                is_soft = True
                soft += 1

        if not hotel_payload:
            continue

        prim = _hotel_id(hotel_payload[0])
        if not prim or prim in used_global:
            skipped_no_unique += 1
            continue
        used_global.add(prim)
        diversified += 1

        for h in hotel_payload:
            hid = _hotel_id(h)
            if hid:
                all_hids.append(hid)
        pending_payloads.append((str(key), dest_id, hotel_payload, is_soft))

    photo_map = photos_map_from_pool(supabase, all_hids)

    for deal_key, _dest_id, payload, is_soft in pending_payloads:
        try:
            with_photos = overlay_pool_photos(payload, photo_map)
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
        "diversified_primaries": diversified,
        "duplicate_keys_forced": len(dup_keys),
        "skipped_no_unique_hotel": skipped_no_unique,
        "errors": errors,
        "at": now,
    }
    logger.info("materialize_deals_wall %s", summary)
    return summary
