"""
Assemble community deals_active rows into TravelDeal-shaped dicts for the API.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

_list_cache_lock = threading.Lock()
_list_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_LIST_CACHE_TTL_S = 45.0
_flag_cache_lock = threading.Lock()
_flag_cache: Dict[str, Tuple[float, Any]] = {}
_FLAG_CACHE_TTL_S = 60.0


def _verified_today_label(last_verified_at: Any) -> Optional[str]:
    if not last_verified_at:
        return None
    try:
        dt = datetime.fromisoformat(str(last_verified_at).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if dt.date() == now.date():
            return "Prix vérifié aujourd'hui"
    except ValueError:
        return None
    return None


def badge_for_baseline(baseline: Dict[str, Any]) -> Dict[str, Any]:
    """
    Honest badge: flight-only vs usual price (30d).
    reliable → percent; estimated → soft label.
    """
    kind = baseline.get("baseline_kind") or "observed"
    disc = baseline.get("discount_pct")
    if kind == "estimated" or disc is None:
        return {
            "label": "Très bon prix",
            "discount_pct": None,
            "scope": "flight",
            "tooltip": (
                "Comparaison estimée au prix attendu sur ce type de trajet "
                "(historique encore limité sur FlightWatcher)."
            ),
        }
    return {
        "label": f"Vol −{int(round(float(disc)))} % moins cher que d'habitude",
        "discount_pct": float(disc),
        "scope": "flight",
        "tooltip": (
            "Par rapport au prix médian observé sur FlightWatcher pour ce trajet "
            "et cette période, sur les 30 derniers jours. Ce n'est pas une promo compagnie."
        ),
    }


def _hotel_photo(h: Optional[Dict[str, Any]]) -> Optional[str]:
    if not isinstance(h, dict):
        return None
    for key in ("photo", "thumbnail", "main_photo", "mainPhoto"):
        val = h.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


def _normalize_hotel(h: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(h, dict):
        return None
    photo = _hotel_photo(h)
    hid = h.get("id") or h.get("hotel_id") or ""
    out = {**h, "id": str(hid), "hotel_id": h.get("hotel_id") or hid}
    if photo:
        out["photo"] = photo
        out.setdefault("thumbnail", photo)
    return out


def row_to_travel_deal(
    row: Dict[str, Any],
    *,
    adults: int = 2,
    baselines_fresh: bool = True,
) -> Dict[str, Any]:
    from deals.baseline_guard import soften_badge_if_stale
    from deals.verification import (
        LEVEL_CACHED,
        LEVEL_LIVE,
        badge_for_deal_level,
    )

    flight = row.get("flight_snapshot") or {}
    baseline = row.get("baseline_snapshot") or {}
    raw_hotels = row.get("hotel_top3") or []
    hotels = [h for h in (_normalize_hotel(x) for x in raw_hotels) if h]
    hotel = hotels[0] if hotels else None
    price_flight = float(flight.get("price_pp_eur") or 0)
    city = flight.get("city_name") or row.get("dest_iata") or ""
    vlevel = (
        row.get("verification_level")
        or flight.get("verification_level")
        or LEVEL_LIVE
    )
    raw_badge = badge_for_baseline(baseline)
    if vlevel == LEVEL_CACHED:
        badge = badge_for_deal_level(raw_badge, verification_level=LEVEL_CACHED)
    else:
        badge = soften_badge_if_stale(raw_badge, baselines_fresh=baselines_fresh)
        badge = badge_for_deal_level(badge, verification_level=LEVEL_LIVE)

    hotel_pp = None
    hotel_name = None
    hotel_stars = None
    if hotel and isinstance(hotel, dict):
        hotel_name = hotel.get("name") or hotel.get("hotel_name")
        hotel_stars = hotel.get("stars")
        # public total / adults if present
        public = (
            hotel.get("public_hotel_price")
            or hotel.get("public_price")
            or hotel.get("total")
            or hotel.get("price")
        )
        if public is not None:
            try:
                hotel_pp = round(float(public) / max(1, adults), 2)
            except (TypeError, ValueError):
                hotel_pp = None

    price_pp = price_flight
    if hotel_pp is not None:
        price_pp = round(price_flight + hotel_pp, 2)

    out_date = str(row.get("out_date") or "")[:10]
    ret_date = str(row.get("ret_date") or "")[:10]
    verified = _verified_today_label(row.get("last_verified_at"))

    # Lot D — baggage + airport labels (enriched by list_community_deals)
    baggage = row.get("_baggage") or {}
    route = row.get("_route_labels") or {}
    price_pax_note = None
    if adults > 2:
        price_pax_note = "Prix pour 1–2 voyageurs"

    hotel_image = _hotel_photo(hotel) or ""

    return {
        "id": row.get("deal_key"),
        "deal_key": row.get("deal_key"),
        "title": f"Week-end à {city}" if city else "Deal",
        "city": city,
        "country": "",
        # Prefer hôtel photo so same-city deals don't share one city stock image
        "image_url": hotel_image,
        "price_per_person": price_pp,
        "currency": "EUR",
        "nights": int(row.get("nights") or 2),
        "departure_airport": row.get("origin_iata"),
        "origin_iata": row.get("origin_iata"),
        "destination": row.get("dest_iata"),
        "dates": {"outbound": out_date, "inbound": ret_date},
        "hotel_name": hotel_name,
        "hotel_stars": hotel_stars,
        "provider": "community",
        "booking_url": flight.get("booking_url") or "",
        "badge": badge.get("label"),
        "badge_meta": badge,
        "adults": adults,
        "baggage_line": baggage.get("line"),
        "route_hint": route.get("route_hint"),
        "origin_airport_label": route.get("origin_airport_label"),
        "arrival_airport_label": route.get("arrival_airport_label"),
        "distance_label": route.get("distance_label"),
        "price_pax_note": price_pax_note,
        "flight": {
            "price_pp": price_flight,
            "provider": flight.get("provider"),
            "carrier": flight.get("carrier"),
            "airline": flight.get("carrier"),
            "booking_url": flight.get("booking_url"),
            "direct": flight.get("direct", True),
            "out_dep_local": flight.get("out_dep_local"),
            "ret_dep_local": flight.get("ret_dep_local"),
            "verification_level": vlevel,
            "origin_iata": row.get("origin_iata"),
            "destination_iata": row.get("dest_iata"),
        },
        "hotel": hotel,
        "alt_hotels": hotels[1:3] if hotels else [],
        "price_breakdown": {
            "flight_pp": price_flight,
            "hotel_pp": hotel_pp,
            "total_pp": price_pp,
        },
        "flags": {
            "has_hotel": bool(hotel),
            "source_mix": row.get("source_mix"),
            "verified_label": verified if vlevel != LEVEL_CACHED else None,
            "verification_level": vlevel,
            "price_pax_note": price_pax_note,
        },
        "verification_level": vlevel,
        "deal_score": row.get("deal_score"),
        "fetched_at": row.get("last_verified_at"),
        "served_city_id": row.get("served_city_id"),
    }


def _cached_flag(key: str, compute) -> Any:
    now = time.monotonic()
    with _flag_cache_lock:
        hit = _flag_cache.get(key)
        if hit and now - hit[0] < _FLAG_CACHE_TTL_S:
            return hit[1]
    value = compute()
    with _flag_cache_lock:
        _flag_cache[key] = (now, value)
    return value


def _baselines_fresh_flag(supabase) -> bool:
    def _compute() -> bool:
        try:
            from deals.baseline_guard import baselines_freshness, log_stale_alert
            from deals.liteapi_config import load_deals_config

            cfg = load_deals_config()
            fresh, last, reason = baselines_freshness(
                supabase, max_age_h=cfg.baseline_max_age_h
            )
            if not fresh:
                log_stale_alert(last, reason)
            return fresh
        except Exception:
            return True

    return bool(_cached_flag("baselines_fresh", _compute))


def _parse_origin_codes(origin: Optional[str]) -> List[str]:
    """Accept 'BVA' or 'CDG,ORY,BVA' (city multi-airport)."""
    if not origin:
        return []
    import re

    parts = re.split(r"[,;|/\s]+", origin.strip().upper())
    out: List[str] = []
    for p in parts:
        code = p.strip()
        if len(code) == 3 and code.isalpha() and code not in out:
            out.append(code)
    return out


def _row_has_hotel(row: Dict[str, Any]) -> bool:
    hotels = row.get("hotel_top3")
    return bool(isinstance(hotels, list) and len(hotels) > 0)


def _fetch_active_rows(
    supabase,
    *,
    codes: Optional[List[str]] = None,
    limit: int = 60,
) -> List[Dict[str, Any]]:
    q = (
        supabase.table("deals_active")
        .select("*")
        .eq("status", "active")
        .order("deal_score", desc=True)
        .limit(limit)
    )
    if codes and len(codes) == 1:
        q = q.eq("origin_iata", codes[0])
    elif codes and len(codes) > 1:
        q = q.in_("origin_iata", codes)
    try:
        res = q.execute()
        return list(res.data or [])
    except Exception:
        return []


def _photos_from_pool(supabase, hotel_ids: List[str]) -> Dict[str, str]:
    """Fill missing hotel photos from hotel_pool.main_photo."""
    ids = [str(i) for i in hotel_ids if i]
    if not ids or not supabase:
        return {}
    out: Dict[str, str] = {}
    try:
        # chunk to stay under filter limits
        for i in range(0, len(ids), 80):
            chunk = ids[i : i + 80]
            res = (
                supabase.table("hotel_pool")
                .select("hotel_id,main_photo,thumbnail")
                .in_("hotel_id", chunk)
                .execute()
            )
            for row in res.data or []:
                hid = str(row.get("hotel_id") or "")
                photo = (row.get("main_photo") or row.get("thumbnail") or "").strip()
                if hid and photo and hid not in out:
                    out[hid] = photo
    except Exception:
        return out
    return out


def _fill_missing_hotel_photos(
    rows: List[Dict[str, Any]], photo_map: Dict[str, str]
) -> List[Dict[str, Any]]:
    if not photo_map:
        return rows
    filled: List[Dict[str, Any]] = []
    for row in rows:
        hotels = row.get("hotel_top3")
        if not isinstance(hotels, list) or not hotels:
            filled.append(row)
            continue
        new_hotels = []
        changed = False
        for h in hotels:
            if not isinstance(h, dict):
                new_hotels.append(h)
                continue
            if _hotel_photo(h):
                new_hotels.append(h)
                continue
            hid = str(h.get("hotel_id") or h.get("id") or "")
            photo = photo_map.get(hid)
            if photo:
                new_hotels.append({**h, "photo": photo, "thumbnail": photo})
                changed = True
            else:
                new_hotels.append(h)
        filled.append({**row, "hotel_top3": new_hotels} if changed else row)
    return filled


def _compose_hotel_onto_row(supabase, row: Dict[str, Any], adults_n: int) -> Dict[str, Any]:
    """Attach cache hotel (+ photo) when hotel_top3 is empty / sans photo."""
    hotels = row.get("hotel_top3") or []
    if isinstance(hotels, list) and hotels and _hotel_photo(
        hotels[0] if isinstance(hotels[0], dict) else None
    ):
        return row
    try:
        from deals.compose_hotel import compose_hotel

        composed = compose_hotel(
            supabase,
            iata=str(row.get("dest_iata") or ""),
            checkin=str(row.get("out_date") or "")[:10],
            checkout=str(row.get("ret_date") or "")[:10],
            adults=adults_n,
            fetch_if_miss=False,
        )
        hotel = composed.get("hotel") if composed.get("status") == "ready" else None
        if not isinstance(hotel, dict):
            return row
        photo = _hotel_photo(hotel)
        if not photo and hotel.get("hotel_id"):
            pmap = _photos_from_pool(supabase, [str(hotel["hotel_id"])])
            photo = pmap.get(str(hotel["hotel_id"]))
        if not photo:
            return row
        hotel = {**hotel, "photo": photo, "thumbnail": photo}
        return {**row, "hotel_top3": [hotel]}
    except Exception:
        return row


def _enrich_rows_to_deals(
    rows: List[Dict[str, Any]],
    *,
    adults_n: int,
    fresh: bool,
    max_pp: Optional[float],
    match_origin: bool,
    supabase=None,
) -> List[Dict[str, Any]]:
    from deals.airport_display import distances_for_iatas, enrich_route_labels
    from deals.baggage import (
        DEFAULT_BAGGAGE,
        baggage_map_for_carriers,
        _normalize_carrier,
    )
    from city_names_fr import city_for_code

    if supabase is not None:
        rows = [_compose_hotel_onto_row(supabase, r, adults_n) for r in rows]

    # Backfill hotel photos for rows that only have hotel_id
    missing_ids: List[str] = []
    for r in rows:
        for h in r.get("hotel_top3") or []:
            if isinstance(h, dict) and not _hotel_photo(h):
                hid = h.get("hotel_id") or h.get("id")
                if hid:
                    missing_ids.append(str(hid))
    photo_map = _photos_from_pool(supabase, missing_ids) if missing_ids else {}
    rows = _fill_missing_hotel_photos(rows, photo_map)

    dests = [str(r.get("dest_iata") or "") for r in rows]
    carriers = []
    for r in rows:
        flight = r.get("flight_snapshot") or {}
        carriers.append(
            flight.get("carrier") or flight.get("airline") or flight.get("provider")
        )
    dist_map = distances_for_iatas(dests)
    bag_map = baggage_map_for_carriers(carriers)

    deals: List[Dict[str, Any]] = []
    for row in rows:
        flight = row.get("flight_snapshot") or {}
        city = flight.get("city_name") or row.get("dest_iata") or ""
        carrier = flight.get("carrier") or flight.get("airline") or flight.get("provider")
        origin_iata = str(row.get("origin_iata") or "")
        dest_iata = str(row.get("dest_iata") or "")
        ckey = _normalize_carrier(carrier)
        enriched = {
            **row,
            "_baggage": bag_map.get(ckey) or {**DEFAULT_BAGGAGE},
            "_route_labels": enrich_route_labels(
                origin_iata=origin_iata,
                dest_iata=dest_iata,
                city_name=str(city),
                origin_city=city_for_code(origin_iata, ""),
                distance_km=dist_map.get(dest_iata.upper()),
            ),
        }
        d = row_to_travel_deal(enriched, adults=adults_n, baselines_fresh=fresh)
        if max_pp is not None and float(d.get("price_per_person") or 0) > float(max_pp):
            continue
        if not _deal_has_hotel_photo(d):
            continue
        flags = dict(d.get("flags") or {})
        flags["match_origin"] = match_origin
        flags["has_hotel"] = True
        d["flags"] = flags
        deals.append(d)
    return deals


def _deal_has_hotel_photo(d: Dict[str, Any]) -> bool:
    """Deals tab: only show packs with a real hotel photo (no city stock)."""
    if _hotel_photo(d.get("hotel") if isinstance(d.get("hotel"), dict) else None):
        return True
    img = d.get("image_url")
    return isinstance(img, str) and bool(img.strip())


def _only_hotel_photo_deals(deals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [d for d in deals if _deal_has_hotel_photo(d)]


def _prefer_hotel_deals(deals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Hotel-with-photo first, then by deal_score."""
    return sorted(
        deals,
        key=lambda d: (
            0 if _deal_has_hotel_photo(d) else 1,
            -(float(d.get("deal_score") or 0)),
        ),
    )


def list_community_deals(
    supabase,
    *,
    origin: Optional[str] = None,
    adults: Optional[int] = None,
    max_pp: Optional[float] = None,
    limit: int = 30,
) -> List[Dict[str, Any]]:
    """
    Browse: deals with hotel photo only (no city stock, no flight-only cards).
    Search (origin set): matching deals first, then fill with other origins.
    """
    adults_n = int(adults or 2)
    target = max(12, min(int(limit or 30), 48))
    cache_key = f"hp1|{origin or ''}|{adults_n}|{max_pp}|{target}"
    now = time.monotonic()
    with _list_cache_lock:
        hit = _list_cache.get(cache_key)
        if hit and now - hit[0] < _LIST_CACHE_TTL_S:
            return [dict(d) for d in hit[1]]

    fresh = _baselines_fresh_flag(supabase)
    from deals.click_checks import is_cached_deals_enabled
    from deals.liteapi_config import load_deals_config
    from deals.verification import apply_cached_share_cap

    cfg = load_deals_config()
    cached_on = bool(
        _cached_flag(
            "cached_deals_enabled",
            lambda: is_cached_deals_enabled(
                supabase, env_default=cfg.cached_enabled
            ),
        )
    )

    codes = _parse_origin_codes(origin)
    fetch_n = max(target * 2, 60)

    if codes:
        matched_rows = _fetch_active_rows(supabase, codes=codes, limit=fetch_n)
        # Prefer rows that already have hotel_top3
        matched_rows.sort(key=lambda r: (0 if _row_has_hotel(r) else 1, -(float(r.get("deal_score") or 0))))
        matched = _enrich_rows_to_deals(
            matched_rows,
            adults_n=adults_n,
            fresh=fresh,
            max_pp=max_pp,
            match_origin=True,
            supabase=supabase,
        )
        matched = _prefer_hotel_deals(matched)
        out = list(matched)
        seen = {str(d.get("deal_key") or d.get("id")) for d in out}

        if len(out) < target:
            filler_rows = _fetch_active_rows(supabase, codes=None, limit=fetch_n)
            filler_rows.sort(
                key=lambda r: (0 if _row_has_hotel(r) else 1, -(float(r.get("deal_score") or 0)))
            )
            fillers = _enrich_rows_to_deals(
                filler_rows,
                adults_n=adults_n,
                fresh=fresh,
                max_pp=max_pp,
                match_origin=False,
                supabase=supabase,
            )
            for d in _prefer_hotel_deals(fillers):
                key = str(d.get("deal_key") or d.get("id"))
                if key in seen:
                    continue
                out.append(d)
                seen.add(key)
                if len(out) >= target:
                    break
    else:
        rows = _fetch_active_rows(supabase, codes=None, limit=fetch_n)
        rows.sort(key=lambda r: (0 if _row_has_hotel(r) else 1, -(float(r.get("deal_score") or 0))))
        out = _enrich_rows_to_deals(
            rows,
            adults_n=adults_n,
            fresh=fresh,
            max_pp=max_pp,
            match_origin=True,
            supabase=supabase,
        )
        out = _prefer_hotel_deals(out)

    out = apply_cached_share_cap(
        out,
        max_share=cfg.cached_max_share,
        cached_enabled=cached_on,
    )
    out = _only_hotel_photo_deals(out)[:target]
    with _list_cache_lock:
        _list_cache[cache_key] = (time.monotonic(), [dict(d) for d in out])
        if len(_list_cache) > 64:
            items = sorted(_list_cache.items(), key=lambda kv: kv[1][0])
            for k, _ in items[:32]:
                _list_cache.pop(k, None)
    return out


def get_community_deal(supabase, deal_key: str) -> Optional[Dict[str, Any]]:
    try:
        res = (
            supabase.table("deals_active")
            .select("*")
            .eq("deal_key", deal_key)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        fresh = _baselines_fresh_flag(supabase)
        row = res.data[0]
        flight = row.get("flight_snapshot") or {}
        city = flight.get("city_name") or row.get("dest_iata") or ""
        carrier = flight.get("carrier") or flight.get("airline") or flight.get("provider")
        from deals.airport_display import distance_for_iata, enrich_route_labels
        from deals.baggage import lookup_baggage
        from city_names_fr import city_for_code

        origin_iata = str(row.get("origin_iata") or "")
        dest_iata = str(row.get("dest_iata") or "")
        row = _compose_hotel_onto_row(supabase, row, adults_n=2)
        row = {
            **row,
            "_baggage": lookup_baggage(supabase, carrier, prefer_seed=True),
            "_route_labels": enrich_route_labels(
                origin_iata=origin_iata,
                dest_iata=dest_iata,
                city_name=str(city),
                origin_city=city_for_code(origin_iata, ""),
                distance_km=distance_for_iata(
                    supabase, dest_iata, prefer_seed=True
                ),
            ),
        }
        deal = row_to_travel_deal(row, baselines_fresh=fresh)
        return deal if _deal_has_hotel_photo(deal) else None
    except Exception:
        return None
