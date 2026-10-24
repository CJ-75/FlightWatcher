"""
v3.2 — single-runner lock for scheduler jobs via deals_job_runs status=running.
"""
from __future__ import annotations

import logging
import os
import socket
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("deals.job_lock")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ttl_min() -> int:
    try:
        return max(5, int(os.getenv("DEALS_JOB_LOCK_TTL_MIN", "45")))
    except (TypeError, ValueError):
        return 45


def try_acquire_job_lock(supabase, job_name: str) -> Optional[str]:
    """
    Insert a running row if no fresh running lock exists.
    Returns lock row id, or None if skipped (another worker holds the lock).
    """
    if not supabase:
        return f"local-{job_name}"
    ttl = _ttl_min()
    cutoff = (_now() - timedelta(minutes=ttl)).isoformat()
    try:
        existing = (
            supabase.table("deals_job_runs")
            .select("id, started_at")
            .eq("job_name", job_name)
            .eq("status", "running")
            .gte("started_at", cutoff)
            .limit(1)
            .execute()
        )
        if existing.data:
            logger.info("job lock held %s — skip", job_name)
            return None
        # Expire stale running rows
        supabase.table("deals_job_runs").update(
            {
                "status": "error",
                "finished_at": _now().isoformat(),
                "error": "stale_lock_expired",
            }
        ).eq("job_name", job_name).eq("status", "running").lt(
            "started_at", cutoff
        ).execute()

        host = socket.gethostname()[:80]
        res = (
            supabase.table("deals_job_runs")
            .insert(
                {
                    "job_name": job_name,
                    "status": "running",
                    "started_at": _now().isoformat(),
                    "summary": {"host": host, "lock": True},
                }
            )
            .execute()
        )
        if not res.data:
            return None
        return str(res.data[0]["id"])
    except Exception as e:
        logger.warning("try_acquire_job_lock %s: %s — run unlocked", job_name, e)
        return f"fallback-{job_name}"


def release_job_lock(
    supabase,
    lock_id: Optional[str],
    *,
    status: str = "ok",
    summary: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
) -> None:
    if not supabase or not lock_id or str(lock_id).startswith(("local-", "fallback-")):
        return
    try:
        supabase.table("deals_job_runs").update(
            {
                "status": status,
                "finished_at": _now().isoformat(),
                "summary": summary or {},
                "error": error,
            }
        ).eq("id", lock_id).execute()
    except Exception as e:
        logger.warning("release_job_lock %s: %s", lock_id, e)
