"""
Ops helpers for thickening / redistributing the Séjours wall (BVA+ORY+CDG).

  cd backend
  python -m deals.thicken_wall_ops measure
  python -m deals.thicken_wall_ops backfill-photos
  python -m deals.thicken_wall_ops promote
  python -m deals.thicken_wall_ops apply-seed
  python -m deals.thicken_wall_ops bootstrap-eu-gap2
  python -m deals.thicken_wall_ops all
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Tuple

from dotenv import load_dotenv

_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env, override=True)

PARIS_ORIGINS = ("BVA", "ORY", "CDG")


def _sb():
    from supabase_deps import get_supabase_client, get_supabase_service_client

    return get_supabase_service_client() or get_supabase_client()


def _has_photo(row: Dict[str, Any]) -> bool:
    hotels = row.get("hotel_top3") or []
    if not isinstance(hotels, list) or not hotels:
        return False
    h0 = hotels[0] if isinstance(hotels[0], dict) else {}
    return bool(h0.get("photo") or h0.get("thumbnail") or h0.get("main_photo"))


def measure(supabase) -> Dict[str, Any]:
    today = date.today().isoformat()
    res = (
        supabase.table("deals_active")
        .select("origin_iata,dest_iata,hotel_top3,out_date,status")
        .eq("status", "active")
        .gte("out_date", today)
        .limit(5000)
        .execute()
    )
    rows = res.data or []
    by: Dict[str, Dict[str, int]] = defaultdict(lambda: {"n": 0, "photo": 0})
    for r in rows:
        o = str(r.get("origin_iata") or "").upper()
        by[o]["n"] += 1
        if _has_photo(r):
            by[o]["photo"] += 1
    paris_photo = sum(by[o]["photo"] for o in PARIS_ORIGINS)
    return {
        "ok": True,
        "total_active_upcoming": len(rows),
        "by_origin": dict(sorted(by.items(), key=lambda kv: -kv[1]["n"])),
        "paris": {o: by.get(o, {"n": 0, "photo": 0}) for o in PARIS_ORIGINS},
        "paris_photo_sum": paris_photo,
        "targets": {
            "per_origin_photo_min": 12,
            "paris_grouped_min": 36,
        },
        "paris_ok": all(by.get(o, {}).get("photo", 0) >= 12 for o in PARIS_ORIGINS),
        "paris_grouped_ok": paris_photo >= 36,
    }


def backfill_photos(supabase) -> Dict[str, Any]:
    from deals.pool_photos import backfill_pool_photos

    # Multiple passes — table can exceed one page
    total = {
        "ok": True,
        "scanned": 0,
        "missing_before": 0,
        "updated": 0,
        "still_missing": 0,
    }
    for _ in range(8):
        out = backfill_pool_photos(supabase, limit=2000, dry_run=False)
        if not out.get("ok"):
            return out
        total["scanned"] += int(out.get("scanned") or 0)
        total["missing_before"] += int(out.get("missing_before") or 0)
        total["updated"] += int(out.get("updated") or 0)
        total["still_missing"] += int(out.get("still_missing") or 0)
        if int(out.get("updated") or 0) == 0:
            break
    if total["scanned"]:
        total["share_with_photo"] = round(
            1.0 - (total["still_missing"] / max(1, total["scanned"])), 3
        )
    return total


def promote(supabase) -> Dict[str, Any]:
    from deals.promote import promote_deals

    return promote_deals(supabase)


def apply_seed(supabase) -> Dict[str, Any]:
    from deals.apply_trend_catalog import main as _unused  # noqa: F401
    from deals.city_mapping import link_destinations_to_served_cities, upsert_city_mapping
    from deals.hotel_pool import upsert_destinations
    from deals.seed_catalog import build_seed_catalog, pin_trend_catalog_cities

    out: Dict[str, Any] = {}
    try:
        rows = upsert_destinations(supabase)
        out["seed_destinations"] = {"ok": True, "count": len(rows or [])}
    except Exception as e:
        out["seed_destinations"] = {"ok": False, "error": str(e)}
    out["city_mapping"] = upsert_city_mapping(supabase)
    try:
        out["link_destinations"] = link_destinations_to_served_cities(supabase)
    except Exception as e:
        out["link_destinations"] = {"ok": False, "error": str(e)}
    out["pins"] = pin_trend_catalog_cities(supabase)
    out["catalog"] = build_seed_catalog(supabase)
    return out


def bootstrap_eu_gap2(supabase) -> Dict[str, Any]:
    from deals.destinations_seed import DESTINATIONS_SEED
    from deals.hotel_pool import bootstrap_hotel_pools

    slugs = [d["slug"] for d in DESTINATIONS_SEED if d.get("wave") == "eu_gap2"]
    return bootstrap_hotel_pools(supabase, slugs=slugs)


def warm_paris_soft_rates(supabase, *, limit: int = 60) -> Dict[str, Any]:
    """Fetch FREE window rates for soft-eligible ORY/CDG observation dates."""
    from datetime import date, datetime, timedelta, timezone

    from deals.baselines import horizon_bucket
    from deals.city_mapping import resolve_hotel_destination
    from deals.hotel_rates import refresh_one_combo
    from deals.liteapi_client import LiteApiClient
    from deals.liteapi_config import load_deals_config
    from deals.promote import (
        _load_baselines_map,
        _lookup_baseline,
        eligible_candidate_soft,
    )
    from deals.refresh_deal_rates import free_window
    from deals.windows import upsert_windows

    cfg = load_deals_config()
    now = datetime.now(timezone.utc)
    since = (now - timedelta(hours=72)).isoformat()
    try:
        obs = (
            supabase.table("price_observations")
            .select("*")
            .gte("observed_at", since)
            .in_("origin_iata", ["ORY", "CDG"])
            .not_.is_("served_city_id", "null")
            .limit(3000)
            .execute()
            .data
            or []
        )
    except Exception as e:
        return {"ok": False, "error": str(e)}

    baselines = _load_baselines_map(supabase)
    pairs: Dict[Tuple[str, str, str], bool] = {}
    for o in obs:
        origin = str(o.get("origin_iata") or "").upper()
        city_id = str(o.get("served_city_id") or "")
        out_d = str(o.get("out_date") or "")[:10]
        ret_d = str(o.get("ret_date") or "")[:10]
        dest = str(o.get("dest_iata") or "").upper()
        hb = horizon_bucket(out_d, now=now)
        if not hb or not city_id or not out_d or not ret_d:
            continue
        bl = _lookup_baseline(
            baselines,
            origin=origin,
            city_id=city_id,
            trip_type=str(o.get("trip_type") or "OTHER"),
            horizon=hb,
        ) or {"median": None, "baseline_kind": "missing"}
        if not eligible_candidate_soft(
            o, bl, cfg=cfg, now=now, fresh_tau_h=72
        ):
            continue
        pairs[(dest, out_d, ret_d)] = True

    client = LiteApiClient(cfg=cfg)
    ok = err = unavail = 0
    try:
        for dest, cin, cout in list(pairs.keys())[: max(1, int(limit))]:
            resolved = resolve_hotel_destination(supabase, iata=dest)
            if not resolved or not resolved.get("destination"):
                unavail += 1
                continue
            w = free_window(date.fromisoformat(cin), date.fromisoformat(cout))
            upsert_windows(supabase, [w])
            out = refresh_one_combo(
                supabase,
                client,
                dest=resolved["destination"],
                window=w,
                adults=2,
                cfg=cfg,
                force=True,
                require_flight=False,
            )
            if out.get("status") == "ok":
                ok += 1
            else:
                err += 1
    finally:
        try:
            client.close()
        except Exception:
            pass
    return {
        "ok": True,
        "pairs": len(pairs),
        "warmed_ok": ok,
        "errors": err,
        "unavailable": unavail,
    }


def rescan_and_rates(supabase, *, force_rates: bool = False) -> Dict[str, Any]:
    from deals.baselines import refresh_route_baselines
    from deals.seed_catalog import seed_scan
    from deals.refresh_deal_rates import refresh_deal_rates

    out: Dict[str, Any] = {}
    try:
        out["seed_scan"] = seed_scan(supabase)
    except Exception as e:
        out["seed_scan"] = {"ok": False, "error": str(e)}
    try:
        out["baselines"] = refresh_route_baselines(supabase)
    except Exception as e:
        out["baselines"] = {"ok": False, "error": str(e)}
    try:
        out["warm_paris_soft_rates"] = warm_paris_soft_rates(supabase)
    except Exception as e:
        out["warm_paris_soft_rates"] = {"ok": False, "error": str(e)}
    try:
        out["refresh_deal_rates"] = refresh_deal_rates(
            supabase, force=force_rates
        )
    except Exception as e:
        out["refresh_deal_rates"] = {"ok": False, "error": str(e)}
    return out


def main(argv: List[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Thicken Séjours wall ops")
    p.add_argument(
        "cmd",
        choices=[
            "measure",
            "backfill-photos",
            "promote",
            "apply-seed",
            "bootstrap-eu-gap2",
            "rescan-rates",
            "all",
        ],
    )
    args = p.parse_args(argv)
    sb = _sb()
    if not sb:
        print(json.dumps({"ok": False, "error": "Supabase unavailable"}))
        return 1

    if args.cmd == "measure":
        out = measure(sb)
    elif args.cmd == "backfill-photos":
        out = backfill_photos(sb)
    elif args.cmd == "promote":
        out = promote(sb)
    elif args.cmd == "apply-seed":
        out = apply_seed(sb)
    elif args.cmd == "bootstrap-eu-gap2":
        out = bootstrap_eu_gap2(sb)
    elif args.cmd == "rescan-rates":
        out = rescan_and_rates(sb)
    else:
        import os

        out = {
            "measure_before": measure(sb),
            "backfill_photos": backfill_photos(sb),
            "apply_seed": apply_seed(sb),
            "rescan_rates": rescan_and_rates(sb),
            "promote": promote(sb),
            "measure_after": measure(sb),
        }
        # Bootstrap is long / rate-limited — run separately unless ALL_BOOTSTRAP=1
        if os.getenv("ALL_BOOTSTRAP", "").strip() in ("1", "true", "yes"):
            out["bootstrap_eu_gap2"] = bootstrap_eu_gap2(sb)
            out["backfill_after_bootstrap"] = backfill_photos(sb)
            out["rescan_after_bootstrap"] = rescan_and_rates(sb)
            out["promote_after_bootstrap"] = promote(sb)
            out["measure_final"] = measure(sb)

    print(json.dumps(out, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
