"""
Lot C2–C4 — click price checks + automatic DEALS_CACHED kill switch.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from deals.verification import LEVEL_CACHED, LEVEL_LIVE

logger = logging.getLogger("deals.click_checks")

FLAG_CACHED = "DEALS_CACHED_ENABLED"
BAD_OUTCOMES = frozenset(
    {"higher", "unavailable", "user_higher", "user_gone"}
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_runtime_flag(supabase, key: str) -> Optional[str]:
    try:
        res = (
            supabase.table("deals_runtime_flags")
            .select("flag_value")
            .eq("flag_key", key)
            .limit(1)
            .execute()
        )
        if res.data:
            return str(res.data[0].get("flag_value") or "")
    except Exception as e:
        logger.debug("get_runtime_flag %s: %s", key, e)
    return None


def set_runtime_flag(
    supabase,
    key: str,
    value: str,
    *,
    reason: str = "",
) -> None:
    row = {
        "flag_key": key,
        "flag_value": value,
        "updated_at": _now().isoformat(),
        "reason": reason or None,
    }
    try:
        existing = (
            supabase.table("deals_runtime_flags")
            .select("flag_key")
            .eq("flag_key", key)
            .limit(1)
            .execute()
        )
        if existing.data:
            supabase.table("deals_runtime_flags").update(row).eq(
                "flag_key", key
            ).execute()
        else:
            supabase.table("deals_runtime_flags").insert(row).execute()
    except Exception as e:
        logger.error("set_runtime_flag %s: %s", key, e)


def is_cached_deals_enabled(supabase, *, env_default: bool = True) -> bool:
    """Runtime kill switch overrides env when set to false."""
    raw = get_runtime_flag(supabase, FLAG_CACHED)
    if raw is None or raw == "":
        return env_default
    return raw.lower() in ("1", "true", "yes", "on")


def record_flight_click(
    supabase,
    *,
    deal_key: str,
    verification_level: str,
    displayed_pp: Optional[float],
    checked_pp: Optional[float] = None,
    outcome: str = "unknown",
    source: str = "deals",
    draft_token: Optional[str] = None,
    partner: Optional[str] = None,
) -> Dict[str, Any]:
    delta = None
    if displayed_pp is not None and checked_pp is not None and float(displayed_pp) > 0:
        delta = round(
            (float(checked_pp) - float(displayed_pp)) / float(displayed_pp) * 100.0,
            2,
        )
        if outcome == "unknown":
            if checked_pp is None:
                outcome = "unavailable"
            elif delta > 10:
                outcome = "higher"
            else:
                outcome = "ok"

    row = {
        "deal_key": deal_key,
        "verification_level": verification_level or LEVEL_LIVE,
        "displayed_pp": displayed_pp,
        "checked_pp": checked_pp,
        "delta_pct": delta,
        "outcome": outcome,
        "source": source,
        "draft_token": draft_token,
        "partner": partner,
        "clicked_at": _now().isoformat(),
    }
    try:
        res = supabase.table("click_price_checks").insert(row).execute()
        data = (res.data or [row])[0]
        return {"ok": True, "check": data}
    except Exception as e:
        logger.error("record_flight_click: %s", e)
        return {"ok": False, "error": str(e)}


def record_user_feedback(
    supabase,
    *,
    check_id: Optional[str] = None,
    draft_token: Optional[str] = None,
    deal_key: Optional[str] = None,
    feedback: str,
) -> Dict[str, Any]:
    """
    feedback: same | higher | gone  → user_same | user_higher | user_gone
    """
    mapping = {
        "same": "user_same",
        "oui": "user_same",
        "higher": "user_higher",
        "plus_cher": "user_higher",
        "gone": "user_gone",
        "plus_dispo": "user_gone",
        "unavailable": "user_gone",
    }
    outcome = mapping.get((feedback or "").strip().lower())
    if not outcome:
        return {"ok": False, "error": "invalid_feedback"}

    patch = {
        "outcome": outcome,
        "user_feedback_at": _now().isoformat(),
    }
    try:
        q = supabase.table("click_price_checks").update(patch)
        if check_id:
            q = q.eq("id", check_id)
        elif draft_token:
            q = (
                q.eq("draft_token", draft_token)
                .order("clicked_at", desc=True)
                .limit(1)
            )
        elif deal_key:
            q = q.eq("deal_key", deal_key).order("clicked_at", desc=True).limit(1)
        else:
            return {"ok": False, "error": "missing_id"}
        res = q.execute()
        return {"ok": True, "updated": len(res.data or [])}
    except Exception as e:
        # PostgREST may not support order on update — fallback select then update
        logger.warning("record_user_feedback update path: %s", e)
        try:
            sel = supabase.table("click_price_checks").select("id")
            if check_id:
                sel = sel.eq("id", check_id)
            elif draft_token:
                sel = sel.eq("draft_token", draft_token)
            elif deal_key:
                sel = sel.eq("deal_key", deal_key)
            else:
                return {"ok": False, "error": "missing_id"}
            found = sel.order("clicked_at", desc=True).limit(1).execute()
            if not found.data:
                return {"ok": False, "error": "not_found"}
            cid = found.data[0]["id"]
            supabase.table("click_price_checks").update(patch).eq("id", cid).execute()
            return {"ok": True, "updated": 1, "id": cid}
        except Exception as e2:
            return {"ok": False, "error": str(e2)}


def evaluate_cached_kill_switch(
    rows: List[Dict[str, Any]],
    *,
    min_clicks: int = 30,
    threshold: float = 0.25,
) -> Dict[str, Any]:
    """
    Pure function for tests: given click rows (cached), decide kill.
    Bad = higher / unavailable / user_higher / user_gone OR delta_pct > 10.
    """
    cached = [
        r
        for r in rows
        if (r.get("verification_level") or "") == LEVEL_CACHED
    ]
    n = len(cached)
    if n < min_clicks:
        return {
            "should_kill": False,
            "n_clicks": n,
            "n_bad": 0,
            "bad_rate": None,
            "reason": "insufficient_clicks",
        }
    n_bad = 0
    for r in cached:
        outcome = (r.get("outcome") or "").lower()
        delta = r.get("delta_pct")
        bad = outcome in BAD_OUTCOMES
        try:
            if delta is not None and float(delta) > 10:
                bad = True
        except (TypeError, ValueError):
            pass
        if bad:
            n_bad += 1
    rate = n_bad / n
    return {
        "should_kill": rate > threshold,
        "n_clicks": n,
        "n_bad": n_bad,
        "bad_rate": round(rate, 4),
        "reason": "threshold_exceeded" if rate > threshold else "ok",
    }


def run_cached_kill_switch(supabase, *, cfg=None) -> Dict[str, Any]:
    from deals.liteapi_config import load_deals_config

    cfg = cfg or load_deals_config()
    since = (_now() - timedelta(days=7)).isoformat()
    try:
        res = (
            supabase.table("click_price_checks")
            .select(
                "verification_level, outcome, delta_pct, clicked_at"
            )
            .eq("verification_level", LEVEL_CACHED)
            .gte("clicked_at", since)
            .limit(5000)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        return {"ok": False, "error": str(e)}

    verdict = evaluate_cached_kill_switch(
        rows,
        min_clicks=cfg.kill_min_clicks,
        threshold=cfg.kill_threshold,
    )
    if verdict["should_kill"]:
        set_runtime_flag(
            supabase,
            FLAG_CACHED,
            "false",
            reason=(
                f"auto: bad_rate={verdict['bad_rate']} "
                f"n={verdict['n_clicks']} over 7d"
            ),
        )
        logger.warning(
            "DEALS_CACHED kill switch ON: %s — réactivation manuelle requise "
            "(deals_runtime_flags ou admin)",
            verdict,
        )
    return {"ok": True, **verdict, "killed": verdict["should_kill"]}
