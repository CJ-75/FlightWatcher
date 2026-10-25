"""
Phase 0 — wall funnel diagnostic (observations → promote → active → wall).

  cd backend
  python -m deals.wall_funnel_diag
  python -m deals.wall_funnel_diag --origin BVA --hours 48

Prints JSON with step counts, config knobs, job lag, TTFB tip, and a single verdict:
  A catalog/seed | B promote | C rates/photos | D wall filters | E jobs stale | F latency
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env, override=True)


def _svc():
    from supabase_deps import SUPABASE_AVAILABLE, get_supabase_client, get_supabase_service_client

    if not SUPABASE_AVAILABLE:
        return None
    return get_supabase_service_client() or get_supabase_client()


def _count_query(supabase, table: str, apply, *, id_col: str = "id") -> int:
    try:
        q = supabase.table(table).select(id_col, count="exact")
        q = apply(q)
        res = q.limit(1).execute()
        if getattr(res, "count", None) is not None:
            return int(res.count)
    except Exception:
        pass
    try:
        q = supabase.table(table).select(id_col)
        q = apply(q)
        res = q.limit(5000).execute()
        return len(res.data or [])
    except Exception:
        return -1


def _job_lag(supabase) -> Dict[str, Any]:
    jobs = (
        "seed-scan",
        "refresh-baselines",
        "promote-deals",
        "refresh-deal-rates",
        "materialize-wall",
    )
    out: Dict[str, Any] = {}
    now = datetime.now(timezone.utc)
    for name in jobs:
        try:
            res = (
                supabase.table("deals_job_runs")
                .select("job_name,status,finished_at,started_at")
                .eq("job_name", name)
                .order("started_at", desc=True)
                .limit(1)
                .execute()
            )
            row = (res.data or [None])[0]
            if not row:
                out[name] = {"ok": False, "age_h": None, "status": "missing"}
                continue
            raw = row.get("finished_at") or row.get("started_at")
            age_h = None
            if raw:
                dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                age_h = round((now - dt).total_seconds() / 3600.0, 2)
            out[name] = {
                "ok": row.get("status") in ("ok", "success", "completed"),
                "age_h": age_h,
                "status": row.get("status"),
            }
        except Exception as e:
            out[name] = {"ok": False, "age_h": None, "status": f"err:{e}"}
    return out


def _sample_obs(supabase, origin: Optional[str], since_iso: str, limit: int = 400) -> List[Dict]:
    try:
        q = (
            supabase.table("price_observations")
            .select(
                "id,origin_iata,dest_iata,served_city_id,out_date,ret_date,nights,"
                "price_pp_eur,observed_at,out_arr_local,trip_type"
            )
            .gte("observed_at", since_iso)
            .order("observed_at", desc=True)
            .limit(limit)
        )
        if origin:
            q = q.eq("origin_iata", origin.upper())
        return list(q.execute().data or [])
    except Exception:
        return []


def collect_wall_funnel(
    supabase,
    *,
    origin: Optional[str] = None,
    hours: float = 48.0,
) -> Dict[str, Any]:
    from deals.baselines import horizon_bucket
    from deals.liteapi_config import load_deals_config
    from deals.promote import (
        _load_baselines_map,
        _lookup_baseline,
        eligible_candidate,
        eligible_candidate_soft,
    )

    cfg = load_deals_config()
    now = datetime.now(timezone.utc)
    since = (now - timedelta(hours=hours)).isoformat()
    origin_u = (origin or "").strip().upper() or None

    # Catalog / seed size (excluded=false preferred)
    catalog_n = _count_query(
        supabase,
        "seed_catalog_cities",
        lambda q: q.eq("excluded", False),
        id_col="served_city_id",
    )
    if catalog_n < 0:
        catalog_n = _count_query(
            supabase, "seed_catalog_cities", lambda q: q, id_col="served_city_id"
        )
    dest_n = _count_query(supabase, "deal_destinations", lambda q: q)

    obs = _sample_obs(supabase, origin_u, since)
    obs_n = len(obs)
    with_city = [r for r in obs if r.get("served_city_id")]
    baselines = _load_baselines_map(supabase)
    with_bl: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
    for r in with_city:
        origin_i = str(r.get("origin_iata") or "").upper()
        city_id = str(r.get("served_city_id") or "")
        out_date = str(r.get("out_date") or "")[:10]
        hb = horizon_bucket(out_date, now=now) or ""
        trip_type = str(r.get("trip_type") or "OTHER")
        bl = _lookup_baseline(
            baselines,
            origin=origin_i,
            city_id=city_id,
            trip_type=trip_type,
            horizon=hb,
        )
        if bl:
            with_bl.append((r, bl))

    hard = sum(1 for r, bl in with_bl if eligible_candidate(r, bl, cfg=cfg, now=now))
    soft = sum(
        1
        for r, bl in with_bl
        if eligible_candidate_soft(r, bl, cfg=cfg, now=now)
        and not eligible_candidate(r, bl, cfg=cfg, now=now)
    )

    def _active_q(q):
        q = q.eq("status", "active")
        if origin_u:
            q = q.eq("origin_iata", origin_u)
        return q

    # PK is deal_key (not id)
    active_n = _count_query(
        supabase, "deals_active", _active_q, id_col="deal_key"
    )

    # Sample active for photo / hotel_top3
    try:
        aq = (
            supabase.table("deals_active")
            .select("deal_key,origin_iata,hotel_top3,flight_snapshot")
            .eq("status", "active")
            .limit(200)
        )
        if origin_u:
            aq = aq.eq("origin_iata", origin_u)
        active_rows = list(aq.execute().data or [])
    except Exception:
        active_rows = []

    with_hotel = 0
    with_photo = 0
    cached_n = 0
    for r in active_rows:
        top = r.get("hotel_top3")
        if isinstance(top, list) and top:
            with_hotel += 1
            h0 = top[0] if isinstance(top[0], dict) else {}
            if h0.get("photo"):
                with_photo += 1
        snap = r.get("flight_snapshot") if isinstance(r.get("flight_snapshot"), dict) else {}
        vl = str(snap.get("verification_level") or "").lower()
        if vl == "cached" or str(snap.get("provider") or "").lower() in (
            "travelpayouts",
            "tp",
            "cached",
        ):
            cached_n += 1

    photo_share = (with_photo / len(active_rows)) if active_rows else 0.0
    cached_share = (cached_n / len(active_rows)) if active_rows else 0.0
    # Simulated wall after share cap
    cap = float(cfg.cached_max_share)
    if cached_share > cap and active_rows:
        # rough: live keep all, cached trimmed to cap * total
        live = len(active_rows) - cached_n
        cached_keep = int(cap * len(active_rows))
        after_cap = live + min(cached_n, max(0, cached_keep - live if live < int(cap * len(active_rows)) else cached_keep))
        # simpler estimate
        max_cached = int(round(cap * (live / max(1e-6, 1 - cap)))) if cap < 1 else cached_n
        after_cap = live + min(cached_n, max_cached)
    else:
        after_cap = len(active_rows)

    job_lag = _job_lag(supabase)
    stale_jobs = [
        k
        for k, v in job_lag.items()
        if v.get("age_h") is None
        or (isinstance(v.get("age_h"), (int, float)) and v["age_h"] > 12)
        or not v.get("ok")
    ]

    # Wall assemble timing (in-process)
    ttfb_ms = None
    wall_n = None
    try:
        from deals.community_list import invalidate_list_cache, list_community_deals

        invalidate_list_cache()
        t0 = time.monotonic()
        deals = list_community_deals(
            supabase,
            origin=origin_u,
            adults=2,
            limit=36,
            duration="weekend",
        )
        ttfb_ms = round((time.monotonic() - t0) * 1000)
        wall_n = len(deals or [])
    except Exception as e:
        ttfb_ms = None
        wall_n = None
        wall_err = str(e)
    else:
        wall_err = None

    steps = {
        "obs_recent": obs_n,
        "obs_with_served_city": len(with_city),
        "obs_with_baseline": len(with_bl),
        "eligible_hard": hard,
        "eligible_soft_only": soft,
        "deals_active": active_n,
        "active_sampled": len(active_rows),
        "active_with_hotel_top3": with_hotel,
        "active_with_photo": with_photo,
        "active_cached_share": round(cached_share, 3),
        "est_after_cached_cap": after_cap,
        "wall_returned": wall_n,
        "wall_ttfb_ms": ttfb_ms,
        "wall_error": wall_err,
    }

    verdict, reasons = _verdict(
        steps=steps,
        catalog_n=catalog_n if catalog_n >= 0 else cfg.seed_catalog_size,
        seed_target=cfg.seed_catalog_size,
        photo_share=photo_share,
        cached_share=cached_share,
        cached_cap=cap,
        stale_jobs=stale_jobs,
        scheduler=cfg.scheduler_enabled,
        ttfb_ms=ttfb_ms,
        wall_n=wall_n,
        hard=hard,
        soft=soft,
        obs_n=obs_n,
    )

    return {
        "ok": True,
        "at": now.isoformat(),
        "origin": origin_u,
        "hours": hours,
        "config": {
            "scheduler_enabled": cfg.scheduler_enabled,
            "seed_catalog_size": cfg.seed_catalog_size,
            "seed_scan_budget_per_day": cfg.seed_scan_budget_per_day,
            "min_discount": cfg.min_discount,
            "max_flight_pp": cfg.max_flight_pp,
            "fresh_tau_h": cfg.fresh_tau_h,
            "cached_max_share": cfg.cached_max_share,
            "deals_source": cfg.deals_source,
        },
        "catalog": {
            "seed_catalog_cities": catalog_n,
            "deal_destinations": dest_n,
            "seed_catalog_size_cfg": cfg.seed_catalog_size,
        },
        "steps": steps,
        "job_lag": job_lag,
        "stale_jobs": stale_jobs,
        "verdict": verdict,
        "reasons": reasons,
        "knob_hints": _knob_hints(verdict),
    }


def _verdict(
    *,
    steps: Dict[str, Any],
    catalog_n: int,
    seed_target: int,
    photo_share: float,
    cached_share: float,
    cached_cap: float,
    stale_jobs: List[str],
    scheduler: bool,
    ttfb_ms: Optional[int],
    wall_n: Optional[int],
    hard: int,
    soft: int,
    obs_n: int,
) -> Tuple[str, List[str]]:
    reasons: List[str] = []
    # E jobs
    if not scheduler or len(stale_jobs) >= 2:
        reasons.append(
            "jobs stale or scheduler off: " + (", ".join(stale_jobs) or "scheduler=false")
        )
        if wall_n is not None and wall_n < 20:
            return "E", reasons
    # A catalog
    if catalog_n >= 0 and catalog_n < max(15, int(seed_target * 0.6)):
        reasons.append(f"catalog thin ({catalog_n} vs target {seed_target})")
    if obs_n < 30:
        reasons.append(f"few recent observations ({obs_n})")
        return "A", reasons or ["supply/seed too small"]
    # B promote
    if hard + soft < 10 and obs_n >= 30:
        reasons.append(f"promote strict (hard={hard} soft={soft} from {obs_n} obs)")
        return "B", reasons
    # C rates/photos
    if steps.get("deals_active", 0) >= 15 and photo_share < 0.5:
        reasons.append(f"photo/hotel materialize weak (photo_share={photo_share:.0%})")
        return "C", reasons
    # D wall filters
    active = int(steps.get("deals_active") or 0)
    wall = wall_n if wall_n is not None else 0
    if active >= 25 and wall < 20:
        reasons.append(
            f"wall filters shrink inventory (active={active} wall={wall} cached_share={cached_share:.0%} cap={cached_cap:.0%})"
        )
        return "D", reasons
    # F latency (cold wall >800ms even if volume OK)
    if ttfb_ms is not None and ttfb_ms > 800:
        reasons.append(f"wall TTFB slow ({ttfb_ms}ms)")
        if wall is not None and wall >= 15:
            return "F", reasons
    if reasons and catalog_n >= 0 and catalog_n < seed_target:
        return "A", reasons
    if wall is not None and wall < 20:
        reasons.append(f"thin wall ({wall})")
        return "A" if obs_n < 80 else "B", reasons
    reasons.append("funnel healthy enough — tune catalog waves or perceived latency")
    if ttfb_ms and ttfb_ms > 400:
        return "F", reasons
    return "A", reasons  # default: still expand catalog for variety


def _knob_hints(verdict: str) -> List[str]:
    return {
        "A": [
            "Raise SEED_CATALOG_SIZE (e.g. 35) and SEED_SCAN_BUDGET_PER_DAY",
            "Run build-seed-catalog + seed-scan + refresh-baselines",
        ],
        "B": [
            "Lower DEALS_MIN_DISCOUNT (0.15 → 0.10)",
            "Raise DEALS_MAX_FLIGHT_PP / DEALS_FRESH_TAU_H",
        ],
        "C": [
            "Raise DEALS_RATES_REFRESH_MAX_CALLS",
            "Run refresh-deal-rates + materialize-wall + backfill-pool-photos",
        ],
        "D": [
            "Raise DEALS_CACHED_MAX_SHARE (0.30 → 0.50)",
            "Relax DEALS_WALL_MAX_PER_CITY",
        ],
        "E": [
            "Set DEALS_SCHEDULER_ENABLED=true",
            "Trigger promote-deals → refresh-deal-rates → materialize-wall",
        ],
        "F": [
            "Shared wall cache (file L2) + FE skeleton / SWR",
            "Check multi-worker cold cache",
        ],
    }.get(verdict, [])


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Deals wall funnel diagnostic")
    p.add_argument("--origin", default="", help="Optional origin IATA filter")
    p.add_argument("--hours", type=float, default=48.0)
    args = p.parse_args(argv)
    sb = _svc()
    if not sb:
        print(json.dumps({"ok": False, "error": "Supabase unavailable"}, indent=2))
        return 1
    report = collect_wall_funnel(sb, origin=args.origin or None, hours=args.hours)
    print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
