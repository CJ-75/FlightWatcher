"""
Lot G — minimal launch metrics (admin).

1. Click price-rise rate by verification_level (7d / 30d) + kill-switch state
2. Mon voyage return rate after outbound click (booked ✓ / feedback / re-view <24h)
3. Active deals by origin: live/cached share + avg hours since last_verified_at
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from deals.verification import LEVEL_CACHED, LEVEL_LIVE

logger = logging.getLogger("deals.launch_metrics")

RISE_OUTCOMES = frozenset({"higher", "user_higher", "unavailable", "user_gone"})


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(raw: Any) -> Optional[datetime]:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def is_price_rise(row: Dict[str, Any]) -> bool:
    outcome = (row.get("outcome") or "").lower()
    if outcome in RISE_OUTCOMES:
        return True
    try:
        delta = row.get("delta_pct")
        if delta is not None and float(delta) > 10:
            return True
    except (TypeError, ValueError):
        pass
    return False


def rise_rate_for_level(
    rows: List[Dict[str, Any]],
    *,
    level: str,
    days: int,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Pure: n_clicks / n_rise / rate for one verification_level over N days."""
    now = now or _now()
    since = now - timedelta(days=days)
    filtered = []
    for r in rows:
        if (r.get("verification_level") or LEVEL_LIVE) != level:
            continue
        clicked = _parse_dt(r.get("clicked_at"))
        if clicked is None or clicked < since:
            continue
        filtered.append(r)
    n = len(filtered)
    n_rise = sum(1 for r in filtered if is_price_rise(r))
    # Only count clicks with a decisive signal for rate denominator optional —
    # Lot G: rate over all clicks in window (unknown counts as non-rise).
    rate = round(n_rise / n, 4) if n else None
    return {
        "verification_level": level,
        "days": days,
        "n_clicks": n,
        "n_rise": n_rise,
        "rise_rate": rate,
        "rise_pct": round(100.0 * rate, 1) if rate is not None else None,
    }


def _within_window(start: datetime, event: Optional[datetime], window_h: float) -> bool:
    if event is None:
        return False
    if event < start:
        return False
    return (event - start).total_seconds() <= window_h * 3600


def mon_voyage_return_rate(
    clicks: List[Dict[str, Any]],
    drafts_by_token: Dict[str, Dict[str, Any]],
    *,
    days: int = 7,
    window_h: float = 24.0,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Among outbound clicks that carry a draft_token, share that show a return
    within window_h: flight_booked_at, user_feedback_at, or draft last_viewed_at.
    """
    now = now or _now()
    since = now - timedelta(days=days)
    eligible = 0
    returned = 0
    for c in clicks:
        token = (c.get("draft_token") or "").strip()
        if not token:
            continue
        clicked = _parse_dt(c.get("clicked_at"))
        if clicked is None or clicked < since:
            continue
        eligible += 1
        draft = drafts_by_token.get(token) or {}
        payload = draft.get("payload") or {}
        events = [
            _parse_dt(c.get("user_feedback_at")),
            _parse_dt(draft.get("flight_booked_at")),
            _parse_dt(payload.get("flight_booked_at")),
            _parse_dt(payload.get("last_viewed_at")),
        ]
        if any(_within_window(clicked, ev, window_h) for ev in events):
            returned += 1
            continue
        # booked flag without timestamp: accept if updated after click within window
        if payload.get("flight_booked"):
            upd = _parse_dt(draft.get("updated_at"))
            if _within_window(clicked, upd, window_h):
                returned += 1
    rate = round(returned / eligible, 4) if eligible else None
    return {
        "days": days,
        "window_h": window_h,
        "n_clicks_with_draft": eligible,
        "n_returned": returned,
        "return_rate": rate,
        "return_pct": round(100.0 * rate, 1) if rate is not None else None,
    }


def active_deals_by_origin(
    rows: List[Dict[str, Any]],
    *,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Per origin: active count, live/cached share, avg hours since last_verified_at."""
    now = now or _now()
    by: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        if (r.get("status") or "active") != "active":
            continue
        origin = (r.get("origin_iata") or "?").upper()
        bucket = by.setdefault(
            origin,
            {
                "origin_iata": origin,
                "active": 0,
                "live": 0,
                "cached": 0,
                "ages_h": [],
            },
        )
        bucket["active"] += 1
        level = r.get("verification_level") or LEVEL_LIVE
        if level == LEVEL_CACHED:
            bucket["cached"] += 1
        else:
            bucket["live"] += 1
        verified = _parse_dt(r.get("last_verified_at"))
        if verified:
            bucket["ages_h"].append((now - verified).total_seconds() / 3600.0)

    origins = []
    for origin, b in sorted(by.items(), key=lambda x: -x[1]["active"]):
        ages = b.pop("ages_h")
        n = b["active"]
        origins.append(
            {
                **b,
                "live_share": round(b["live"] / n, 3) if n else None,
                "cached_share": round(b["cached"] / n, 3) if n else None,
                "avg_hours_since_verified": round(sum(ages) / len(ages), 1)
                if ages
                else None,
            }
        )
    return {
        "origins": origins,
        "total_active": sum(o["active"] for o in origins),
    }


def collect_launch_metrics(supabase, *, cfg=None) -> Dict[str, Any]:
    from deals.click_checks import FLAG_CACHED, get_runtime_flag, is_cached_deals_enabled
    from deals.liteapi_config import load_deals_config

    cfg = cfg or load_deals_config()
    out: Dict[str, Any] = {
        "generated_at": _now().isoformat(),
        "kill_switch": {},
        "price_rise": {},
        "mon_voyage_return": {},
        "deals_by_origin": {},
    }

    # Kill switch state (C4)
    try:
        enabled = is_cached_deals_enabled(
            supabase, env_default=getattr(cfg, "cached_enabled", True)
        )
        flag = get_runtime_flag(supabase, FLAG_CACHED)
        out["kill_switch"] = {
            "cached_enabled_effective": enabled,
            "runtime_flag": flag,
            "env_default": getattr(cfg, "cached_enabled", True),
            "kill_min_clicks": getattr(cfg, "kill_min_clicks", 30),
            "kill_threshold": getattr(cfg, "kill_threshold", 0.25),
        }
    except Exception as e:
        out["kill_switch"] = {"error": str(e)}

    # Clicks 30d
    clicks: List[Dict[str, Any]] = []
    try:
        since30 = (_now() - timedelta(days=30)).isoformat()
        res = (
            supabase.table("click_price_checks")
            .select(
                "deal_key, verification_level, outcome, delta_pct, "
                "clicked_at, user_feedback_at, draft_token, partner, source"
            )
            .gte("clicked_at", since30)
            .limit(5000)
            .execute()
        )
        clicks = res.data or []
    except Exception as e:
        out["price_rise"] = {"error": str(e)}
        clicks = []

    if clicks is not None and "error" not in out.get("price_rise", {}):
        out["price_rise"] = {
            "live_7d": rise_rate_for_level(clicks, level=LEVEL_LIVE, days=7),
            "live_30d": rise_rate_for_level(clicks, level=LEVEL_LIVE, days=30),
            "cached_7d": rise_rate_for_level(clicks, level=LEVEL_CACHED, days=7),
            "cached_30d": rise_rate_for_level(clicks, level=LEVEL_CACHED, days=30),
        }

    # Drafts for return rate
    tokens = sorted(
        {
            str(c.get("draft_token")).strip()
            for c in clicks
            if c.get("draft_token")
        }
    )
    drafts_by_token: Dict[str, Dict[str, Any]] = {}
    if tokens:
        try:
            # batch in chunks of 50
            for i in range(0, len(tokens), 50):
                chunk = tokens[i : i + 50]
                res = (
                    supabase.table("my_trip_drafts")
                    .select(
                        "draft_token, flight_booked_at, updated_at, payload, status"
                    )
                    .in_("draft_token", chunk)
                    .limit(50)
                    .execute()
                )
                for row in res.data or []:
                    drafts_by_token[str(row.get("draft_token"))] = row
        except Exception as e:
            logger.debug("drafts for return rate: %s", e)

    out["mon_voyage_return"] = mon_voyage_return_rate(
        clicks, drafts_by_token, days=7, window_h=24.0
    )

    # Lot E — Mon voyage conversion funnel (7d)
    out["my_trip_funnel"] = collect_my_trip_funnel(supabase, days=7)

    # Active deals by origin
    try:
        res = (
            supabase.table("deals_active")
            .select(
                "origin_iata, verification_level, status, last_verified_at"
            )
            .eq("status", "active")
            .limit(5000)
            .execute()
        )
        out["deals_by_origin"] = active_deals_by_origin(res.data or [])
    except Exception as e:
        out["deals_by_origin"] = {"error": str(e), "origins": [], "total_active": 0}

    return out


FUNNEL_STEPS = (
    "view",
    "company_click",
    "flight_booked_yes",
    "flight_booked_no",
    "hotel_checkout_open",
    "hotel_paid",
    "account_cta",
)


def collect_my_trip_funnel(supabase, *, days: int = 7) -> Dict[str, Any]:
    """Count my_trip_events by type over N days."""
    since = (_now() - timedelta(days=days)).isoformat()
    counts = {k: 0 for k in FUNNEL_STEPS}
    try:
        res = (
            supabase.table("my_trip_events")
            .select("event, draft_token, created_at")
            .gte("created_at", since)
            .limit(5000)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        return {"days": days, "error": str(e), "counts": counts, "unique_drafts": 0}

    drafts = set()
    for r in rows:
        ev = (r.get("event") or "").strip().lower()
        if ev in counts:
            counts[ev] += 1
        tok = (r.get("draft_token") or "").strip()
        if tok:
            drafts.add(tok)

    views = counts.get("view") or 0
    paid = counts.get("hotel_paid") or 0
    return {
        "days": days,
        "counts": counts,
        "unique_drafts": len(drafts),
        "view_to_paid_pct": round(100.0 * paid / views, 1) if views else None,
    }
