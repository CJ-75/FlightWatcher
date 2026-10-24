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


def _parse_iata_list(raw: str) -> List[str]:
    out: List[str] = []
    seen = set()
    for part in (raw or "").replace(";", ",").split(","):
        code = part.strip().upper()
        if len(code) == 3 and code.isalpha() and code not in seen:
            seen.add(code)
            out.append(code)
    return out


def _origins(cfg: DealsConfig) -> List[str]:
    import os

    raw = (os.getenv("DEALS_ORIGINS") or "").strip()
    if raw:
        return _parse_iata_list(raw)
    return list(DEFAULT_FR_ORIGINS)


def _priority_origins() -> List[str]:
    import os

    raw = (
        os.getenv("SEED_PRIORITY_ORIGINS") or "BVA,MRS,NTE,BOD,TLS,LYS"
    ).strip()
    return _parse_iata_list(raw)


def ordered_seed_origins(cfg: DealsConfig) -> List[str]:
    """Priority origins first, then the rest of DEALS_ORIGINS."""
    all_o = _origins(cfg)
    allow = set(all_o)
    ordered: List[str] = []
    seen = set()
    for code in _priority_origins() + all_o:
        if code in allow and code not in seen:
            seen.add(code)
            ordered.append(code)
    return ordered or all_o


def date_pairs_from_sets(raw: Optional[str] = None) -> List[Tuple[str, str]]:
    """
    SEED_DATE_SETS tokens e.g. WEEKEND3,SHORT1,WEEK1
    Default Lot E: 3 weekends + 1 short midweek.
    """
    import os

    spec = (raw if raw is not None else os.getenv("SEED_DATE_SETS", "WEEKEND3,SHORT1") or "").strip()
    pairs: List[Tuple[str, str]] = []
    for token in spec.replace(";", ",").split(","):
        t = token.strip().upper()
        if not t:
            continue
        if t.startswith("WEEKEND"):
            n = int("".join(c for c in t[7:] if c.isdigit()) or "3")
            pairs.extend(_weekend_dates(max(1, n)))
        elif t.startswith("SHORT"):
            n = int("".join(c for c in t[5:] if c.isdigit()) or "1")
            pairs.extend(_short_midweek(max(1, n)))
        elif t.startswith("WEEK"):
            n = int("".join(c for c in t[4:] if c.isdigit()) or "1")
            pairs.extend(_week_stays(max(1, n)))
    # Dedup preserve order
    seen = set()
    uniq: List[Tuple[str, str]] = []
    for p in pairs:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return uniq or _weekend_dates(3)


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
    v3.2: Travelpayouts only (no Ryanair). Respects SEED_SCAN_BUDGET_PER_DAY;
    skips cells with fresh organic obs (<12h).
    """
    cfg = cfg or load_deals_config()
    origins = ordered_seed_origins(cfg)
    budget = cfg.seed_scan_budget_per_day

    from deals.job_runs import scans_done_today
    from providers.throttle import is_circuit_open, seed_cell_pause

    already = scans_done_today(supabase, "seed-scan")
    remaining = max(0, budget - already)
    if remaining <= 0:
        return {
            "ok": True,
            "scans": 0,
            "budget": budget,
            "already_today": already,
            "skipped": "daily_budget_exhausted",
            "dry_run": dry_run,
        }

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

    date_pairs = date_pairs_from_sets()
    scans_done = 0
    skipped_organic = 0
    errors = 0
    aborted_circuit = False
    cell_gaps_h: List[float] = []

    from api_models import DateAvecHoraire
    from providers.orchestrator import search_roundtrips

    for entry in entries:
        if scans_done >= remaining:
            break
        city = entry.get("served_cities") or {}
        if isinstance(city, list):
            city = city[0] if city else {}
        dest_iata = str(city.get("primary_iata") or "").upper()
        if len(dest_iata) != 3:
            continue
        city_id = entry.get("served_city_id")

        for origin in origins:
            if scans_done >= remaining:
                break
            for out_d, ret_d in date_pairs:
                if scans_done >= remaining:
                    break
                # v3.2: seed is Travelpayouts-only (no Ryanair)
                if is_circuit_open("travelpayouts"):
                    aborted_circuit = True
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
                    gap = _hours_since_last_seed_cell(
                        supabase,
                        origin=origin,
                        served_city_id=city_id,
                        out_date=out_d,
                    )
                    if gap is not None:
                        cell_gaps_h.append(gap)

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
                        providers=["travelpayouts"],
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
                    seed_cell_pause()
                except Exception as e:
                    errors += 1
                    logger.warning("seed_scan %s→%s %s: %s", origin, dest_iata, out_d, e)
                    seed_cell_pause()
                    if is_circuit_open("travelpayouts") and errors >= 5:
                        aborted_circuit = True
                        break
            if aborted_circuit:
                break
        if aborted_circuit:
            break

    avg_gap = (
        round(sum(cell_gaps_h) / len(cell_gaps_h), 1) if cell_gaps_h else None
    )
    if avg_gap is not None:
        logger.info(
            "seed_scan avg hours since last same-cell seed: %s (n=%s)",
            avg_gap,
            len(cell_gaps_h),
        )

    return {
        "ok": True,
        "scans": scans_done,
        "budget": budget,
        "already_today": already,
        "remaining_cap": remaining,
        "skipped_organic": skipped_organic,
        "errors": errors,
        "aborted_circuit": aborted_circuit,
        "providers": ["travelpayouts"],
        "origins_order": origins,
        "date_pairs": len(date_pairs),
        "avg_cell_gap_h": avg_gap,
        "dry_run": dry_run,
    }


def _hours_since_last_seed_cell(
    supabase,
    *,
    origin: str,
    served_city_id: Any,
    out_date: str,
) -> Optional[float]:
    if not served_city_id:
        return None
    try:
        res = (
            supabase.table("price_observations")
            .select("observed_at")
            .eq("origin_iata", origin)
            .eq("served_city_id", served_city_id)
            .eq("out_date", out_date)
            .eq("source", "seed_batch")
            .order("observed_at", desc=True)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        raw = res.data[0].get("observed_at")
        if not raw:
            return None
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0
    except Exception:
        return None
