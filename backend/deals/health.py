"""
v3.3 Lot D — wall health invariants (replace manual checklists).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("deals.health")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _priority_origins() -> List[str]:
    raw = os.getenv("SEED_PRIORITY_ORIGINS", "BVA,MRS,NTE,BOD,TLS,LYS") or ""
    return [x.strip().upper() for x in raw.split(",") if x.strip()]


def _parse_ts(val: Any) -> Optional[datetime]:
    if not val:
        return None
    try:
        dt = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def evaluate_invariants(
    *,
    deals_with_photo_by_origin: Dict[str, int],
    fresh_hotel_rate_share: Optional[float],
    baselines_age_h: Optional[float],
    ryanair_403_share_1h: Optional[float],
    job_lag: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Pure evaluation — easy to unit-test.
    job_lag[name] = {age_h, max_age_h, ok}
    """
    min_photo = _env_int("DEALS_HEALTH_MIN_DEALS_WITH_PHOTO", 8)
    min_fresh = _env_float("DEALS_HEALTH_MIN_FRESH_HOTEL_RATE_SHARE", 0.70)
    max_baseline_h = _env_float(
        "DEALS_HEALTH_BASELINE_MAX_AGE_H",
        _env_float("DEALS_BASELINE_MAX_AGE_H", 36.0),
    )
    max_403 = _env_float("DEALS_HEALTH_RYANAIR_403_MAX_SHARE", 0.05)

    checks: List[Dict[str, Any]] = []
    red = 0

    for origin in _priority_origins():
        n = int(deals_with_photo_by_origin.get(origin, 0) or 0)
        ok = n >= min_photo
        if not ok:
            red += 1
        checks.append(
            {
                "id": f"photo_{origin}",
                "label": f"Deals avec photo ({origin})",
                "ok": ok,
                "value": n,
                "threshold": f">= {min_photo}",
            }
        )

    if fresh_hotel_rate_share is not None:
        ok = float(fresh_hotel_rate_share) >= min_fresh
        if not ok:
            red += 1
        checks.append(
            {
                "id": "fresh_hotel_rates",
                "label": "Part deals avec tarif hôtel frais",
                "ok": ok,
                "value": round(float(fresh_hotel_rate_share), 3),
                "threshold": f">= {min_fresh}",
            }
        )

    if baselines_age_h is not None:
        ok = float(baselines_age_h) <= max_baseline_h
        if not ok:
            red += 1
        checks.append(
            {
                "id": "baselines_age",
                "label": "Âge baselines",
                "ok": ok,
                "value": round(float(baselines_age_h), 2),
                "threshold": f"<= {max_baseline_h} h",
            }
        )

    if ryanair_403_share_1h is not None:
        ok = float(ryanair_403_share_1h) <= max_403
        if not ok:
            red += 1
        checks.append(
            {
                "id": "ryanair_403",
                "label": "Taux 403 Ryanair (1 h)",
                "ok": ok,
                "value": round(float(ryanair_403_share_1h), 3),
                "threshold": f"<= {max_403}",
            }
        )

    for name, info in (job_lag or {}).items():
        age = info.get("age_h")
        max_age = info.get("max_age_h")
        if age is None or max_age is None:
            continue
        ok = float(age) <= float(max_age)
        if not ok:
            red += 1
        checks.append(
            {
                "id": f"job_{name}",
                "label": f"Job {name}",
                "ok": ok,
                "value": round(float(age), 2),
                "threshold": f"<= {max_age} h",
            }
        )

    return {
        "ok": red == 0,
        "red_count": red,
        "checks": checks,
    }


def collect_wall_health(supabase: Any) -> Dict[str, Any]:
    """Live snapshot for admin + optional daily email."""
    from deals.baseline_guard import baselines_freshness
    from deals.liteapi_config import load_deals_config
    from deals.pool_photos import extract_main_photo
    from deals.upsell import find_destination_by_iata, read_rates_cache_by_dates

    cfg = load_deals_config()
    now = datetime.now(timezone.utc)
    photo_by_origin: Dict[str, int] = {o: 0 for o in _priority_origins()}
    active = 0
    with_fresh_rate = 0

    try:
        res = (
            supabase.table("deals_active")
            .select(
                "origin_iata,dest_iata,out_date,ret_date,hotel_top3,status"
            )
            .eq("status", "active")
            .limit(2000)
            .execute()
        )
        rows = list(res.data or [])
    except Exception as e:
        return {"ok": False, "error": str(e), "generated_at": now.isoformat()}

    dest_cache: Dict[str, Any] = {}
    for row in rows:
        active += 1
        origin = str(row.get("origin_iata") or "").upper()
        hotels = row.get("hotel_top3") or []
        has_photo = False
        if isinstance(hotels, list):
            for h in hotels:
                if isinstance(h, dict) and extract_main_photo(h):
                    has_photo = True
                    break
        if has_photo and origin in photo_by_origin:
            photo_by_origin[origin] = photo_by_origin.get(origin, 0) + 1

        # Fresh rate = usable rates for deal dates (strict TTL, no grace for health)
        try:
            iata = str(row.get("dest_iata") or "").upper()
            if iata not in dest_cache:
                dest_cache[iata] = find_destination_by_iata(supabase, iata)
            dest = dest_cache[iata]
            cin = row.get("out_date")
            cout = row.get("ret_date")
            if dest and cin and cout:
                from datetime import date as date_cls

                cached = read_rates_cache_by_dates(
                    supabase,
                    destination_id=dest["id"],
                    checkin=date_cls.fromisoformat(str(cin)[:10]),
                    checkout=date_cls.fromisoformat(str(cout)[:10]),
                    adults=2,
                )
                # read_rates_cache_by_dates already applies grace; for health prefer fresh-only
                if cached and cached.get("source") == "rates_cache":
                    with_fresh_rate += 1
        except Exception:
            pass

    fresh_share = (with_fresh_rate / active) if active else None

    baselines_age_h = None
    try:
        max_age = float(getattr(cfg, "baseline_max_age_h", 36.0) or 36.0)
        _fresh, last, _reason = baselines_freshness(supabase, max_age_h=max_age)
        if isinstance(last, datetime):
            baselines_age_h = (now - last).total_seconds() / 3600.0
        else:
            last_dt = _parse_ts(last)
            if last_dt:
                baselines_age_h = (now - last_dt).total_seconds() / 3600.0
    except Exception:
        pass

    # Job lag vs 2× nominal frequency
    nominal_h = {
        "promote-deals": 0.5,
        "refresh-deal-rates": 0.5,
        "refresh-baselines": 24.0,
        "seed-scan": 6.0,
        "revalidate-deals": 1.5,
    }
    job_lag: Dict[str, Dict[str, Any]] = {}
    try:
        for name, every_h in nominal_h.items():
            r = (
                supabase.table("deals_job_runs")
                .select("finished_at,status,job_name")
                .eq("job_name", name)
                .eq("status", "ok")
                .order("finished_at", desc=True)
                .limit(1)
                .execute()
            )
            row = (r.data or [None])[0]
            if not row:
                job_lag[name] = {
                    "age_h": 999.0,
                    "max_age_h": every_h * 2,
                }
                continue
            fin = _parse_ts(row.get("finished_at"))
            age = (now - fin).total_seconds() / 3600.0 if fin else 999.0
            job_lag[name] = {"age_h": age, "max_age_h": every_h * 2}
    except Exception as e:
        logger.warning("job_lag read: %s", e)

    # Ryanair 403 share — best-effort; None if counter not exposed yet (Lot F)
    ryanair_403 = None
    try:
        from providers import ryanair_budget as rb

        get_stats = getattr(rb, "stats", None) or getattr(rb, "get_stats", None)
        if callable(get_stats):
            snap = get_stats()
            if isinstance(snap, dict):
                calls = float(snap.get("calls_1h") or snap.get("calls") or 0)
                forbidden = float(
                    snap.get("forbidden_1h") or snap.get("status_403") or 0
                )
                if calls > 0:
                    ryanair_403 = forbidden / calls
    except Exception:
        pass

    evaluated = evaluate_invariants(
        deals_with_photo_by_origin=photo_by_origin,
        fresh_hotel_rate_share=fresh_share,
        baselines_age_h=baselines_age_h,
        ryanair_403_share_1h=ryanair_403,
        job_lag=job_lag,
    )

    chain = {
        "promote": job_lag.get("promote-deals"),
        "refresh_deal_rates": job_lag.get("refresh-deal-rates"),
    }

    return {
        "ok": evaluated["ok"],
        "generated_at": now.isoformat(),
        "active_deals": active,
        "photo_by_origin": photo_by_origin,
        "fresh_hotel_rate_share": fresh_share,
        "baselines_age_h": baselines_age_h,
        "ryanair_403_share_1h": ryanair_403,
        "job_chain": chain,
        "invariants": evaluated,
    }


def maybe_send_health_email(supabase: Any, health: Dict[str, Any]) -> Dict[str, Any]:
    """Send daily red-alert email if DEALS_HEALTH_EMAIL_TO set."""
    to = (os.getenv("DEALS_HEALTH_EMAIL_TO") or "").strip()
    if not to:
        return {"sent": False, "reason": "no_recipient"}
    if health.get("ok"):
        return {"sent": False, "reason": "all_green"}
    # Dry-run friendly: without RESEND, just log
    try:
        from email_service import send_simple_email  # type: ignore
    except Exception:
        send_simple_email = None

    red = [
        c
        for c in (health.get("invariants") or {}).get("checks") or []
        if not c.get("ok")
    ]
    body = "FlightWatcher Deals — invariants rouges\n\n" + "\n".join(
        f"- {c.get('label')}: {c.get('value')} (seuil {c.get('threshold')})"
        for c in red
    )
    if send_simple_email is None:
        logger.warning("health_email would_send to=%s\n%s", to, body)
        return {"sent": False, "reason": "would_send", "body": body, "to": to}
    try:
        send_simple_email(to=to, subject="[FlightWatcher] Deals mur santé ROUGE", body=body)
        return {"sent": True, "to": to}
    except Exception as e:
        return {"sent": False, "error": str(e)}
