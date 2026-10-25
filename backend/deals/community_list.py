"""
Assemble community deals_active rows into TravelDeal-shaped dicts for the API.
"""
from __future__ import annotations

import re
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

_list_cache_lock = threading.Lock()
_list_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
# 8 min — deals only change on promote/materialize; invalidate_list_cache() bumps epoch
_LIST_CACHE_TTL_S = 480.0
_list_cache_epoch = 0
_flag_cache_lock = threading.Lock()
_flag_cache: Dict[str, Tuple[float, Any]] = {}
_FLAG_CACHE_TTL_S = 60.0

# Hard floor — a wall under 30 feels empty / broken (audit)
WALL_MIN_DEALS = 30
WALL_MAX_DEALS = 48


def invalidate_list_cache() -> None:
    """Call after promote / materialize / rates so clients see fresh wall."""
    global _list_cache_epoch
    with _list_cache_lock:
        _list_cache.clear()
        _list_cache_epoch += 1
    try:
        from deals.wall_list_cache import bump_epoch

        bump_epoch()
    except Exception:
        pass


def _hotel_top3_has_photo(hotels: Any) -> bool:
    if not isinstance(hotels, list) or not hotels:
        return False
    h0 = hotels[0] if isinstance(hotels[0], dict) else None
    return bool(_hotel_photo(h0))


def _hotel_top3_ready(hotels: Any) -> bool:
    """Photo + bookable price → no list-time compose needed."""
    if not _hotel_top3_has_photo(hotels):
        return False
    h0 = hotels[0]
    for k in ("public_hotel_price", "public_price"):
        try:
            if float(h0.get(k) or 0) > 0:
                return True
        except (TypeError, ValueError):
            continue
    return False


def _verified_today_label(last_verified_at: Any) -> Optional[str]:
    if not last_verified_at:
        return None
    try:
        dt = datetime.fromisoformat(str(last_verified_at).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if dt.date() == now.date():
            return "Vérifié"
    except ValueError:
        return None
    return None


def badge_for_baseline(baseline: Dict[str, Any]) -> Dict[str, Any]:
    """
    Honest badge: flight-only vs usual price (30d).

    Only show a badge when we have a real measured discount_pct.
    Soft-fill / estimated / unreliable → no badge (avoids « Très bon prix » everywhere).
    """
    kind = baseline.get("baseline_kind") or "observed"
    disc = baseline.get("discount_pct")
    if (
        kind == "estimated"
        or baseline.get("soft_fill")
        or disc is None
    ):
        return {
            "label": None,
            "discount_pct": None,
            "scope": "flight",
            "tooltip": None,
        }
    try:
        pct = float(disc)
    except (TypeError, ValueError):
        return {"label": None, "discount_pct": None, "scope": "flight", "tooltip": None}
    if pct < 15:
        # Keep badge rare: only meaningful savings
        return {"label": None, "discount_pct": None, "scope": "flight", "tooltip": None}
    return {
        "label": f"Vol −{int(round(pct))} % moins cher que d'habitude",
        "discount_pct": pct,
        "scope": "flight",
        "tooltip": (
            "Par rapport au prix médian observé sur FlightWatcher pour ce trajet "
            "et cette période, sur les 30 derniers jours. Ce n'est pas une promo compagnie."
        ),
    }


def _airport_label(iata: Any) -> Optional[str]:
    code = str(iata or "").strip().upper()
    if not code:
        return None
    try:
        from city_names_fr import airport_name_for_code

        name = (airport_name_for_code(code, code) or "").strip()
        return name or code
    except Exception:
        return code


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

    import os

    soft_fill_mode = (os.getenv("DEALS_SOFT_FILL_MODE", "flight_only") or "flight_only").lower()
    hotel_pp = None
    hotel_name = None
    hotel_stars = None
    hotel_bookable = False
    indicative_night = None
    if hotel and isinstance(hotel, dict):
        hotel_name = hotel.get("name") or hotel.get("hotel_name")
        hotel_stars = hotel.get("stars")
        # public total / adults if present — only bookable rates, not pool-only fillers
        public = (
            hotel.get("public_hotel_price")
            or hotel.get("public_price")
        )
        if public is not None:
            try:
                hotel_pp = round(float(public) / max(1, adults), 2)
                if hotel_pp > 0:
                    hotel_bookable = True
            except (TypeError, ValueError):
                hotel_pp = None
        if not hotel_bookable and soft_fill_mode == "indicative_hotel_night":
            # Optional indicative €/night from pool meta (never folded into total)
            try:
                night = hotel.get("indicative_night_eur") or hotel.get("from_night_eur")
                if night is not None:
                    indicative_night = round(float(night), 2)
            except (TypeError, ValueError):
                indicative_night = None

    # v3.3 Lot C: never present flight-only as a stay total
    price_pp = price_flight
    if hotel_bookable and hotel_pp is not None:
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
    dest_iata = str(row.get("dest_iata") or "").upper()
    country = ""
    try:
        from city_names_fr import country_for_code

        country = country_for_code(dest_iata, "") or ""
    except Exception:
        country = ""

    deal_out: Dict[str, Any] = {
        "id": row.get("deal_key"),
        "deal_key": row.get("deal_key"),
        "title": f"Week-end à {city}" if city else "Deal",  # overwritten by compute_human_title
        "city": city,
        "country": country,
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
        "origin_airport_label": route.get("origin_airport_label")
        or _airport_label(row.get("origin_iata")),
        "arrival_airport_label": route.get("arrival_airport_label")
        or _airport_label(row.get("dest_iata")),
        "distance_label": route.get("distance_label"),
        "price_pax_note": price_pax_note,
        "flight": {
            "price_pp": price_flight,
            "provider": flight.get("provider"),
            "carrier": flight.get("carrier"),
            "airline": flight.get("carrier"),
            "booking_url": flight.get("booking_url"),
            "direct": flight.get("direct", True),
            # Canonical UI fields + raw snapshot keys
            "outbound_local": flight.get("out_dep_local") or flight.get("outbound_local"),
            "inbound_local": flight.get("ret_dep_local") or flight.get("inbound_local"),
            "out_dep_local": flight.get("out_dep_local"),
            "ret_dep_local": flight.get("ret_dep_local"),
            "verification_level": vlevel,
            "origin_iata": row.get("origin_iata"),
            "destination_iata": row.get("dest_iata"),
        },
        "hotel": hotel,
        "alt_hotels": hotels[1:8] if hotels else [],
        "price_breakdown": {
            "flight_pp": price_flight,
            "hotel_pp": hotel_pp if hotel_bookable else None,
            "total_pp": price_pp,
            "hotel_bookable": hotel_bookable,
            "indicative_night_eur": indicative_night,
        },
        "flags": {
            "has_hotel": bool(hotel),
            "hotel_bookable": hotel_bookable,
            "soft_fill": bool(hotel) and not hotel_bookable,
            "soft_fill_mode": soft_fill_mode if (hotel and not hotel_bookable) else None,
            "price_label": (
                None
                if hotel_bookable
                else (
                    "Vol dès · hôtel à choisir"
                    if soft_fill_mode != "indicative_hotel_night"
                    else (
                        f"Vol · hôtels dès {int(indicative_night)} €/nuit"
                        if indicative_night
                        else "Vol dès · hôtel à choisir"
                    )
                )
            ),
            "source_mix": row.get("source_mix"),
            "verified_label": verified if vlevel != LEVEL_CACHED else None,
            "verification_level": vlevel,
            "price_pax_note": price_pax_note,
        },
        "verification_level": vlevel,
        "deal_score": row.get("deal_score"),
        "fetched_at": row.get("last_verified_at"),
        "served_city_id": row.get("served_city_id"),
        "occasion_tags": list(row.get("occasion_tags") or []),
        "occasion_badge": row.get("occasion_badge"),
    }
    human = compute_human_title(deal_out)
    if human:
        deal_out["title"] = human
    hook = compute_deal_hook(deal_out)
    if hook:
        deal_out["hook"] = hook.get("text")
        deal_out["hook_kind"] = hook.get("kind")
    why = compute_why_good(deal_out)
    if why:
        deal_out["why_good"] = why
    return deal_out


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


def _expand_destination_iatas(supabase, destination: Optional[str]) -> List[str]:
    """
    Arrival city selection → all IATAs of that served city.
    'CIA' or 'FCO,CIA' → Rome airports so wall matches hotel city-axis.
    """
    codes = _parse_origin_codes(destination)
    if not codes or not supabase:
        return codes
    expanded: List[str] = []
    seen_cities: set = set()
    try:
        from deals.city_mapping import (
            iatas_for_served_city,
            resolve_hotel_destination,
        )
    except Exception:
        return codes

    for code in codes:
        resolved = resolve_hotel_destination(supabase, iata=code)
        scid = (resolved or {}).get("served_city_id")
        if scid and scid not in seen_cities:
            seen_cities.add(scid)
            for iata in iatas_for_served_city(supabase, str(scid)):
                if iata not in expanded:
                    expanded.append(iata)
        if code not in expanded:
            expanded.append(code)
        primary = (resolved or {}).get("primary_iata")
        if primary and primary not in expanded:
            expanded.append(str(primary).upper())
    return expanded or codes


def _row_has_hotel(row: Dict[str, Any]) -> bool:
    hotels = row.get("hotel_top3")
    return bool(isinstance(hotels, list) and len(hotels) > 0)


def _fetch_active_rows(
    supabase,
    *,
    codes: Optional[List[str]] = None,
    limit: int = 60,
    occasion: Optional[str] = None,
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
    occasion_slug = (occasion or "").strip().lower() or None
    if occasion_slug:
        # GIN-backed contains — filter before enrich/diversify
        try:
            q = q.contains("occasion_tags", [occasion_slug])
        except Exception:
            pass
    try:
        res = q.execute()
        return list(res.data or [])
    except Exception:
        return []


def _is_weekend_outbound(out_date: str, window_kind: Optional[str] = None) -> bool:
    """True if departure is Fri/Sat/Sun (or known weekend window_kind)."""
    wk = (window_kind or "").strip().upper()
    if wk in ("FRI_SUN", "SAT_MON"):
        return True
    raw = (out_date or "")[:10]
    if len(raw) < 10:
        return False
    try:
        from datetime import date as _date

        d = _date.fromisoformat(raw)
    except ValueError:
        return False
    # Mon=0 … Sun=6 — weekend departures: Fri/Sat/Sun
    return d.weekday() in (4, 5, 6)


def _deal_matches_duration(
    deal: Dict[str, Any],
    duration: Optional[str],
    *,
    strict_weekend: bool = True,
) -> bool:
    """Client duration tabs: weekend | short | week."""
    tab = (duration or "").strip().lower() or None
    if not tab:
        return True
    nights = int(deal.get("nights") or 0)
    dates = deal.get("dates") or {}
    out = str(dates.get("outbound") or "")[:10]
    wk = deal.get("window_kind")
    if tab == "weekend":
        if not (1 <= nights <= 3):
            return False
        if not strict_weekend:
            return True
        return _is_weekend_outbound(out, wk if isinstance(wk, str) else None)
    if tab == "short":
        return 4 <= nights <= 5
    if tab == "week":
        return 6 <= nights <= 9
    return True


def _apply_duration_with_floor(
    deals: List[Dict[str, Any]],
    duration: Optional[str],
    *,
    min_deals: int = WALL_MIN_DEALS,
) -> List[Dict[str, Any]]:
    """
    Prefer true weekend (Fri/Sat/Sun). If pool < min_deals, backfill other
    1–3 night stays so the wall never looks broken.
    """
    tab = (duration or "").strip().lower() or None
    if not tab:
        return list(deals)
    preferred = [d for d in deals if _deal_matches_duration(d, tab, strict_weekend=True)]
    if len(preferred) >= min_deals or tab != "weekend":
        # short/week: no backfill across night bands
        if tab != "weekend":
            return preferred
        if len(preferred) >= min_deals:
            return preferred
    # Weekend backfill: keep preferred first, then other short stays
    seen = {str(d.get("deal_key") or d.get("id")) for d in preferred}
    for d in deals:
        if len(preferred) >= min_deals:
            break
        if not _deal_matches_duration(d, "weekend", strict_weekend=False):
            continue
        key = str(d.get("deal_key") or d.get("id"))
        if key in seen:
            continue
        seen.add(key)
        preferred.append(d)
    return preferred


def _photos_from_pool(supabase, hotel_ids: List[str]) -> Dict[str, str]:
    """Card photo SoT: hotel_pool (v3.3 Lot A) — never hotel_rates_cache."""
    from deals.pool_photos import photos_map_from_pool

    return photos_map_from_pool(supabase, hotel_ids)


def _overlay_pool_photos_on_rows(
    rows: List[Dict[str, Any]], photo_map: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Prefer pool photos over rates-carried URLs so expired rates don't blank cards."""
    if not photo_map:
        return rows
    from deals.pool_photos import overlay_pool_photos

    filled: List[Dict[str, Any]] = []
    for row in rows:
        hotels = row.get("hotel_top3")
        if not isinstance(hotels, list) or not hotels:
            filled.append(row)
            continue
        new_hotels = overlay_pool_photos(hotels, photo_map)
        filled.append({**row, "hotel_top3": new_hotels})
    return filled


def _pool_hotels_with_photos(supabase, dest_iata: str, *, limit: int = 8) -> List[Dict[str, Any]]:
    """Last-resort browse fill: hotel_pool for the arrival city (served_city)."""
    if not supabase or not dest_iata:
        return []
    try:
        from deals.city_mapping import resolve_hotel_destination

        resolved = resolve_hotel_destination(supabase, iata=dest_iata)
        dest = (resolved or {}).get("destination")
        if not dest:
            return []
        res = (
            supabase.table("hotel_pool")
            .select(
                "hotel_id,name,stars,rating,review_count,distance_m,"
                "main_photo,thumbnail"
            )
            .eq("destination_id", dest["id"])
            .order("pool_rank")
            .limit(40)
            .execute()
        )
    except Exception:
        return []
    out: List[Dict[str, Any]] = []
    for h in res.data or []:
        if not isinstance(h, dict):
            continue
        photo = (h.get("main_photo") or h.get("thumbnail") or "").strip()
        if not photo:
            continue
        hid = h.get("hotel_id")
        out.append(
            {
                "id": str(hid) if hid is not None else "",
                "hotel_id": hid,
                "name": h.get("name"),
                "stars": h.get("stars"),
                "rating": h.get("rating"),
                "review_count": h.get("review_count"),
                "distance_m": h.get("distance_m"),
                "board": None,
                "photo": photo,
                "thumbnail": photo,
                # No live rate — flight-led pack; hôtel price filled on revalidate
                "public_hotel_price": None,
                "pool_fill": True,
            }
        )
        if len(out) >= limit:
            break
    return out


def _diversify_primary_hotels(
    supabase, rows: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Strict wall rule: each card primary hotel_id appears at most once in the response.
    Missing hotels + duplicate primaries are reassigned from pool (no reuse if possible).
    """
    if not supabase or not rows:
        return rows

    from deals.materialize_wall import (
        batch_load_destinations,
        batch_pool_by_dest,
        pick_diverse_hotels,
        primary_hotel_id,
        _hotel_id,
    )

    all_iatas = [
        str(r.get("dest_iata") or "").upper()
        for r in rows
        if len(str(r.get("dest_iata") or "").strip()) == 3
    ]
    if not all_iatas:
        return rows

    dest_map = batch_load_destinations(supabase, all_iatas)
    dest_ids = [str(d["id"]) for d in dest_map.values()]
    pools = batch_pool_by_dest(supabase, dest_ids, limit_per_dest=40)

    used_global: set = set()
    out: List[Dict[str, Any]] = []

    # Higher score first so best deals keep their hotel when conflict
    ordered = sorted(
        enumerate(rows),
        key=lambda ir: -(float((ir[1] or {}).get("deal_score") or 0)),
    )
    by_index: Dict[int, Dict[str, Any]] = {}

    for idx, r in ordered:
        hotels = r.get("hotel_top3") if isinstance(r.get("hotel_top3"), list) else []
        prim = primary_hotel_id(hotels)
        iata = str(r.get("dest_iata") or "").upper()
        dest = dest_map.get(iata)
        did = str(dest["id"]) if dest else ""
        pool = pools.get(did) or []

        need_new = (not prim) or (prim in used_global) or (not _hotel_top3_has_photo(hotels))
        if not need_new and prim:
            used_global.add(prim)
            by_index[idx] = r
            continue

        # Candidates: current top3 (rotate) then pool
        candidates: List[Dict[str, Any]] = []
        for h in hotels:
            if isinstance(h, dict):
                candidates.append(h)
        for h in pool:
            hid = _hotel_id(h)
            if hid and all(_hotel_id(c) != hid for c in candidates):
                candidates.append(h)

        picked = pick_diverse_hotels(
            candidates, used_ids=used_global, top_n=1, allow_reuse=False
        )
        if not picked:
            # Strict: drop hotel rather than show a duplicate primary
            by_index[idx] = {**r, "hotel_top3": []}
            continue

        new_prim = primary_hotel_id(picked)
        if new_prim:
            used_global.add(new_prim)
        # Destination shortlist: up to 7 alts from this airport's pool/rates
        alts = pick_diverse_hotels(
            [h for h in candidates if _hotel_id(h) and _hotel_id(h) != new_prim],
            used_ids={new_prim} if new_prim else set(),
            top_n=7,
            allow_reuse=False,
        )
        by_index[idx] = {**r, "hotel_top3": picked + alts}

    for i, r in enumerate(rows):
        out.append(by_index.get(i, r))
    return out


def _enrich_rows_to_deals(
    rows: List[Dict[str, Any]],
    *,
    adults_n: int,
    fresh: bool,
    max_pp: Optional[float],
    match_origin: bool,
    supabase=None,
) -> List[Dict[str, Any]]:
    """
    Read path only: no per-row compose_hotel / rates lookup.
    Materialize (jobs) owns hotel_top3; here we only overlay pool photos + soft pool fill.
    """
    from deals.airport_display import distances_for_iatas, enrich_route_labels
    from deals.baggage import (
        DEFAULT_BAGGAGE,
        baggage_map_for_carriers,
        _normalize_carrier,
    )
    from city_names_fr import city_for_code

    if supabase is not None:
        # Fill missing + force unique primary hotel across the wall response
        rows = _diversify_primary_hotels(supabase, rows)

    # Card photo SoT = hotel_pool (batch)
    all_ids: List[str] = []
    for r in rows:
        for h in r.get("hotel_top3") or []:
            if isinstance(h, dict):
                hid = h.get("hotel_id") or h.get("id")
                if hid:
                    all_ids.append(str(hid))
    photo_map = _photos_from_pool(supabase, all_ids) if (all_ids and supabase) else {}
    rows = _overlay_pool_photos_on_rows(rows, photo_map)

    # Re-rank / drop hotels over 2.5× flight_pp (CPU only — no I/O)
    from deals.hotel_budget import filter_hotels_for_flight

    capped_rows: List[Dict[str, Any]] = []
    for r in rows:
        flight = r.get("flight_snapshot") or {}
        try:
            fpp = float(flight.get("price_pp_eur") or 0) or None
        except (TypeError, ValueError):
            fpp = None
        hotels = r.get("hotel_top3") or []
        if isinstance(hotels, list) and hotels:
            ranked = filter_hotels_for_flight(
                hotels,
                flight_pp=fpp,
                adults=adults_n,
                top_n=8,
                require_photo=True,
                checkin=str(r.get("out_date") or "")[:10],
                checkout=str(r.get("ret_date") or "")[:10],
            )
            if ranked:
                capped_rows.append({**r, "hotel_top3": ranked})
            else:
                kept = [
                    h
                    for h in hotels
                    if isinstance(h, dict) and _hotel_photo(h)
                ][:8]
                capped_rows.append({**r, "hotel_top3": kept})
        else:
            capped_rows.append(r)
    rows = capped_rows

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


def _wall_diversity_caps() -> Tuple[int, int]:
    import os

    try:
        city = int(os.getenv("DEALS_WALL_MAX_PER_CITY", "3") or "3")
    except ValueError:
        city = 3
    try:
        country = int(os.getenv("DEALS_WALL_MAX_PER_COUNTRY", "4") or "4")
    except ValueError:
        country = 4
    return max(1, city), max(1, country)


MAX_PER_CITY = 3
MAX_PER_COUNTRY = 4


def diversify_wall_deals(
    deals: List[Dict[str, Any]],
    *,
    max_per_city: int = MAX_PER_CITY,
    max_per_country: int = MAX_PER_COUNTRY,
) -> List[Dict[str, Any]]:
    """Strict wall variety: ≤max_per_city / city, ≤max_per_country / country."""
    city_n: Dict[str, int] = {}
    country_n: Dict[str, int] = {}
    out: List[Dict[str, Any]] = []
    for d in deals:
        city = str(d.get("city") or d.get("destination") or "").strip().lower()
        country = str(d.get("country") or "").strip().lower()
        if city and city_n.get(city, 0) >= max_per_city:
            continue
        if country and country_n.get(country, 0) >= max_per_country:
            continue
        out.append(d)
        if city:
            city_n[city] = city_n.get(city, 0) + 1
        if country:
            country_n[country] = country_n.get(country, 0) + 1
    return out


def diversify_wall_min(
    deals: List[Dict[str, Any]],
    *,
    target: int,
    min_deals: int = WALL_MIN_DEALS,
) -> List[Dict[str, Any]]:
    """
    Diversify then relax city/country caps until we hit min_deals (or exhaust pool).
    Prefer variety, but never ship a thin wall when inventory exists.
    """
    want = max(int(min_deals), int(target))
    city0, country0 = _wall_diversity_caps()
    # Progressive relaxation: (city, country) — starts from env caps
    caps = [
        (city0, country0),
        (max(city0, 3), max(country0, 4)),
        (4, 5),
        (6, 8),
        (99, 99),
    ]
    best: List[Dict[str, Any]] = []
    for city_cap, country_cap in caps:
        best = diversify_wall_deals(
            deals, max_per_city=city_cap, max_per_country=country_cap
        )
        if len(best) >= min(want, len(deals)):
            break
        if len(best) >= min_deals:
            break
    return best[:want]


def compute_human_title(deal: Dict[str, Any]) -> Optional[str]:
    """
    Data-only human title (Lot F). No invention, no urgency, no stock claims.
    Ex: « Lisbonne en 4★ noté 9,4, vol direct, petit-déj »
    """
    city = str(deal.get("city") or "").strip()
    if not city:
        return None
    bits: List[str] = []
    hotel = deal.get("hotel") if isinstance(deal.get("hotel"), dict) else {}
    try:
        stars = int(round(float(hotel.get("stars") or deal.get("hotel_stars") or 0)))
    except (TypeError, ValueError):
        stars = 0
    if stars >= 3:
        bits.append(f"en {stars}★")
    try:
        rating = float(hotel.get("rating")) if hotel.get("rating") is not None else None
    except (TypeError, ValueError):
        rating = None
    if rating is not None and rating >= 8.0:
        bits.append(f"noté {rating:.1f}")
    flight = deal.get("flight") or {}
    if flight.get("direct"):
        bits.append("vol direct")
    board = str(hotel.get("board") or deal.get("board") or "").upper()
    if "BI" in board or "BREAKFAST" in board or "PETIT" in board:
        bits.append("petit-déj")
    elif "AI" in board or "ALL" in board:
        bits.append("tout inclus")
    nights = int(deal.get("nights") or 0)
    if nights >= 1 and not bits:
        bits.append(f"{nights} nuit{'s' if nights > 1 else ''}")
    return _join_title(city, bits)


def _join_title(city: str, bits: List[str]) -> str:
    if not bits:
        return city
    if len(bits) == 1:
        return f"{city} {bits[0]}"
    return f"{city} {', '.join(bits[:-1])}, {bits[-1]}"


def compute_deal_hook(deal: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """
    Best true hook for the card (value signal). Data-only — no invention.
    Returns {text, kind} or None.
    """
    candidates: List[Tuple[float, str, str]] = []
    badge = deal.get("badge") or (deal.get("badge_meta") or {}).get("label")
    disc = (deal.get("badge_meta") or {}).get("discount_pct")
    if badge and disc is not None:
        try:
            pct = float(disc)
            if pct >= 15:
                candidates.append(
                    (100 + pct, f"−{int(round(pct))} % vs habitude", "baseline")
                )
        except (TypeError, ValueError):
            pass

    flight = deal.get("flight") or {}
    try:
        fpp = float((deal.get("price_breakdown") or {}).get("flight_pp") or flight.get("price_pp") or 0)
    except (TypeError, ValueError):
        fpp = 0.0
    if flight.get("direct") and fpp > 0:
        candidates.append(
            (70 + max(0, 80 - fpp) / 2, f"Vol direct à {int(round(fpp))} € A/R", "direct")
        )

    hotel = deal.get("hotel") if isinstance(deal.get("hotel"), dict) else {}
    try:
        rating = float(hotel.get("rating")) if hotel.get("rating") is not None else None
    except (TypeError, ValueError):
        rating = None
    try:
        hpp = float((deal.get("price_breakdown") or {}).get("hotel_pp") or 0)
    except (TypeError, ValueError):
        hpp = 0.0
    nights = int(deal.get("nights") or 2)
    if rating is not None and rating >= 8.5 and hpp > 0:
        candidates.append(
            (
                50 + rating,
                f"Hôtel {rating:.1f}/10 pour {int(round(hpp))} € / {nights} nuit{'s' if nights > 1 else ''}",
                "hotel_value",
            )
        )

    if not candidates:
        return None
    candidates.sort(key=lambda x: -x[0])
    _score, text, kind = candidates[0]
    return {"text": text, "kind": kind}


def compute_why_good(deal: Dict[str, Any]) -> List[str]:
    """Up to 3 true bullets for the detail sheet (data-only)."""
    bullets: List[str] = []
    disc = (deal.get("badge_meta") or {}).get("discount_pct")
    if disc is not None:
        try:
            pct = float(disc)
            if pct >= 10:
                bullets.append(f"Vol {int(round(pct))} % sous le prix habituel sur cette ligne")
        except (TypeError, ValueError):
            pass

    hotel = deal.get("hotel") if isinstance(deal.get("hotel"), dict) else {}
    try:
        rating = float(hotel.get("rating")) if hotel.get("rating") is not None else None
    except (TypeError, ValueError):
        rating = None
    stars = hotel.get("stars") or deal.get("hotel_stars")
    try:
        stars_n = int(round(float(stars))) if stars is not None else 0
    except (TypeError, ValueError):
        stars_n = 0
    if rating is not None and rating >= 8.0:
        if stars_n >= 3:
            bullets.append(
                f"Hôtel {stars_n}★ noté {rating:.1f}/10"
                + (
                    f" ({int(hotel['review_count'])} avis)"
                    if hotel.get("review_count") is not None
                    else ""
                )
            )
        else:
            bullets.append(f"Hôtel bien noté {rating:.1f}/10")

    flight = deal.get("flight") or {}
    out_t = flight.get("outbound_local") or flight.get("out_dep_local")
    ret_t = flight.get("inbound_local") or flight.get("ret_dep_local")

    def _hhmm(iso: Any) -> Optional[str]:
        if not iso:
            return None
        m = re.search(r"T(\d{2}):(\d{2})", str(iso))
        return f"{m.group(1)}:{m.group(2)}" if m else None

    out_c, ret_c = _hhmm(out_t), _hhmm(ret_t)
    if flight.get("direct"):
        if out_c and ret_c:
            bullets.append(f"Vol direct · aller {out_c} · retour {ret_c}")
        else:
            bullets.append("Vol direct aller-retour")
    elif out_c and ret_c:
        bullets.append(f"Horaires · aller {out_c} · retour {ret_c}")

    board = (hotel.get("board") or deal.get("board") or "").upper()
    if "BI" in board or "BREAKFAST" in board or "PETIT" in board:
        bullets.append("Petit-déjeuner inclus")
    if hotel.get("refundable"):
        bullets.append("Annulation gratuite sur l’hôtel")
    if deal.get("baggage_line"):
        bullets.append(str(deal["baggage_line"]))

    # Dedup preserve order, max 3
    seen = set()
    out: List[str] = []
    for b in bullets:
        if b in seen:
            continue
        seen.add(b)
        out.append(b)
        if len(out) >= 3:
            break
    return out


def list_related_community_deals(
    supabase,
    deal: Dict[str, Any],
    *,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Same destination + same origin, other dates — real prices from deals_active.
    """
    dest = str(
        deal.get("destination")
        or (deal.get("flight") or {}).get("destination_iata")
        or ""
    ).upper()
    cur_origin = str(
        deal.get("origin_iata")
        or deal.get("departure_airport")
        or (deal.get("flight") or {}).get("origin_iata")
        or ""
    ).upper().split(",")[0].strip()
    current_key = str(deal.get("deal_key") or deal.get("id") or "")
    if not dest or not supabase:
        return []
    try:
        q = (
            supabase.table("deals_active")
            .select("*")
            .eq("dest_iata", dest)
            .eq("status", "active")
            .order("deal_score", desc=True)
            .limit(40)
        )
        if len(cur_origin) == 3:
            q = q.eq("origin_iata", cur_origin)
        res = q.execute()
        rows = [r for r in (res.data or []) if str(r.get("deal_key") or "") != current_key]
        if len(cur_origin) == 3:
            rows = [
                r
                for r in rows
                if str(r.get("origin_iata") or "").upper() == cur_origin
            ]
    except Exception:
        return []
    if not rows:
        return []
    fresh = _baselines_fresh_flag(supabase)
    enriched = _enrich_rows_to_deals(
        rows,
        adults_n=int(deal.get("adults") or 2),
        fresh=fresh,
        max_pp=None,
        match_origin=True,
        supabase=supabase,
    )
    enriched = _only_hotel_photo_deals(enriched)
    # Same origin only — other outbound dates
    cur_out = str((deal.get("dates") or {}).get("outbound") or "")[:10]
    scored: List[Tuple[int, Dict[str, Any]]] = []
    for d in enriched:
        o = str(d.get("origin_iata") or d.get("departure_airport") or "").upper()
        if cur_origin and o and o != cur_origin:
            continue
        out_d = str((d.get("dates") or {}).get("outbound") or "")[:10]
        if not out_d or out_d == cur_out:
            continue
        scored.append((1, d))
    scored.sort(key=lambda x: (-(float(x[1].get("deal_score") or 0)),))
    # Diversity: one per outbound date
    seen_pair = set()
    out: List[Dict[str, Any]] = []
    for _s, d in scored:
        pair = str((d.get("dates") or {}).get("outbound") or "")[:10]
        if not pair or pair in seen_pair:
            continue
        seen_pair.add(pair)
        # Slim payload for alternatives strip
        out.append(
            {
                "id": d.get("id"),
                "deal_key": d.get("deal_key") or d.get("id"),
                "city": d.get("city"),
                "origin_iata": d.get("origin_iata"),
                "origin_airport_label": d.get("origin_airport_label"),
                "departure_airport": d.get("departure_airport"),
                "dates": d.get("dates"),
                "nights": d.get("nights"),
                "price_per_person": d.get("price_per_person"),
                "currency": d.get("currency") or "EUR",
                "hotel_name": d.get("hotel_name"),
                "image_url": d.get("image_url"),
                "hook": d.get("hook"),
            }
        )
        if len(out) >= max(1, min(int(limit), 8)):
            break
    return out


def list_community_deals(
    supabase,
    *,
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    adults: Optional[int] = None,
    max_pp: Optional[float] = None,
    occasion: Optional[str] = None,
    duration: Optional[str] = None,
    limit: int = 36,
) -> List[Dict[str, Any]]:
    """
    Browse: deals with hotel photo only (no city stock, no flight-only cards).
    Read path is cache-only enrichment — hotel composition happens in jobs.
    Default ~36 for choice; hard cap 48 (single wall, no pagination yet).

    Filters (optional):
      origin — departure IATA(s)
      destination — arrival city IATA(s), expanded via served_city
      occasion — slug present in occasion_tags (SQL contains + post-filter)
      duration — weekend | short | week (weekend = Fri/Sat/Sun depart + 1–3 nights)
    """
    import logging

    log = logging.getLogger("deals.community_list")
    t0 = time.monotonic()
    adults_n = int(adults or 2)
    # Never aim below WALL_MIN_DEALS — thin walls are banned
    target = max(WALL_MIN_DEALS, min(int(limit or 36), WALL_MAX_DEALS))
    occasion_slug = (occasion or "").strip().lower() or None
    duration_tab = (duration or "").strip().lower() or None
    if duration_tab not in ("weekend", "short", "week"):
        duration_tab = None
    try:
        from deals.wall_list_cache import current_epoch as _l2_epoch

        epoch = _l2_epoch()
    except Exception:
        with _list_cache_lock:
            epoch = _list_cache_epoch
    cache_key = (
        f"hp4|{epoch}|{origin or ''}|{destination or ''}|"
        f"{adults_n}|{max_pp}|{occasion_slug or ''}|{duration_tab or ''}|"
        f"{target}|min{WALL_MIN_DEALS}"
    )
    now = time.monotonic()
    with _list_cache_lock:
        hit = _list_cache.get(cache_key)
        if hit and now - hit[0] < _LIST_CACHE_TTL_S:
            log.info(
                "list_community_deals cache_hit origin=%s dest=%s n=%s ms=%.0f",
                origin,
                destination,
                len(hit[1]),
                (time.monotonic() - t0) * 1000,
            )
            return [dict(d) for d in hit[1]]

    # L2 shared file cache (multi-worker) — Phase 3 latency
    try:
        from deals.wall_list_cache import get_shared

        shared = get_shared(cache_key)
        if shared is not None:
            with _list_cache_lock:
                _list_cache[cache_key] = (time.monotonic(), [dict(d) for d in shared])
            log.info(
                "list_community_deals l2_hit origin=%s dest=%s n=%s ms=%.0f",
                origin,
                destination,
                len(shared),
                (time.monotonic() - t0) * 1000,
            )
            return [dict(d) for d in shared]
    except Exception:
        pass

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

    origin_codes = _parse_origin_codes(origin)
    dest_codes = _expand_destination_iatas(supabase, destination)
    origin_set = set(origin_codes)
    dest_set = set(dest_codes)
    # Oversample: duration + diversify shrink the pool — aim well above floor
    fetch_n = max(target * 5, 120)

    all_rows = _fetch_active_rows(
        supabase, codes=None, limit=fetch_n, occasion=occasion_slug
    )

    def _row_match_origin(r: Dict[str, Any]) -> bool:
        if not origin_set:
            return True
        return (r.get("origin_iata") or "").upper() in origin_set

    def _row_match_dest(r: Dict[str, Any]) -> bool:
        if not dest_set:
            return True
        return (r.get("dest_iata") or "").upper() in dest_set

    def _priority(r: Dict[str, Any]) -> tuple:
        mo = _row_match_origin(r)
        md = _row_match_dest(r)
        # Both filters → prefer full match, then dest (city-axis), then origin
        if origin_set and dest_set:
            tier = 0 if (mo and md) else (1 if md else (2 if mo else 3))
        elif dest_set:
            tier = 0 if md else 1
        elif origin_set:
            tier = 0 if mo else 1
        else:
            tier = 0
        return (
            tier,
            0 if _hotel_top3_has_photo(r.get("hotel_top3")) else 1,
            0 if _row_has_hotel(r) else 1,
            -(float(r.get("deal_score") or 0)),
        )

    all_rows.sort(key=_priority)
    enriched = _enrich_rows_to_deals(
        all_rows[:fetch_n],
        adults_n=adults_n,
        fresh=fresh,
        max_pp=max_pp,
        match_origin=True,
        supabase=supabase,
    )
    out: List[Dict[str, Any]] = []
    seen = set()
    for d in enriched:
        key = str(d.get("deal_key") or d.get("id"))
        if key in seen:
            continue
        oi = str(d.get("origin_iata") or d.get("departure_airport") or "").upper()
        di = str(d.get("destination") or d.get("dest_iata") or "").upper()
        # flight nested dest
        if not di:
            flight = d.get("flight") or {}
            di = str(flight.get("destination_iata") or "").upper()
        flags = dict(d.get("flags") or {})
        flags["match_origin"] = (not origin_set) or (oi in origin_set)
        flags["match_destination"] = (not dest_set) or (di in dest_set)
        d["flags"] = flags
        seen.add(key)
        out.append(d)

    out = _prefer_hotel_deals(out)

    def _deal_priority(d: Dict[str, Any]) -> tuple:
        flags = d.get("flags") or {}
        mo = bool(flags.get("match_origin", True))
        md = bool(flags.get("match_destination", True))
        if origin_set and dest_set:
            tier = 0 if (mo and md) else (1 if md else (2 if mo else 3))
        elif dest_set:
            tier = 0 if md else 1
        elif origin_set:
            tier = 0 if mo else 1
        else:
            tier = 0
        return (
            tier,
            0 if _deal_has_hotel_photo(d) else 1,
            -(float(d.get("deal_score") or 0)),
        )

    out.sort(key=_deal_priority)

    out = apply_cached_share_cap(
        out,
        max_share=cfg.cached_max_share,
        cached_enabled=cached_on,
    )
    out = _only_hotel_photo_deals(out)
    if occasion_slug:
        out = [
            d
            for d in out
            if occasion_slug in [str(t).lower() for t in (d.get("occasion_tags") or [])]
        ]
    if duration_tab:
        out = _apply_duration_with_floor(out, duration_tab, min_deals=WALL_MIN_DEALS)
    out = diversify_wall_min(out, target=target, min_deals=WALL_MIN_DEALS)
    snap = [dict(d) for d in out]
    with _list_cache_lock:
        _list_cache[cache_key] = (time.monotonic(), snap)
        if len(_list_cache) > 64:
            items = sorted(_list_cache.items(), key=lambda kv: kv[1][0])
            for k, _ in items[:32]:
                _list_cache.pop(k, None)
    try:
        from deals.wall_list_cache import set_shared as _l2_set

        _l2_set(cache_key, snap)
    except Exception:
        pass
    elapsed_ms = (time.monotonic() - t0) * 1000
    log.info(
        "list_community_deals origin=%s dest=%s n=%s ms=%.0f",
        origin,
        destination,
        len(out),
        elapsed_ms,
    )
    if elapsed_ms > 300:
        log.warning(
            "list_community_deals SLOW origin=%s dest=%s ms=%.0f (target p95 < 300)",
            origin,
            destination,
            elapsed_ms,
        )
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
        rows = _enrich_rows_to_deals(
            [res.data[0]],
            adults_n=2,
            fresh=fresh,
            max_pp=None,
            match_origin=True,
            supabase=supabase,
        )
        if not rows:
            return None
        deal = rows[0]
        related = list_related_community_deals(supabase, deal, limit=5)
        if related:
            deal["related_deals"] = related
        return deal
    except Exception:
        return None
