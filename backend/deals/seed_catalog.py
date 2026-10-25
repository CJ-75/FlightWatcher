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


def select_catalog_rows(
    ranked: Sequence[Dict[str, Any]], *, size: int
) -> List[Dict[str, Any]]:
    """Always keep every pinned city, then fill up to size."""
    pinned = [r for r in ranked if r.get("pinned") and not r.get("excluded")]
    rest = [r for r in ranked if not r.get("pinned") and not r.get("excluded")]
    want = max(int(size), len(pinned))
    return (pinned + rest)[:want]


def pin_trend_catalog_cities(supabase) -> Dict[str, Any]:
    """
    Mark TREND_PIN_IATAS as pinned on seed_catalog_cities (and ensure rows exist).
    Call after upsert_city_mapping so served_cities are present.
    """
    from deals.destinations_seed import TREND_PIN_IATAS

    pins = sorted(TREND_PIN_IATAS)
    if not pins:
        return {"ok": True, "pinned": 0}
    try:
        cities = (
            supabase.table("served_cities")
            .select("id, primary_iata, city_name, verified")
            .in_("primary_iata", pins)
            .execute()
        )
    except Exception as e:
        return {"ok": False, "error": str(e)}

    now = datetime.now(timezone.utc).isoformat()
    pinned_n = 0
    missing: List[str] = []
    found_iatas = {
        str(c.get("primary_iata") or "").upper() for c in (cities.data or [])
    }
    for code in pins:
        if code not in found_iatas:
            missing.append(code)

    for c in cities.data or []:
        cid = c.get("id")
        if not cid:
            continue
        # Ensure verified for curated destinations
        if not c.get("verified"):
            try:
                supabase.table("served_cities").update(
                    {"verified": True, "updated_at": now}
                ).eq("id", cid).execute()
            except Exception as e:
                logger.warning("verify city %s: %s", cid, e)
        payload = {
            "served_city_id": cid,
            "pinned": True,
            "excluded": False,
            "computed_at": now,
        }
        try:
            # Preserve existing rank/supply if present
            existing = (
                supabase.table("seed_catalog_cities")
                .select("seed_rank,n_origins_fr,hotel_supply")
                .eq("served_city_id", cid)
                .limit(1)
                .execute()
            )
            if existing.data:
                payload["seed_rank"] = existing.data[0].get("seed_rank") or 0
                payload["n_origins_fr"] = existing.data[0].get("n_origins_fr") or 1
                payload["hotel_supply"] = existing.data[0].get("hotel_supply") or 0
            else:
                payload["seed_rank"] = 0.5
                payload["n_origins_fr"] = 1
                payload["hotel_supply"] = 0
            supabase.table("seed_catalog_cities").upsert(
                payload, on_conflict="served_city_id"
            ).execute()
            pinned_n += 1
        except Exception as e:
            logger.warning("pin catalog %s: %s", cid, e)

    return {
        "ok": True,
        "pinned": pinned_n,
        "requested": len(pins),
        "missing_iata": missing,
    }


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

    ranked = rank_seed_cities(raw_rows)
    selected = select_catalog_rows(ranked, size=cfg.seed_catalog_size)
    selected_ids = {str(r["served_city_id"]) for r in selected}

    # Drop unselected non-pinned leftovers so catalog stays focused
    try:
        old = (
            supabase.table("seed_catalog_cities")
            .select("served_city_id, pinned")
            .execute()
        )
        for row in old.data or []:
            sid = str(row.get("served_city_id") or "")
            if sid and sid not in selected_ids and not row.get("pinned"):
                supabase.table("seed_catalog_cities").delete().eq(
                    "served_city_id", sid
                ).execute()
    except Exception as e:
        logger.warning("seed catalog prune: %s", e)

    upserted = 0
    for r in selected:
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
        "pinned": sum(1 for r in selected if r.get("pinned")),
        "top": [
            {
                "city": r.get("city_name"),
                "iata": r.get("primary_iata"),
                "rank": r["seed_rank"],
                "pinned": bool(r.get("pinned")),
            }
            for r in selected[:15]
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


def _env_bool(name: str, default: bool) -> bool:
    import os

    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_float(name: str, default: float) -> float:
    import os

    try:
        return float(os.getenv(name, str(default)) or default)
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    import os

    try:
        return int(os.getenv(name, str(default)) or default)
    except (TypeError, ValueError):
        return default


def _seed_ryanair_origins() -> List[str]:
    """Small FR Ryanair hubs — enough for UX, low 403 risk."""
    import os

    # Main FR Ryanair bases (not every regional strip in airports.csv)
    raw = (
        os.getenv("SEED_RYANAIR_ORIGINS")
        or "BVA,MRS,NTE,TLS,NCE,LIL,BIQ,BZR,XCR,GNB"
    ).strip()
    return _parse_iata_list(raw) or [
        "BVA",
        "MRS",
        "NTE",
        "TLS",
        "NCE",
        "LIL",
        "BIQ",
        "BZR",
        "XCR",
        "GNB",
    ]


def seed_scan(supabase, *, cfg: Optional[DealsConfig] = None, dry_run: bool = False) -> Dict[str, Any]:
    """
    Scan seed catalog × FR origins into price_observations (source=seed_batch).

    Travelpayouts always (bulk). Ryanair optionally, slowly:
      - SEED_RYANAIR_ENABLED (default true)
      - only SEED_RYANAIR_ORIGINS (main FR hubs)
      - only the nearest weekend date pair
      - max SEED_RYANAIR_MAX_CELLS_PER_RUN (default 8)
      - pause SEED_RYANAIR_PAUSE_S (default 4s) between Ryanair cells
      - PURPOSE_SEED counts against RYANAIR_BUDGET_PER_HOUR
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

    ryanair_on = _env_bool("SEED_RYANAIR_ENABLED", True)
    ryanair_max_cells = max(0, _env_int("SEED_RYANAIR_MAX_CELLS_PER_RUN", 8))
    ryanair_pause_s = max(0.0, _env_float("SEED_RYANAIR_PAUSE_S", 4.0))
    ryanair_origins = set(_seed_ryanair_origins())
    ryanair_cells = 0
    ryanair_hits = 0
    ryanair_skips = 0

    try:
        cat = (
            supabase.table("seed_catalog_cities")
            .select(
                "served_city_id, excluded, pinned, seed_rank, "
                "served_cities(primary_iata, city_name, verified)"
            )
            .eq("excluded", False)
            .limit(cfg.seed_catalog_size)
            .execute()
        )
        entries = cat.data or []
    except Exception as e:
        return {"ok": False, "error": str(e)}

    # Prefer classics with supply first (rank>0), then new pins
    entries.sort(
        key=lambda r: (
            0 if r.get("pinned") else 1,
            -(float(r.get("seed_rank") or 0)),
        )
    )

    date_pairs = date_pairs_from_sets()
    # Ryanair only on nearest pair (usually first weekend) — fewer HTTP calls
    ryanair_date_pair: Optional[Tuple[str, str]] = date_pairs[0] if date_pairs else None

    scans_done = 0
    skipped_organic = 0
    errors = 0
    trips_recorded = 0
    aborted_circuit = False
    cell_gaps_h: List[float] = []

    # Seed must collect price points for baselines — NOT the deal wall cap.
    # Wall/promote still filters with DEALS_MAX_FLIGHT_PP later.
    import os

    try:
        seed_budget_pp = float(os.getenv("SEED_SCAN_MAX_PP", "0") or 0)
    except ValueError:
        seed_budget_pp = 0.0
    if seed_budget_pp <= 0:
        seed_budget_pp = max(float(cfg.max_flight_pp) * 3.5, 450.0)
    seed_budget_pp = int(seed_budget_pp)

    from api_models import DateAvecHoraire
    from providers.orchestrator import search_roundtrips
    from providers.ryanair_budget import PURPOSE_SEED

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
                # Abort only if BOTH providers are dead
                if is_circuit_open("travelpayouts") and (
                    not ryanair_on or is_circuit_open("ryanair")
                ):
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

                    trips: List[Any] = []
                    if not is_circuit_open("travelpayouts"):
                        trips, _nq = search_roundtrips(
                            aeroport_depart=origin,
                            dates_depart=[DateAvecHoraire(date=out_d)],
                            dates_retour=[DateAvecHoraire(date=ret_d)],
                            budget_max=seed_budget_pp,
                            limite_allers=30,
                            destinations_incluses=[dest_iata],
                            record_prices=False,
                            passengers=1,
                            direct=True,
                            providers=["travelpayouts"],
                        )
                        trips = [
                            t
                            for t in trips
                            if (getattr(t, "destination_code", None) or "").upper()
                            == dest_iata
                        ]
                        if not trips:
                            trips, _nq2 = search_roundtrips(
                                aeroport_depart=origin,
                                dates_depart=[DateAvecHoraire(date=out_d)],
                                dates_retour=[DateAvecHoraire(date=ret_d)],
                                budget_max=seed_budget_pp,
                                limite_allers=30,
                                destinations_incluses=[dest_iata],
                                record_prices=False,
                                passengers=1,
                                direct=False,
                                providers=["travelpayouts"],
                            )
                            trips = [
                                t
                                for t in trips
                                if (getattr(t, "destination_code", None) or "").upper()
                                == dest_iata
                            ]

                    # Ryanair overlay — sparse, slow, priority hubs only
                    want_ryanair = (
                        ryanair_on
                        and ryanair_max_cells > 0
                        and ryanair_cells < ryanair_max_cells
                        and origin in ryanair_origins
                        and ryanair_date_pair is not None
                        and (out_d, ret_d) == ryanair_date_pair
                        and not is_circuit_open("ryanair")
                    )
                    if want_ryanair:
                        if ryanair_pause_s > 0:
                            import time as _time

                            _time.sleep(ryanair_pause_s)
                        try:
                            ra_trips, _ra_nq = search_roundtrips(
                                aeroport_depart=origin,
                                dates_depart=[DateAvecHoraire(date=out_d)],
                                dates_retour=[DateAvecHoraire(date=ret_d)],
                                budget_max=seed_budget_pp,
                                limite_allers=12,
                                destinations_incluses=[dest_iata],
                                record_prices=False,
                                passengers=1,
                                direct=True,
                                providers=["ryanair"],
                                ryanair_purpose=PURPOSE_SEED,
                            )
                            ra_trips = [
                                t
                                for t in ra_trips
                                if (getattr(t, "destination_code", None) or "").upper()
                                == dest_iata
                            ]
                            ryanair_cells += 1
                            if ra_trips:
                                ryanair_hits += 1
                                # Prefer live Ryanair rows; keep TP as fill
                                trips = list(ra_trips) + list(trips or [])
                            if is_circuit_open("ryanair"):
                                logger.warning(
                                    "seed_scan: ryanair circuit opened — TP-only for rest of run"
                                )
                                ryanair_on = False
                        except Exception as ra_e:
                            ryanair_skips += 1
                            logger.warning(
                                "seed_scan ryanair %s→%s: %s", origin, dest_iata, ra_e
                            )
                            if is_circuit_open("ryanair"):
                                ryanair_on = False
                    elif (
                        ryanair_on
                        and origin in ryanair_origins
                        and ryanair_date_pair
                        and (out_d, ret_d) == ryanair_date_pair
                    ):
                        ryanair_skips += 1

                    if trips:
                        record_price_observations(
                            trips, source="seed_batch", sync=True
                        )
                        trips_recorded += len(trips)
                    scans_done += 1
                    seed_cell_pause()
                except Exception as e:
                    errors += 1
                    logger.warning("seed_scan %s→%s %s: %s", origin, dest_iata, out_d, e)
                    seed_cell_pause()
                    if is_circuit_open("travelpayouts") and is_circuit_open("ryanair"):
                        aborted_circuit = True
                        break
                    if errors >= 12:
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

    providers_used = ["travelpayouts"]
    if ryanair_cells > 0:
        providers_used.append("ryanair")

    return {
        "ok": True,
        "scans": scans_done,
        "trips_recorded": trips_recorded,
        "seed_budget_pp": seed_budget_pp,
        "budget": budget,
        "already_today": already,
        "remaining_cap": remaining,
        "skipped_organic": skipped_organic,
        "errors": errors,
        "aborted_circuit": aborted_circuit,
        "providers": providers_used,
        "ryanair": {
            "enabled": _env_bool("SEED_RYANAIR_ENABLED", True),
            "cells": ryanair_cells,
            "hits": ryanair_hits,
            "skips": ryanair_skips,
            "max_cells": ryanair_max_cells,
            "origins": sorted(ryanair_origins),
            "pause_s": ryanair_pause_s,
            "date_pair": list(ryanair_date_pair) if ryanair_date_pair else None,
        },
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
