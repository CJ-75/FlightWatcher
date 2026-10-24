"""
Price alerts on liked deals (L10).

After cache refresh: if price_pp dropped ≥ threshold (default 8%) vs last
baseline, email the user (max 1 notification / 24 h / deal_key).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("deals.price_alerts")

DEFAULT_THRESHOLD_PCT = 8.0
COOLDOWN = timedelta(hours=24)


def threshold_pct() -> float:
    raw = (os.getenv("DEALS_PRICE_ALERT_THRESHOLD_PCT") or "").strip()
    if not raw:
        return DEFAULT_THRESHOLD_PCT
    try:
        return float(raw)
    except ValueError:
        return DEFAULT_THRESHOLD_PCT


def price_drop_pct(baseline: float, current: float) -> float:
    """Positive % = price went down. 0 if no drop or invalid baseline."""
    if baseline is None or current is None:
        return 0.0
    try:
        b = float(baseline)
        c = float(current)
    except (TypeError, ValueError):
        return 0.0
    if b <= 0:
        return 0.0
    if c >= b:
        return 0.0
    return (b - c) / b * 100.0


def cooldown_ok(last_notified_at: Any, *, now: Optional[datetime] = None) -> bool:
    now = now or datetime.now(timezone.utc)
    if not last_notified_at:
        return True
    try:
        dt = datetime.fromisoformat(str(last_notified_at).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return True
    return now - dt >= COOLDOWN


def should_notify(
    *,
    baseline_pp: float,
    current_pp: float,
    threshold: float = DEFAULT_THRESHOLD_PCT,
    last_notified_at: Any = None,
    now: Optional[datetime] = None,
) -> Tuple[bool, float]:
    drop = price_drop_pct(baseline_pp, current_pp)
    if drop < float(threshold):
        return False, drop
    if not cooldown_ok(last_notified_at, now=now):
        return False, drop
    return True, drop


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def upsert_alert_for_like(
    supabase: Any,
    *,
    user_id: str,
    deal_key: str,
    price_pp: float,
    threshold: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """Create / refresh alert baseline when user likes a deal."""
    deal_key = (deal_key or "").strip()
    if not deal_key or not user_id:
        return None
    thr = float(threshold if threshold is not None else threshold_pct())
    row = {
        "user_id": user_id,
        "deal_key": deal_key,
        "last_price_pp": float(price_pp),
        "threshold_pct": thr,
    }
    try:
        result = (
            supabase.table("deal_price_alerts")
            .upsert(row, on_conflict="user_id,deal_key")
            .execute()
        )
        return (result.data or [row])[0]
    except Exception as e:
        logger.warning("upsert_alert_fail deal=%s: %s", deal_key, e)
        return None


def delete_alert_for_unlike(
    supabase: Any,
    *,
    user_id: str,
    deal_key: Optional[str] = None,
    deal_id: Optional[str] = None,
) -> None:
    try:
        if deal_key:
            (
                supabase.table("deal_price_alerts")
                .delete()
                .eq("user_id", user_id)
                .eq("deal_key", deal_key)
                .execute()
            )
            return
        # Fallback: resolve deal_key from liked row
        if deal_id:
            liked = (
                supabase.table("liked_deals")
                .select("deal_key,deal_data")
                .eq("user_id", user_id)
                .eq("deal_id", deal_id)
                .limit(1)
                .execute()
            )
            if liked.data:
                key = liked.data[0].get("deal_key") or (
                    (liked.data[0].get("deal_data") or {}).get("deal_key")
                )
                if key:
                    (
                        supabase.table("deal_price_alerts")
                        .delete()
                        .eq("user_id", user_id)
                        .eq("deal_key", key)
                        .execute()
                    )
    except Exception as e:
        logger.warning("delete_alert_fail: %s", e)


def _user_email(supabase: Any, user_id: str) -> Optional[str]:
    try:
        res = supabase.auth.admin.get_user_by_id(user_id)
        user = getattr(res, "user", None) or (
            res.get("user") if isinstance(res, dict) else None
        )
        email = None
        if user is not None:
            email = getattr(user, "email", None) or (
                user.get("email") if isinstance(user, dict) else None
            )
        if not email:
            prof = (
                supabase.table("user_profiles")
                .select("email")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )
            if prof.data:
                email = prof.data[0].get("email")
        if email and "@" in str(email):
            return str(email).strip().lower()
    except Exception as e:
        logger.warning("alert_email_lookup_fail user=%s: %s", user_id, e)
    return None


def _current_price_pp(supabase: Any, deal_key: str) -> Optional[Dict[str, Any]]:
    from deals.deal_assemble import get_deal_from_caches

    deal = get_deal_from_caches(supabase, deal_key)
    if not deal:
        return None
    try:
        pp = float(deal.get("price_per_person"))
    except (TypeError, ValueError):
        return None
    return {"price_pp": pp, "deal": deal}


def run_price_alerts(
    supabase: Any,
    *,
    dry_run: bool = False,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Scan deal_price_alerts, compare to cache, notify on qualifying drops.
    """
    summary = {
        "alerts": 0,
        "checked": 0,
        "notified": 0,
        "skipped_cooldown": 0,
        "skipped_threshold": 0,
        "missing_deal": 0,
        "no_email": 0,
        "errors": 0,
        "details": [],
    }

    q = supabase.table("deal_price_alerts").select("*")
    result = q.execute()
    rows = list(result.data or [])
    if limit is not None:
        rows = rows[: int(limit)]
    summary["alerts"] = len(rows)

    # Cache current prices per deal_key
    price_cache: Dict[str, Optional[Dict[str, Any]]] = {}

    for row in rows:
        user_id = row.get("user_id")
        deal_key = row.get("deal_key")
        if not user_id or not deal_key:
            continue
        summary["checked"] += 1

        if deal_key not in price_cache:
            try:
                price_cache[deal_key] = _current_price_pp(supabase, deal_key)
            except Exception as e:
                logger.warning("current_price_fail %s: %s", deal_key, e)
                price_cache[deal_key] = None
                summary["errors"] += 1

        current = price_cache[deal_key]
        if not current:
            summary["missing_deal"] += 1
            continue

        baseline = row.get("last_price_pp")
        try:
            baseline_f = float(baseline) if baseline is not None else 0.0
        except (TypeError, ValueError):
            baseline_f = 0.0

        thr = float(row.get("threshold_pct") or threshold_pct())
        ok, drop = should_notify(
            baseline_pp=baseline_f,
            current_pp=current["price_pp"],
            threshold=thr,
            last_notified_at=row.get("last_notified_at"),
        )
        if not ok:
            if drop >= thr:
                summary["skipped_cooldown"] += 1
            else:
                summary["skipped_threshold"] += 1
            # Still track silent downward drift without notifying? keep baseline
            continue

        deal = current["deal"]
        city = deal.get("city") or deal_key
        email = _user_email(supabase, user_id)
        if not email:
            summary["no_email"] += 1
            continue

        detail = {
            "user_id": user_id,
            "deal_key": deal_key,
            "city": city,
            "from_pp": baseline_f,
            "to_pp": current["price_pp"],
            "drop_pct": round(drop, 2),
            "email": email,
        }

        if dry_run:
            summary["notified"] += 1
            summary["details"].append({**detail, "dry_run": True})
            continue

        try:
            from email_notify import notify_deal_price_drop

            sent = notify_deal_price_drop(
                email=email,
                city=str(city),
                deal_key=deal_key,
                old_pp=baseline_f,
                new_pp=float(current["price_pp"]),
                drop_pct=drop,
            )
            # Always advance baseline + cooldown after attempt (avoid spam if Resend off)
            now = _now_iso()
            supabase.table("deal_price_alerts").update(
                {
                    "last_price_pp": current["price_pp"],
                    "last_notified_at": now,
                }
            ).eq("id", row["id"]).execute()

            # Refresh liked snapshot price
            try:
                liked = (
                    supabase.table("liked_deals")
                    .select("id,deal_data")
                    .eq("user_id", user_id)
                    .eq("deal_key", deal_key)
                    .limit(1)
                    .execute()
                )
                if liked.data:
                    data = dict(liked.data[0].get("deal_data") or {})
                    data["price_per_person"] = current["price_pp"]
                    (
                        supabase.table("liked_deals")
                        .update({"deal_data": data})
                        .eq("id", liked.data[0]["id"])
                        .execute()
                    )
            except Exception:
                pass

            summary["notified"] += 1
            summary["details"].append({**detail, "email_sent": bool(sent)})
        except Exception as e:
            logger.exception("notify_fail %s: %s", deal_key, e)
            summary["errors"] += 1

    logger.info(
        "price_alerts_done checked=%s notified=%s missing=%s cooldown=%s",
        summary["checked"],
        summary["notified"],
        summary["missing_deal"],
        summary["skipped_cooldown"],
    )
    return summary
