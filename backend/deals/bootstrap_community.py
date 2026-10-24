"""
Lot A — idempotent community deals bootstrap.

  cd backend
  python -m deals.bootstrap_community
  python -m deals.bootstrap_community --skip-seed-scan
  python -m deals.bootstrap_community --only refresh-baselines

Chains: check migrations → seed-city-mapping → build-seed-catalog
         → seed-scan → refresh-baselines → promote-deals
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from dotenv import load_dotenv

_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env, override=True)

REQUIRED_TABLES = (
    "served_cities",
    "airport_city_mapping",
    "price_observations",
    "route_price_baselines",
    "deals_active",
    "seed_catalog_cities",
    "deals_job_runs",
)

MIGRATION_HINTS = (
    "apply_deals_community_migration.sql",
    "apply_deals_job_runs_migration.sql",
)


def _svc():
    from supabase_deps import SUPABASE_AVAILABLE, get_supabase_client, get_supabase_service_client

    if not SUPABASE_AVAILABLE:
        return None
    return get_supabase_service_client() or get_supabase_client()


def check_community_tables(supabase) -> Dict[str, Any]:
    missing: List[str] = []
    for table in REQUIRED_TABLES:
        try:
            supabase.table(table).select("*").limit(1).execute()
        except Exception:
            missing.append(table)
    return {
        "ok": not missing,
        "missing": missing,
        "migrations": list(MIGRATION_HINTS) if missing else [],
    }


def community_tables_empty(supabase) -> bool:
    """True if no served_cities or no deals_active rows (boot warning)."""
    try:
        cities = supabase.table("served_cities").select("id").limit(1).execute()
        if not cities.data:
            return True
    except Exception:
        return True
    return False


def _run_step(
    supabase,
    name: str,
    fn: Callable[[], Dict[str, Any]],
) -> Dict[str, Any]:
    from deals.job_runs import record_job_run

    started = datetime.now(timezone.utc)
    print(f"→ {name} …")
    try:
        summary = fn() or {}
        record_job_run(
            supabase,
            name,
            status="ok",
            summary=summary if isinstance(summary, dict) else {"result": summary},
            started_at=started,
        )
        print(f"  OK {name}: {json.dumps(summary, default=str)[:400]}")
        return {"job": name, "ok": True, "summary": summary}
    except Exception as e:
        record_job_run(
            supabase,
            name,
            status="error",
            error=str(e),
            started_at=started,
        )
        print(f"  ERROR {name}: {e}", file=sys.stderr)
        return {"job": name, "ok": False, "error": str(e)}


def run_bootstrap(
    *,
    skip_seed_scan: bool = False,
    only: Optional[str] = None,
) -> Dict[str, Any]:
    supabase = _svc()
    if not supabase:
        return {"ok": False, "error": "Supabase non configuré"}

    check = check_community_tables(supabase)
    if not check["ok"]:
        return {
            "ok": False,
            "error": "tables_missing",
            "missing": check["missing"],
            "hint": (
                "Applique dans Supabase SQL editor (manuel) : "
                + ", ".join(check["migrations"])
            ),
        }

    from deals.baselines import refresh_route_baselines
    from deals.city_mapping import upsert_city_mapping
    from deals.liteapi_config import load_deals_config
    from deals.promote import promote_deals
    from deals.seed_catalog import build_seed_catalog, seed_scan

    cfg = load_deals_config()
    steps: List[tuple[str, Callable[[], Dict[str, Any]]]] = [
        ("seed-city-mapping", lambda: upsert_city_mapping(supabase)),
        ("build-seed-catalog", lambda: build_seed_catalog(supabase, cfg=cfg)),
        ("seed-scan", lambda: seed_scan(supabase, cfg=cfg)),
        ("refresh-baselines", lambda: refresh_route_baselines(supabase, cfg=cfg)),
        ("promote-deals", lambda: promote_deals(supabase, cfg=cfg)),
    ]

    if only:
        steps = [(n, f) for n, f in steps if n == only]
        if not steps:
            return {"ok": False, "error": f"unknown step: {only}"}

    results = []
    for name, fn in steps:
        if name == "seed-scan" and skip_seed_scan:
            print(f"→ {name} skipped (--skip-seed-scan)")
            results.append({"job": name, "ok": True, "skipped": True})
            continue
        results.append(_run_step(supabase, name, fn))
        if not results[-1].get("ok"):
            return {"ok": False, "steps": results}

    # Count active deals
    active = 0
    try:
        res = (
            supabase.table("deals_active")
            .select("deal_key", count="exact")
            .eq("status", "active")
            .execute()
        )
        active = int(res.count or len(res.data or []))
    except Exception:
        pass

    return {"ok": True, "steps": results, "deals_active": active}


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Bootstrap community deals (idempotent)"
    )
    parser.add_argument(
        "--skip-seed-scan",
        action="store_true",
        help="Skip slow seed_scan (mapping+catalog+baselines+promote only)",
    )
    parser.add_argument(
        "--only",
        help="Run a single step (e.g. refresh-baselines, promote-deals)",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Only verify community tables exist",
    )
    args = parser.parse_args(argv)

    supabase = _svc()
    if not supabase:
        print("ERROR: Supabase non configuré", file=sys.stderr)
        return 1

    if args.check_only:
        check = check_community_tables(supabase)
        print(json.dumps(check, indent=2))
        return 0 if check["ok"] else 2

    out = run_bootstrap(skip_seed_scan=args.skip_seed_scan, only=args.only)
    print(json.dumps(out, indent=2, default=str))
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
