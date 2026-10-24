"""
Lot A — in-process community deals scheduler (no external cron required).

Enabled with DEALS_SCHEDULER_ENABLED=true. Starts on FastAPI startup.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger("deals.scheduler")

_stop = threading.Event()
_thread: Optional[threading.Thread] = None
_started = False

# Interval seconds
PROMOTE_EVERY_S = 30 * 60
REVALIDATE_EVERY_S = 90 * 60  # ~1h30 mid; v3 also has 3h — use 90m average
BASELINES_EVERY_S = 24 * 60 * 60
SEED_SCAN_EVERY_S = 6 * 60 * 60  # several times/day within daily budget
SEED_CATALOG_EVERY_S = 7 * 24 * 60 * 60


def _svc():
    try:
        from supabase_deps import get_supabase_client, get_supabase_service_client

        return get_supabase_service_client() or get_supabase_client()
    except Exception:
        return None


def _safe_job(name: str, fn: Callable[[], Dict[str, Any]]) -> None:
    from deals.job_runs import record_job_run

    sb = _svc()
    started = datetime.now(timezone.utc)
    try:
        summary = fn() or {}
        record_job_run(sb, name, status="ok", summary=summary, started_at=started)
        logger.info("scheduler job ok %s %s", name, summary)
    except Exception as e:
        record_job_run(sb, name, status="error", error=str(e), started_at=started)
        logger.exception("scheduler job failed %s: %s", name, e)


def _loop() -> None:
    from deals.baselines import refresh_route_baselines
    from deals.liteapi_config import load_deals_config
    from deals.promote import promote_deals
    from deals.revalidate_community import revalidate_deals
    from deals.seed_catalog import build_seed_catalog, seed_scan

    last: Dict[str, float] = {
        "promote-deals": 0.0,
        "revalidate-deals": 0.0,
        "refresh-baselines": 0.0,
        "seed-scan": 0.0,
        "build-seed-catalog": 0.0,
    }
    # Stagger: run promote soon after start
    last["promote-deals"] = time.time() - PROMOTE_EVERY_S + 60

    logger.info("deals scheduler loop started")
    while not _stop.is_set():
        now = time.time()
        try:
            cfg = load_deals_config()
            sb = _svc()
            if not sb or not cfg.is_community:
                _stop.wait(30)
                continue

            if now - last["promote-deals"] >= PROMOTE_EVERY_S:
                last["promote-deals"] = now
                _safe_job("promote-deals", lambda: promote_deals(sb, cfg=cfg))

            if now - last["revalidate-deals"] >= REVALIDATE_EVERY_S:
                last["revalidate-deals"] = now
                _safe_job("revalidate-deals", lambda: revalidate_deals(sb, cfg=cfg))

            if now - last["refresh-baselines"] >= BASELINES_EVERY_S:
                last["refresh-baselines"] = now
                _safe_job(
                    "refresh-baselines",
                    lambda: refresh_route_baselines(sb, cfg=cfg),
                )

            if now - last["seed-scan"] >= SEED_SCAN_EVERY_S:
                last["seed-scan"] = now
                _safe_job("seed-scan", lambda: seed_scan(sb, cfg=cfg))

            if now - last["build-seed-catalog"] >= SEED_CATALOG_EVERY_S:
                last["build-seed-catalog"] = now
                _safe_job(
                    "build-seed-catalog",
                    lambda: build_seed_catalog(sb, cfg=cfg),
                )
        except Exception as e:
            logger.exception("scheduler tick error: %s", e)

        _stop.wait(30)

    logger.info("deals scheduler loop stopped")


def start_deals_scheduler() -> bool:
    """Start background thread if enabled. Idempotent."""
    global _thread, _started
    if _started:
        return True
    from deals.liteapi_config import load_deals_config

    cfg = load_deals_config()
    if not cfg.scheduler_enabled:
        logger.info("DEALS_SCHEDULER_ENABLED=false — scheduler not started")
        return False
    if not cfg.is_community:
        logger.info("DEALS_SOURCE!=community — scheduler not started")
        return False

    _stop.clear()
    _thread = threading.Thread(
        target=_loop, name="deals-scheduler", daemon=True
    )
    _thread.start()
    _started = True
    logger.info("deals scheduler started (in-process)")
    return True


def stop_deals_scheduler() -> None:
    global _started
    _stop.set()
    _started = False
