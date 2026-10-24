"""
Lot A — if baselines older than DEALS_BASELINE_MAX_AGE_H, strip % badges.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from deals.job_runs import last_successful_run_at, latest_baseline_computed_at

logger = logging.getLogger("deals.baseline_guard")

JOB_REFRESH_BASELINES = "refresh-baselines"


def baselines_freshness(
    supabase,
    *,
    max_age_h: float = 36.0,
    now: Optional[datetime] = None,
) -> Tuple[bool, Optional[datetime], str]:
    """
    Returns (fresh, last_ok_at, reason).
    fresh=False → UI must show « Très bon prix » instead of %.
    """
    now = now or datetime.now(timezone.utc)
    last = last_successful_run_at(supabase, JOB_REFRESH_BASELINES)
    source = "job_runs"
    if last is None:
        last = latest_baseline_computed_at(supabase)
        source = "baselines.computed_at"
    if last is None:
        return False, None, "no_baselines_yet"
    age_h = (now - last).total_seconds() / 3600.0
    if age_h > max_age_h:
        return False, last, f"stale_{source}_{age_h:.1f}h"
    return True, last, f"ok_{source}"


def soften_badge_if_stale(
    badge: Dict[str, Any],
    *,
    baselines_fresh: bool,
) -> Dict[str, Any]:
    """Replace percentage badges when baselines are stale."""
    if baselines_fresh:
        return badge
    if badge.get("discount_pct") is None and "Très bon prix" in str(badge.get("label") or ""):
        return badge
    return {
        "label": "Très bon prix",
        "discount_pct": None,
        "scope": "flight",
        "tooltip": (
            "Les prix de référence FlightWatcher n'ont pas été recalculés récemment. "
            "Le pourcentage est masqué par précaution."
        ),
        "baselines_stale": True,
    }


def log_stale_alert(last_ok: Optional[datetime], reason: str) -> None:
    logger.warning(
        "BASELINE_GUARD stale: reason=%s last_ok=%s — percentage badges softened. "
        "Run: python -m deals.bootstrap_community --only refresh-baselines",
        reason,
        last_ok.isoformat() if last_ok else None,
    )
