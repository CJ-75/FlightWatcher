"""
D4 — promote_deals: eligibility + score + diversity → deals_active.
"""
from __future__ import annotations

import logging
import math
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from deals.baselines import (
    discount_pct_vs_usual,
    horizon_bucket,
    is_good_price,
)
from deals.compose_hotel import compose_hotel
from deals.liteapi_config import DealsConfig, load_deals_config
from deals.verification import prefer_observation, verification_level_for_provider

logger = logging.getLogger("deals.promote")

POP_REF = 50.0


def _parse_dt(raw: Any) -> Optional[datetime]:
    if not raw:
        return None
    try:
        if isinstance(raw, datetime):
            return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
        s = str(raw).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def days_to_departure(out_date: str, *, now: Optional[datetime] = None) -> Optional[int]:
    try:
        out = date.fromisoformat(str(out_date)[:10])
    except ValueError:
        return None
    today = (now or datetime.now(timezone.utc)).date()
    return (out - today).days


def is_fresh_enough(
    observed_at: Any,
    out_date: str,
    *,
    tau_h: float = 6.0,
    tau_short_h: float = 3.0,
    now: Optional[datetime] = None,
) -> bool:
    now = now or datetime.now(timezone.utc)
    obs = _parse_dt(observed_at)
    if not obs:
        return False
    dtd = days_to_departure(out_date, now=now)
    tau = tau_short_h if dtd is not None and dtd <= 7 else tau_h
    age_h = (now - obs).total_seconds() / 3600.0
    return age_h <= tau


def arrival_hour_ok(out_arr_local: Optional[str]) -> bool:
    """Reject graveyard arrivals 00:00–04:59 local if we have arrival time."""
    if not out_arr_local or len(str(out_arr_local)) < 13:
        return True  # unknown → no hard reject
    raw = str(out_arr_local)
    try:
        # ISO …THH:MM
        t = raw.split("T", 1)[1][:5]
        hh = int(t[:2])
        return not (0 <= hh <= 4)
    except (IndexError, ValueError):
        return True


def deal_score(
    *,
    price_pp: float,
    baseline: Dict[str, Any],
    age_hours: float,
    tau_h: float,
    distinct_searches_7d: int,
    direct: bool,
    arrival_ok: bool,
    has_hotel: bool,
    weights: Optional[Dict[str, float]] = None,
) -> float:
    w = weights or {
        "disc": 1.0,
        "fresh": 0.4,
        "pop": 0.2,
        "qual": 0.2,
        "hotel": 0.15,
    }
    median = float(baseline.get("median") or 0) or 1.0
    discount = max(0.0, min(1.0, (median - price_pp) / median))
    freshness = math.exp(-max(0.0, age_hours) / max(0.1, tau_h))
    popularity = math.log(1 + max(0, distinct_searches_7d)) / math.log(1 + POP_REF)
    quality = 0.0
    if direct:
        quality += 0.5
    if arrival_ok:
        quality += 0.5
    hotel_bonus = 1.0 if has_hotel else 0.0
    return (
        w.get("disc", 1.0) * discount
        + w.get("fresh", 0.4) * freshness
        + w.get("pop", 0.2) * min(1.0, popularity)
        + w.get("qual", 0.2) * quality
        + w.get("hotel", 0.15) * hotel_bonus
    )


def make_community_deal_key(
    origin: str, dest: str, out_date: str, ret_date: str, adults: int = 2
) -> str:
    return f"{origin.upper()}-{dest.upper()}-{out_date}-{ret_date}-a{adults}"


def eligible_candidate(
    obs: Dict[str, Any],
    baseline: Dict[str, Any],
    *,
    cfg: DealsConfig,
    now: Optional[datetime] = None,
) -> bool:
    now = now or datetime.now(timezone.utc)
    out_date = str(obs.get("out_date") or "")[:10]
    dtd = days_to_departure(out_date, now=now)
    if dtd is None or dtd < 3 or dtd > 120:
        return False
    nights = int(obs.get("nights") or 0)
    if nights < 1 or nights > 9:
        return False
    if not arrival_hour_ok(obs.get("out_arr_local")):
        return False
    if not is_fresh_enough(
        obs.get("observed_at"),
        out_date,
        tau_h=cfg.fresh_tau_h,
        tau_short_h=cfg.fresh_tau_short_h,
        now=now,
    ):
        return False
    try:
        price = float(obs.get("price_pp_eur") or 0)
    except (TypeError, ValueError):
        return False
    return is_good_price(
        price,
        baseline,
        max_flight_pp=cfg.max_flight_pp,
        min_discount=cfg.min_discount,
    )


def eligible_candidate_soft(
    obs: Dict[str, Any],
    baseline: Dict[str, Any],
    *,
    cfg: DealsConfig,
    now: Optional[datetime] = None,
    fresh_tau_h: float = 48.0,
) -> bool:
    """
    Browse fill: under max flight € and ≤ ~median, fresher than 48h.
    Keeps the grid full when hard 15% deals are scarce.
    """
    now = now or datetime.now(timezone.utc)
    out_date = str(obs.get("out_date") or "")[:10]
    dtd = days_to_departure(out_date, now=now)
    if dtd is None or dtd < 3 or dtd > 120:
        return False
    nights = int(obs.get("nights") or 0)
    if nights < 1 or nights > 9:
        return False
    if not arrival_hour_ok(obs.get("out_arr_local")):
        return False
    if not is_fresh_enough(
        obs.get("observed_at"),
        out_date,
        tau_h=fresh_tau_h,
        tau_short_h=fresh_tau_h,
        now=now,
    ):
        return False
    try:
        price = float(obs.get("price_pp_eur") or 0)
    except (TypeError, ValueError):
        return False
    if price <= 0 or price > float(cfg.max_flight_pp):
        return False
    med = baseline.get("median") or baseline.get("expected_pp_eur")
    if not med or float(med) <= 0:
        return price <= float(cfg.max_flight_pp)
    return price <= float(med) * 1.05


def _lookup_baseline(
    baselines: Dict[Tuple[str, str, str, str], Dict[str, Any]],
    *,
    origin: str,
    city_id: str,
    trip_type: str,
    horizon: str,
) -> Optional[Dict[str, Any]]:
    """Exact key, then OTHER, then any trip_type for same route/horizon."""
    tt = trip_type or "OTHER"
    hit = baselines.get((origin, city_id, tt, horizon))
    if hit:
        return hit
    if tt != "OTHER":
        hit = baselines.get((origin, city_id, "OTHER", horizon))
        if hit:
            return hit
    for (o, c, _t, h), bl in baselines.items():
        if o == origin and c == city_id and h == horizon:
            return bl
    return None


def apply_diversity(
    scored: List[Dict[str, Any]],
    *,
    max_per_city: int = 2,
    max_per_country: int = 3,
) -> List[Dict[str, Any]]:
    """Keep best scores with city/country caps (per origin already filtered)."""
    by_city: Dict[str, int] = {}
    by_country: Dict[str, int] = {}
    out: List[Dict[str, Any]] = []
    for row in sorted(scored, key=lambda r: -float(r.get("deal_score") or 0)):
        city = str(row.get("served_city_id") or "")
        country = str(row.get("country_code") or "")
        if by_city.get(city, 0) >= max_per_city:
            continue
        if country and by_country.get(country, 0) >= max_per_country:
            continue
        by_city[city] = by_city.get(city, 0) + 1
        if country:
            by_country[country] = by_country.get(country, 0) + 1
        out.append(row)
    return out


def _load_baselines_map(supabase) -> Dict[Tuple[str, str, str, str], Dict[str, Any]]:
    try:
        res = supabase.table("route_price_baselines").select("*").limit(20000).execute()
    except Exception:
        return {}
    out: Dict[Tuple[str, str, str, str], Dict[str, Any]] = {}
    for b in res.data or []:
        key = (
            str(b.get("origin_iata") or "").upper(),
            str(b.get("served_city_id") or ""),
            str(b.get("trip_type") or ""),
            str(b.get("horizon_bucket") or ""),
        )
        out[key] = b
    return out


def promote_deals(supabase, *, cfg: Optional[DealsConfig] = None) -> Dict[str, Any]:
    """Select candidates from recent observations → upsert deals_active."""
    cfg = cfg or load_deals_config()
    now = datetime.now(timezone.utc)
    # Hard deals: 12h lookback; soft fill: 48h so browse stays populated
    soft_hours = 48.0
    since = (now - timedelta(hours=soft_hours)).isoformat()
    browse_target = max(int(cfg.min_per_origin) * 3, 30)

    try:
        obs_res = (
            supabase.table("price_observations")
            .select("*")
            .gte("observed_at", since)
            .not_.is_("served_city_id", "null")
            .limit(10000)
            .execute()
        )
        observations = obs_res.data or []
    except Exception as e:
        return {"ok": False, "error": str(e)}

    baselines = _load_baselines_map(supabase)

    # Popularity: distinct fingerprints per origin+city last 7d
    pop_since = (now - timedelta(days=7)).isoformat()
    pop_map: Dict[Tuple[str, str], set] = {}
    try:
        pop_res = (
            supabase.table("price_observations")
            .select("origin_iata, served_city_id, search_fingerprint")
            .gte("observed_at", pop_since)
            .limit(30000)
            .execute()
        )
        for r in pop_res.data or []:
            key = (
                str(r.get("origin_iata") or "").upper(),
                str(r.get("served_city_id") or ""),
            )
            pop_map.setdefault(key, set()).add(r.get("search_fingerprint") or "")
    except Exception:
        pass

    # Best obs per (origin, city, out, ret) — hard deals first, then soft fill
    best: Dict[Tuple[str, str, str, str], Dict[str, Any]] = {}
    soft_pool: Dict[Tuple[str, str, str, str], Dict[str, Any]] = {}
    for obs in observations:
        origin = str(obs.get("origin_iata") or "").upper()
        city_id = str(obs.get("served_city_id") or "")
        out_d = str(obs.get("out_date") or "")[:10]
        ret_d = str(obs.get("ret_date") or "")[:10]
        dest = str(obs.get("dest_iata") or "").upper()
        hb = horizon_bucket(out_d, now=now)
        if not hb or not city_id:
            continue
        bl = _lookup_baseline(
            baselines,
            origin=origin,
            city_id=city_id,
            trip_type=str(obs.get("trip_type") or "OTHER"),
            horizon=hb,
        )
        if not bl:
            continue
        key = (origin, city_id, out_d, ret_d)
        if eligible_candidate(obs, bl, cfg=cfg, now=now):
            cand = {**obs, "_baseline": bl, "_dest": dest, "_soft": False}
            prev = best.get(key)
            best[key] = cand if prev is None else prefer_observation(prev, cand)
        elif eligible_candidate_soft(
            obs, bl, cfg=cfg, now=now, fresh_tau_h=soft_hours
        ):
            cand = {**obs, "_baseline": bl, "_dest": dest, "_soft": True}
            prev = soft_pool.get(key)
            soft_pool[key] = cand if prev is None else prefer_observation(prev, cand)

    # Fill browse target with soft deals not already hard-selected
    if len(best) < browse_target:
        for key, cand in sorted(
            soft_pool.items(),
            key=lambda kv: float(kv[1].get("price_pp_eur") or 9999),
        ):
            if key in best:
                continue
            best[key] = cand
            if len(best) >= browse_target * 2:
                break

    scored: List[Dict[str, Any]] = []
    for (origin, city_id, out_d, ret_d), obs in best.items():
        bl = obs["_baseline"]
        price = float(obs.get("price_pp_eur") or 0)
        obs_dt = _parse_dt(obs.get("observed_at")) or now
        age_h = (now - obs_dt).total_seconds() / 3600.0
        dtd = days_to_departure(out_d, now=now) or 30
        tau = cfg.fresh_tau_short_h if dtd <= 7 else cfg.fresh_tau_h
        pop = len(pop_map.get((origin, city_id), set()))
        vlevel = verification_level_for_provider(obs.get("provider"))
        # Cached deals never get a % badge (discount_pct stored null)
        soft = bool(obs.get("_soft"))
        disc = (
            None
            if vlevel == "cached" or soft
            else discount_pct_vs_usual(price, bl, min_discount=cfg.min_discount)
        )

        # Hotel with photo required for Deals display (cache only — no live LiteAPI)
        hotel_payload = None
        city_name = None
        try:
            composed = compose_hotel(
                supabase,
                iata=obs.get("_dest") or obs.get("dest_iata"),
                checkin=out_d,
                checkout=ret_d,
                adults=2,
                fetch_if_miss=False,
                flight_pp=price,
            )
            city_name = composed.get("city_name")
            hotel = composed.get("hotel") if composed.get("status") == "ready" else None
            top = composed.get("options") or (
                [hotel] if isinstance(hotel, dict) else []
            )
            # Prefer rates top list when available via compose extras
            if composed.get("status") == "ready" and not top and hotel:
                top = [hotel]
            from deals.hotel_budget import filter_hotels_for_flight

            ranked = filter_hotels_for_flight(
                top if isinstance(top, list) else [],
                flight_pp=price,
                adults=2,
                top_n=3,
                require_photo=True,
                checkin=out_d,
                checkout=ret_d,
            )
            if ranked:
                hotel_payload = ranked
            elif isinstance(hotel, dict):
                # Fallback: photo fill then re-filter single
                photo = (
                    hotel.get("photo")
                    or hotel.get("thumbnail")
                    or hotel.get("main_photo")
                )
                if not photo and hotel.get("hotel_id"):
                    try:
                        pr = (
                            supabase.table("hotel_pool")
                            .select("main_photo,thumbnail")
                            .eq("hotel_id", str(hotel["hotel_id"]))
                            .limit(1)
                            .execute()
                        )
                        if pr.data:
                            photo = pr.data[0].get("main_photo") or pr.data[0].get(
                                "thumbnail"
                            )
                            if photo:
                                hotel = {
                                    **hotel,
                                    "photo": photo,
                                    "thumbnail": photo,
                                }
                    except Exception:
                        pass
                if photo:
                    ranked = filter_hotels_for_flight(
                        [{**hotel, "photo": photo}],
                        flight_pp=price,
                        adults=2,
                        top_n=1,
                        require_photo=True,
                        checkin=out_d,
                        checkout=ret_d,
                    )
                    if ranked:
                        hotel_payload = ranked
        except Exception:
            city_name = None
            hotel_payload = None

        # v3.3 Lot A: card photo SoT = hotel_pool (not rates payload)
        if hotel_payload and isinstance(hotel_payload, list):
            try:
                from deals.pool_photos import overlay_pool_photos, photos_map_from_pool

                ids = [
                    str(h.get("hotel_id") or h.get("id") or "")
                    for h in hotel_payload
                    if isinstance(h, dict)
                ]
                pmap = photos_map_from_pool(supabase, ids)
                hotel_payload = overlay_pool_photos(hotel_payload, pmap)
            except Exception:
                pass

        # country from served_cities if needed
        country = ""
        try:
            c = (
                supabase.table("served_cities")
                .select("country_code, city_name")
                .eq("id", city_id)
                .limit(1)
                .execute()
            )
            if c.data:
                country = c.data[0].get("country_code") or ""
                city_name = city_name or c.data[0].get("city_name")
        except Exception:
            pass

        score = deal_score(
            price_pp=price,
            baseline=bl,
            age_hours=age_h,
            tau_h=tau,
            distinct_searches_7d=pop,
            direct=bool(obs.get("direct", True)),
            arrival_ok=arrival_hour_ok(obs.get("out_arr_local")),
            has_hotel=bool(hotel_payload),
            weights=cfg.community_score_weights,
        )
        dest = obs.get("_dest") or obs.get("dest_iata")
        source = obs.get("source") or "organic_search"
        source_mix = "seed" if source == "seed_batch" else "organic"
        deal_key = make_community_deal_key(origin, str(dest), out_d, ret_d)
        scored.append(
            {
                "deal_key": deal_key,
                "origin_iata": origin,
                "served_city_id": city_id,
                "dest_iata": dest,
                "out_date": out_d,
                "ret_date": ret_d,
                "nights": int(obs.get("nights") or 1),
                "trip_type": obs.get("trip_type") or "WEEKEND",
                "verification_level": vlevel,
                "flight_snapshot": {
                    "price_pp_eur": price,
                    "provider": obs.get("provider"),
                    "carrier": obs.get("carrier"),
                    "booking_url": obs.get("booking_url"),
                    "direct": obs.get("direct", True),
                    "out_dep_local": obs.get("out_dep_local"),
                    "ret_dep_local": obs.get("ret_dep_local"),
                    "city_name": city_name,
                    "verification_level": vlevel,
                },
                "baseline_snapshot": {
                    "median": bl.get("median"),
                    "p20": bl.get("p20"),
                    "reliable": bl.get("reliable"),
                    "baseline_kind": "estimated" if soft else bl.get("baseline_kind"),
                    "discount_pct": disc,
                    "soft_fill": soft,
                },
                "hotel_top3": hotel_payload,
                "deal_score": round(score, 4),
                "discount_pct": disc,
                "source_mix": source_mix,
                "status": "active",
                "last_verified_at": now.isoformat(),
                "expires_at": (now + timedelta(hours=tau * 2)).isoformat(),
                "country_code": country,
                "updated_at": now.isoformat(),
            }
        )

    # Diversity per origin
    by_origin: Dict[str, List[Dict[str, Any]]] = {}
    for row in scored:
        by_origin.setdefault(row["origin_iata"], []).append(row)

    promoted = 0
    soft_n = 0
    for origin, rows in by_origin.items():
        kept = apply_diversity(rows, max_per_city=3, max_per_country=5)
        # Cap to browse target per origin (was too tight → empty grid)
        kept = kept[: max(cfg.min_per_origin * 2, browse_target)]
        for row in kept:
            if (row.get("baseline_snapshot") or {}).get("soft_fill"):
                soft_n += 1
            payload = {k: v for k, v in row.items() if k != "country_code"}
            try:
                existing = (
                    supabase.table("deals_active")
                    .select("deal_key, first_seen_at")
                    .eq("deal_key", row["deal_key"])
                    .limit(1)
                    .execute()
                )
                if existing.data:
                    supabase.table("deals_active").update(payload).eq(
                        "deal_key", row["deal_key"]
                    ).execute()
                else:
                    payload["first_seen_at"] = now.isoformat()
                    payload["created_at"] = now.isoformat()
                    supabase.table("deals_active").insert(payload).execute()
                promoted += 1
            except Exception as e:
                logger.warning("promote upsert %s: %s", row.get("deal_key"), e)

    try:
        from deals.community_list import invalidate_list_cache

        invalidate_list_cache()
    except Exception:
        pass

    return {
        "ok": True,
        "candidates": len(best),
        "scored": len(scored),
        "promoted": promoted,
        "soft_fill": soft_n,
        "browse_target": browse_target,
    }
