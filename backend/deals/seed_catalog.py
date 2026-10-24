"""
D2 — auto seed catalog + seed_scan (budget/day).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from deals.liteapi_config import DealsConfig, load_deals_config
from deals.observations import record_price_observations

logger = logging.getLogger("deals.seed_catalog")

# Active FR origins for seed (override via DEALS_ORIGINS)
DEFAULT_FR_ORIGINS = ["BVA", "ORY", "CDG", "MRS", "NCE", "LYS", "TLS", "BOD", "NTE", "SXB"]


def _origins(cfg: DealsConfig) -> List[str]:
    import os

    raw = (os.getenv("DEALS_ORIGINS") or "").strip()
    if raw:
        return [p.strip().upper() for p in raw.split(",") if len(p.strip()) == 3]
    return list(DEFAULT_FR_ORIGINS)


def _norm(values: Sequence[float]) -> List[float]:
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi <= lo:
        return [1.0 for _ in values]
    return [(v - lo) / (hi - lo) for v in values]


def rank_seed_cities(
    cities: Sequence[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    cities items: served_city_id, country_code, n_origins_fr, hotel_supply
    seed_rank = 0.6 * norm(hotel_supply) + 0.4 * norm(n_origins_fr)
    diversity: max 3 per country
    """
    supplies = [float(c.get("hotel_supply") or 0) for c in cities]
    origins = [float(c.get("n_origins_fr") or 0) for c in cities]
    ns = _norm(supplies)
    no = _norm(origins)
    ranked = []
    for i, c in enumerate(cities):
        ranked.append(
            {
                **c,
                "seed_rank": round(0.6 * ns[i] + 0.4 * no[i], 4),
            }
        )
    ranked.sort(key=lambda r: -r["seed_rank"])
    by_country: Dict[str, int] = {}
    out: List[Dict[str, Any]] = []
    for r in ranked:
        if r.get("excluded"):
            continue
        country = str(r.get("country_code") or "")
        if not r.get("pinned"):
            if country and by_country.get(country, 0) >= 3:
                continue
        out.append(r)
        if country and not r.get("pinned"):
            by_country[country] = by_country.get(country, 0) + 1
    # pinned first
    out.sort(key=lambda r: (0 if r.get("pinned") else 1, -r["seed_rank"]))
    return out


def build_seed_catalog(supabase, *, cfg: Optional[DealsConfig] = None) -> Dict[str, Any]:
    """
    Auto catalog from verified served cities.
    hotel_supply: prefer hotel_pool count via deal_destinations primary_iata; else 0.
    n_origins_fr: count of FR origins that have recent observations to that city, else 1.
    """
    cfg = cfg or load_deals_config()
    now = datetime.now(timezone.utc)

    try:
        cities_res = (
            supabase.table("served_cities")
            .select("id, slug, city_name, country_code, primary_iata, verified")
            .eq("verified", True)
            .limit(500)
            .execute()
        )
        cities = cities_res.data or []
    except Exception as e:
        return {"ok": False, "error": str(e)}

    # hotel_supply from hotel_pool via deal_destinations
    supply_by_iata: Dict[str, int] = {}
    try:
        dests = (
            supabase.table("deal_destinations")
            .select("id, iata_arrival")
            .eq("active", True)
            .execute()
        )
        for d in dests.data or []:
            did = d["id"]
            iata = str(d.get("iata_arrival") or "").upper()
            cnt = (
                supabase.table("hotel_pool")
                .select("id", count="exact")
                .eq("destination_id", did)
                .execute()
            )
            supply_by_iata[iata] = int(cnt.count or 0)
    except Exception as e:
        logger.warning("hotel_supply: %s", e)

    # n_origins from observations
    origins_by_city: Dict[str, set] = {}
    try:
        since = (now - timedelta(days=30)).isoformat()
        obs = (
            supabase.table("price_observations")
            .select("origin_iata, served_city_id")
            .gte("observed_at", since)
            .limit(20000)
            .execute()
        )
        for r in obs.data or []:
            cid = str(r.get("served_city_id") or "")
            oi = str(r.get("origin_iata") or "").upper()
            if cid and oi:
                origins_by_city.setdefault(cid, set()).add(oi)
    except Exception:
        pass

    # existing overrides
    overrides: Dict[str, Dict[str, Any]] = {}
    try:
        ov = supabase.table("seed_catalog_cities").select("*").execute()
        for r in ov.data or []:
            overrides[str(r["served_city_id"])] = r
    except Exception:
        pass

    raw_rows = []
    for c in cities:
        cid = str(c["id"])
        iata = str(c.get("primary_iata") or "").upper()
        ov = overrides.get(cid) or {}
        raw_rows.append(
            {
                "served_city_id": cid,
                "country_code": c.get("country_code") or "",
                "n_origins_fr": len(origins_by_city.get(cid, set())) or 1,
                "hotel_supply": supply_by_iata.get(iata, 0),
                "pinned": bool(ov.get("pinned")),
                "excluded": bool(ov.get("excluded")),
                "city_name": c.get("city_name"),
                "primary_iata": iata,
            }
        )

    ranked = rank_seed_cities(raw_rows)[: cfg.seed_catalog_size]
    upserted = 0
    for r in ranked:
        payload = {
            "served_city_id": r["served_city_id"],
            "seed_rank": r["seed_rank"],
            "n_origins_fr": r["n_origins_fr"],
            "hotel_supply": r["hotel_supply"],
            "pinned": r.get("pinned", False),
            "excluded": r.get("excluded", False),
            "computed_at": now.isoformat(),
        }
        try:
            supabase.table("seed_catalog_cities").upsert(
                payload, on_conflict="served_city_id"
            ).execute()
            upserted += 1
        except Exception as e:
            logger.warning("seed catalog upsert: %s", e)

    return {
        "ok": True,
        "candidates": len(raw_rows),
        "catalog_size": upserted,
        "top": [
            {"city": r.get("city_name"), "iata": r.get("primary_iata"), "rank": r["seed_rank"]}
            for r in ranked[:10]
        ],
    }


def _weekend_dates(n: int = 3) -> List[Tuple[str, str]]:
    """Next n Fri→Sun pairs."""
    today = date.today()
    # next Friday
    days_to_fri = (4 - today.weekday()) % 7
    if days_to_fri == 0 and datetime.now().hour > 12:
        days_to_fri = 7
    if days_to_fri == 0:
        days_to_fri = 7
    out = []
    for i in range(n):
        fri = today + timedelta(days=days_to_fri + 7 * i)
        sun = fri + timedelta(days=2)
        out.append((fri.isoformat(), sun.isoformat()))
    return out


def _short_midweek(n: int = 2) -> List[Tuple[str, str]]:
    """Tue→Thu in 2–6 weeks."""
    today = date.today()
    out = []
    for weeks in (2, 4)[:n]:
        start = today + timedelta(weeks=weeks)
        # next Tuesday
        delta = (1 - start.weekday()) % 7
        tue = start + timedelta(days=delta)
        thu = tue + timedelta(days=2)
        out.append((tue.isoformat(), thu.isoformat()))
    return out


def _week_stays(n: int = 2) -> List[Tuple[str, str]]:
    today = date.today()
    out = []
    for weeks in (4, 8)[:n]:
        start = today + timedelta(weeks=weeks)
        delta = (4 - start.weekday()) % 7  # Friday
        fri = start + timedelta(days=delta)
        next_fri = fri + timedelta(days=7)
        out.append((fri.isoformat(), next_fri.isoformat()))
    return out


def seed_scan(supabase, *, cfg: Optional[DealsConfig] = None, dry_run: bool = False) -> Dict[str, Any]:
    """
    Scan seed catalog × FR origins into price_observations (source=seed_batch).
    Respects SEED_SCAN_BUDGET_PER_DAY; skips cells with fresh organic obs (<12h).
    """
    cfg = cfg or load_deals_config()
    origins = _origins(cfg)
    budget = cfg.seed_scan_budget_per_day

    try:
        cat = (
            supabase.table("seed_catalog_cities")
            .select("served_city_id, excluded, served_cities(primary_iata, city_name, verified)")
            .eq("excluded", False)
            .limit(cfg.seed_catalog_size)
            .execute()
        )
        entries = cat.data or []
    except Exception as e:
        return {"ok": False, "error": str(e)}

    date_pairs = _weekend_dates(3) + _short_midweek(2) + _week_stays(2)
    scans_done = 0
    skipped_organic = 0
    errors = 0

    from api_models import DateAvecHoraire
    from providers.orchestrator import search_roundtrips

    for entry in entries:
        if scans_done >= budget:
            break
        city = entry.get("served_cities") or {}
        if isinstance(city, list):
            city = city[0] if city else {}
        dest_iata = str(city.get("primary_iata") or "").upper()
        if len(dest_iata) != 3:
            continue
        city_id = entry.get("served_city_id")

        for origin in origins:
            if scans_done >= budget:
                break
            for out_d, ret_d in date_pairs:
                if scans_done >= budget:
                    break
                # Skip if fresh organic exists
                try:
                    since = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()
                    existing = (
                        supabase.table("price_observations")
                        .select("id")
                        .eq("origin_iata", origin)
                        .eq("served_city_id", city_id)
                        .eq("out_date", out_d)
                        .eq("source", "organic_search")
                        .gte("observed_at", since)
                        .limit(1)
                        .execute()
                    )
                    if existing.data:
                        skipped_organic += 1
                        continue
                except Exception:
                    pass

                if dry_run:
                    scans_done += 1
                    continue

                try:
                    trips, _nq = search_roundtrips(
                        aeroport_depart=origin,
                        dates_depart=[DateAvecHoraire(date=out_d)],
                        dates_retour=[DateAvecHoraire(date=ret_d)],
                        budget_max=int(cfg.max_flight_pp * 1.5),
                        limite_allers=30,
                        destinations_incluses=[dest_iata],
                        record_prices=False,  # we write seed_batch ourselves
                        passengers=1,
                        direct=True,
                    )
                    # Filter to dest
                    trips = [
                        t
                        for t in trips
                        if (getattr(t, "destination_code", None) or "").upper() == dest_iata
                    ]
                    if trips:
                        record_price_observations(
                            trips, source="seed_batch", sync=True
                        )
                    scans_done += 1
                except Exception as e:
                    errors += 1
                    logger.warning("seed_scan %s→%s %s: %s", origin, dest_iata, out_d, e)

    return {
        "ok": True,
        "scans": scans_done,
        "budget": budget,
        "skipped_organic": skipped_organic,
        "errors": errors,
        "dry_run": dry_run,
    }
