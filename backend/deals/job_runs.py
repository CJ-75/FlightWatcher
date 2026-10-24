"""Ledger for community deals jobs (bootstrap + scheduler)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("deals.job_runs")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def record_job_run(
    supabase,
    job_name: str,
    *,
    status: str = "ok",
    summary: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
    started_at: Optional[datetime] = None,
) -> None:
    if not supabase:
        return
    started = started_at or _now()
    row = {
        "job_name": job_name,
        "status": status,
        "started_at": started.isoformat(),
        "finished_at": _now().isoformat(),
        "summary": summary or {},
        "error": error,
    }
    try:
        supabase.table("deals_job_runs").insert(row).execute()
    except Exception as e:
        logger.warning("deals_job_runs insert failed (%s): %s", job_name, e)


def scans_done_today(supabase, job_name: str = "seed-scan") -> int:
    """Sum `summary.scans` for successful runs of job_name since UTC midnight."""
    if not supabase:
        return 0
    try:
        today = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        res = (
            supabase.table("deals_job_runs")
            .select("summary")
            .eq("job_name", job_name)
            .eq("status", "ok")
            .gte("finished_at", today.isoformat())
            .limit(50)
            .execute()
        )
        total = 0
        for row in res.data or []:
            summary = row.get("summary") or {}
            try:
                total += int(summary.get("scans") or 0)
            except (TypeError, ValueError):
                pass
        return total
    except Exception as e:
        logger.debug("scans_done_today: %s", e)
        return 0


def last_successful_run_at(supabase, job_name: str) -> Optional[datetime]:
    if not supabase:
        return None
    try:
        res = (
            supabase.table("deals_job_runs")
            .select("finished_at")
            .eq("job_name", job_name)
            .eq("status", "ok")
            .order("finished_at", desc=True)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        raw = res.data[0].get("finished_at")
        if not raw:
            return None
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception as e:
        logger.debug("last_successful_run_at %s: %s", job_name, e)
        return None


def latest_baseline_computed_at(supabase) -> Optional[datetime]:
    """Fallback when job ledger empty: max(route_price_baselines.computed_at)."""
    if not supabase:
        return None
    try:
        res = (
            supabase.table("route_price_baselines")
            .select("computed_at")
            .order("computed_at", desc=True)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        raw = res.data[0].get("computed_at")
        if not raw:
            return None
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None
