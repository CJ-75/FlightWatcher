"""
Lot A — in-process community deals scheduler (no external cron required).

Enabled with DEALS_SCHEDULER_ENABLED=true. Starts on FastAPI startup.
v3.2: single-runner lock via deals_job_runs status=running.
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
KILL_SWITCH_EVERY_S = 24 * 60 * 60


def _svc():
    try:
        from supabase_deps import get_supabase_client, get_supabase_service_client

        return get_supabase_service_client() or get_supabase_client()
    except Exception:
        return None


def _safe_job(name: str, fn: Callable[[], Dict[str, Any]]) -> None:
    from deals.job_lock import release_job_lock, try_acquire_job_lock
    from deals.job_runs import record_job_run

    sb = _svc()
    started = datetime.now(timezone.utc)
    lock_id = try_acquire_job_lock(sb, name)
    if lock_id is None:
        record_job_run(
            sb,
            name,
            status="skipped",
            summary={"reason": "lock_held"},
            started_at=started,
        )
        logger.info("scheduler job skipped (lock) %s", name)
        return

    unlocked = str(lock_id).startswith(("local-", "fallback-"))
    try:
        summary = fn() or {}
        if unlocked:
            record_job_run(sb, name, status="ok", summary=summary, started_at=started)
        else:
            release_job_lock(sb, lock_id, status="ok", summary=summary)
        logger.info("scheduler job ok %s %s", name, summary)
    except Exception as e:
        if unlocked:
            record_job_run(
                sb, name, status="error", error=str(e), started_at=started
            )
        else:
            release_job_lock(sb, lock_id, status="error", error=str(e))
        logger.exception("scheduler job failed %s: %s", name, e)


def _loop() -> None:
    from deals.baselines import refresh_route_baselines
    from deals.click_checks import run_cached_kill_switch
    from deals.liteapi_config import load_deals_config
    from deals.promote import promote_deals
    from deals.revalidate_community import revalidate_deals
    from deals.seed_catalog import build_seed_catalog, seed_scan

    now0 = time.time()
    # Do NOT fire heavy provider jobs immediately on boot (was causing request storms).
    last: Dict[str, float] = {
        "promote-deals": now0 - PROMOTE_EVERY_S + 90,  # ~1.5 min
        "revalidate-deals": now0,  # wait full REVALIDATE_EVERY_S
        "refresh-baselines": now0 - BASELINES_EVERY_S + 10 * 60,
        "seed-scan": now0,  # wait full SEED_SCAN_EVERY_S
        "build-seed-catalog": now0,
        "cached-kill-switch": now0 - KILL_SWITCH_EVERY_S + 20 * 60,
    }

    logger.info(
        "deals scheduler loop started (seed/revalidate deferred; promote in ~90s)"
    )
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

            if now - last["cached-kill-switch"] >= KILL_SWITCH_EVERY_S:
                last["cached-kill-switch"] = now
                _safe_job(
                    "cached-kill-switch",
                    lambda: run_cached_kill_switch(sb, cfg=cfg),
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
