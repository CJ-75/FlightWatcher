"""Admin ops whitelist — run deal jobs under require_admin (no CRON_SECRET)."""
from __future__ import annotations

import time
from typing import Any, Callable, Dict, Optional

OPS_JOBS: Dict[str, Dict[str, Any]] = {
    "promote-deals": {
        "label": "Promote deals",
        "risk": "high",
        "step_up": True,
        "description": "Promote → refresh rates → materialize wall",
    },
    "refresh-deal-rates": {
        "label": "Refresh deal rates",
        "risk": "medium",
        "step_up": True,
        "description": "Refresh FREE windows rates + materialize",
    },
    "materialize-wall": {
        "label": "Materialize wall",
        "risk": "medium",
        "step_up": False,
        "description": "Write hotel_top3 onto deals_active",
    },
    "backfill-pool-photos": {
        "label": "Backfill pool photos",
        "risk": "low",
        "step_up": False,
        "description": "Fill hotel_pool.main_photo from raw",
    },
    "seed-scan": {
        "label": "Seed scan",
        "risk": "high",
        "step_up": True,
        "description": "Run seed scan pipeline",
    },
    "revalidate-deals": {
        "label": "Revalidate deals",
        "risk": "medium",
        "step_up": True,
        "description": "Revalidate active deals freshness",
    },
    "warm-wall-cache": {
        "label": "Warm wall cache",
        "risk": "low",
        "step_up": False,
        "description": "Warm / invalidate community wall cache",
    },
    "wall-health": {
        "label": "Wall health",
        "risk": "low",
        "step_up": False,
        "description": "Snapshot wall health metrics",
        "method": "get",
    },
    "wall-funnel-diag": {
        "label": "Wall funnel diag",
        "risk": "low",
        "step_up": False,
        "description": "Funnel obs → promote → active → wall",
        "method": "get",
    },
    "deals-metrics": {
        "label": "Deals metrics",
        "risk": "low",
        "step_up": False,
        "description": "Collect deals metrics snapshot",
        "method": "get",
    },
}


def list_ops_jobs() -> Dict[str, Any]:
    return {
        "ok": True,
        "jobs": [
            {"id": k, **{kk: vv for kk, vv in v.items() if kk != "runner"}}
            for k, v in OPS_JOBS.items()
        ],
    }


def _svc():
    from supabase_client import get_supabase_service_client

    return get_supabase_service_client()


def _run_promote() -> Dict[str, Any]:
    from deals.community_list import invalidate_list_cache
    from deals.materialize_wall import materialize_deals_wall
    from deals.promote import promote_deals
    from deals.refresh_deal_rates import refresh_deal_rates

    sb = _svc()
    summary = promote_deals(sb) or {}
    try:
        summary["refresh_deal_rates"] = refresh_deal_rates(sb)
    except Exception as e:
        summary["refresh_deal_rates_error"] = str(e)
    try:
        summary["materialize_wall"] = materialize_deals_wall(sb)
    except Exception as e:
        summary["materialize_wall_error"] = str(e)
    invalidate_list_cache()
    return summary


def _run_refresh_rates(force: bool = False) -> Dict[str, Any]:
    from deals.community_list import invalidate_list_cache
    from deals.materialize_wall import materialize_deals_wall
    from deals.refresh_deal_rates import refresh_deal_rates

    sb = _svc()
    summary = refresh_deal_rates(sb, force=force) or {}
    try:
        summary["materialize_wall"] = materialize_deals_wall(sb, force=force)
    except Exception as e:
        summary["materialize_wall_error"] = str(e)
    invalidate_list_cache()
    return summary


def _run_materialize(force: bool = False) -> Dict[str, Any]:
    from deals.materialize_wall import materialize_deals_wall

    return materialize_deals_wall(_svc(), force=force)


def _run_backfill_photos(dry_run: bool = False, limit: int = 500) -> Dict[str, Any]:
    from deals.pool_photos import backfill_pool_photos

    return backfill_pool_photos(_svc(), limit=limit, dry_run=dry_run)


def _run_seed_scan() -> Dict[str, Any]:
    try:
        from deals.seed_scan import run_seed_scan

        return run_seed_scan(_svc())
    except Exception:
        try:
            from deals.seed_catalog import build_seed_catalog

            return build_seed_catalog(_svc())
        except Exception as e:
            return {"ok": False, "error": str(e)}


def _run_revalidate() -> Dict[str, Any]:
    try:
        from deals.revalidate import revalidate_deals

        return revalidate_deals(_svc())
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _run_warm_cache() -> Dict[str, Any]:
    try:
        from deals.community_list import warm_list_cache

        return warm_list_cache()
    except Exception:
        try:
            from deals.community_list import invalidate_list_cache

            invalidate_list_cache()
            return {"ok": True, "warmed": False, "invalidated": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}


def _run_wall_health() -> Dict[str, Any]:
    from deals.health import collect_wall_health

    return collect_wall_health(_svc())


def _run_wall_funnel() -> Dict[str, Any]:
    from deals.wall_funnel_diag import collect_wall_funnel

    return collect_wall_funnel(_svc())


def _run_deals_metrics() -> Dict[str, Any]:
    from deals.metrics import collect_deals_metrics

    return collect_deals_metrics(_svc())


_RUNNERS: Dict[str, Callable[..., Dict[str, Any]]] = {
    "promote-deals": lambda **kw: _run_promote(),
    "refresh-deal-rates": lambda **kw: _run_refresh_rates(force=bool(kw.get("force"))),
    "materialize-wall": lambda **kw: _run_materialize(force=bool(kw.get("force"))),
    "backfill-pool-photos": lambda **kw: _run_backfill_photos(
        dry_run=bool(kw.get("dry_run")), limit=int(kw.get("limit") or 500)
    ),
    "seed-scan": lambda **kw: _run_seed_scan(),
    "revalidate-deals": lambda **kw: _run_revalidate(),
    "warm-wall-cache": lambda **kw: _run_warm_cache(),
    "wall-health": lambda **kw: _run_wall_health(),
    "wall-funnel-diag": lambda **kw: _run_wall_funnel(),
    "deals-metrics": lambda **kw: _run_deals_metrics(),
}


def run_ops_job(job_id: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if job_id not in OPS_JOBS:
        raise KeyError(job_id)
    runner = _RUNNERS.get(job_id)
    if runner is None:
        raise KeyError(job_id)
    params = params or {}
    t0 = time.perf_counter()
    try:
        result = runner(**params)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": True,
            "job": job_id,
            "elapsed_ms": elapsed_ms,
            "result": result if isinstance(result, dict) else {"value": result},
        }
    except Exception as e:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": False,
            "job": job_id,
            "elapsed_ms": elapsed_ms,
            "error": str(e),
        }
