"""
D3 — route_price_baselines from price_observations (30-day window).
"""
from __future__ import annotations

import logging
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

logger = logging.getLogger("deals.baselines")

HORIZON_LE14 = "le14"
HORIZON_D15_45 = "d15_45"
HORIZON_D46_120 = "d46_120"


def horizon_bucket(out_date: str, *, now: Optional[datetime] = None) -> Optional[str]:
    try:
        out = datetime.fromisoformat(str(out_date)[:10]).replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    today = (now or datetime.now(timezone.utc)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    days = (out.date() - today.date()).days
    if days < 0:
        return None
    if days <= 14:
        return HORIZON_LE14
    if days <= 45:
        return HORIZON_D15_45
    if days <= 120:
        return HORIZON_D46_120
    return None


def _percentile(sorted_vals: Sequence[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return float(sorted_vals[int(k)])
    d0 = sorted_vals[f] * (c - k)
    d1 = sorted_vals[c] * (k - f)
    return float(d0 + d1)


def compute_baseline_stats(
    prices: Sequence[float],
    distinct_dates: int,
) -> Dict[str, Any]:
    vals = sorted(float(p) for p in prices if p is not None and float(p) > 0)
    n = len(vals)
    p20 = _percentile(vals, 20) if vals else None
    median = _percentile(vals, 50) if vals else None
    p80 = _percentile(vals, 80) if vals else None
    reliable = n >= 30 and distinct_dates >= 8
    return {
        "p20": round(p20, 2) if p20 is not None else None,
        "median": round(median, 2) if median is not None else None,
        "p80": round(p80, 2) if p80 is not None else None,
        "n_obs": n,
        "n_distinct_dates": int(distinct_dates),
        "reliable": reliable,
        "baseline_kind": "observed",
    }


def is_good_price(
    price_pp: float,
    baseline: Dict[str, Any],
    *,
    max_flight_pp: float = 120.0,
) -> bool:
    if price_pp <= 0 or price_pp > max_flight_pp:
        return False
    kind = baseline.get("baseline_kind") or "observed"
    if kind == "estimated":
        expected = baseline.get("expected_pp_eur") or baseline.get("median")
        if not expected:
            return False
        return price_pp <= 0.65 * float(expected)
    if not baseline.get("reliable"):
        # Soft path: still allow vs median if present
        median = baseline.get("median")
        if median:
            return price_pp <= 0.75 * float(median)
        return False
    p20 = baseline.get("p20")
    median = baseline.get("median")
    ok_p20 = p20 is not None and price_pp <= float(p20)
    ok_med = median is not None and price_pp <= 0.75 * float(median)
    return bool(ok_p20 or ok_med)


def discount_pct_vs_usual(price_pp: float, baseline: Dict[str, Any]) -> Optional[float]:
    """Honest flight-only discount vs 30d median. None if estimated / unreliable."""
    if (baseline.get("baseline_kind") or "observed") == "estimated":
        return None
    if not baseline.get("reliable"):
        return None
    median = baseline.get("median")
    if not median or float(median) <= 0 or price_pp <= 0:
        return None
    pct = (float(median) - float(price_pp)) / float(median) * 100.0
    if pct < 5:
        return None
    return round(pct, 1)


def build_baselines_from_rows(
    rows: Sequence[Dict[str, Any]],
    *,
    now: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """
    Group observations → baseline rows.
    Key: (origin, served_city_id, trip_type, horizon_bucket)
    """
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)
    buckets: Dict[Tuple[str, str, str, str], List[Dict[str, Any]]] = defaultdict(list)

    for r in rows:
        observed = r.get("observed_at")
        try:
            if isinstance(observed, str):
                obs_dt = datetime.fromisoformat(observed.replace("Z", "+00:00"))
            else:
                obs_dt = now
            if obs_dt.tzinfo is None:
                obs_dt = obs_dt.replace(tzinfo=timezone.utc)
            if obs_dt < cutoff:
                continue
        except Exception:
            continue

        origin = (r.get("origin_iata") or "").upper()
        city_id = r.get("served_city_id")
        trip_type = r.get("trip_type") or "OTHER"
        out_date = str(r.get("out_date") or "")[:10]
        hb = horizon_bucket(out_date, now=now)
        if not origin or not city_id or not hb:
            continue
        price = r.get("price_pp_eur")
        try:
            price_f = float(price)
        except (TypeError, ValueError):
            continue
        key = (origin, str(city_id), str(trip_type), hb)
        buckets[key].append({"price": price_f, "out_date": out_date})

    out: List[Dict[str, Any]] = []
    for (origin, city_id, trip_type, hb), items in buckets.items():
        prices = [i["price"] for i in items]
        distinct = len({i["out_date"] for i in items})
        stats = compute_baseline_stats(prices, distinct)
        out.append(
            {
                "origin_iata": origin,
                "served_city_id": city_id,
                "trip_type": trip_type,
                "horizon_bucket": hb,
                **stats,
                "expected_pp_eur": None,
                "computed_at": now.isoformat(),
            }
        )
    return out


def refresh_route_baselines(supabase, *, cfg=None) -> Dict[str, Any]:
    """Load 30d observations and upsert baselines."""
    from deals.liteapi_config import load_deals_config

    cfg = cfg or load_deals_config()
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    try:
        res = (
            supabase.table("price_observations")
            .select(
                "origin_iata, served_city_id, trip_type, out_date, price_pp_eur, observed_at"
            )
            .gte("observed_at", since)
            .not_.is_("served_city_id", "null")
            .limit(50000)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        logger.error("load observations for baselines: %s", e)
        return {"ok": False, "error": str(e)}

    baselines = build_baselines_from_rows(rows)
    upserted = 0
    for b in baselines:
        try:
            supabase.table("route_price_baselines").upsert(
                b,
                on_conflict="origin_iata,served_city_id,trip_type,horizon_bucket",
            ).execute()
            upserted += 1
        except Exception as e:
            logger.warning("baseline upsert: %s", e)
    return {"ok": True, "rows_in": len(rows), "baselines": upserted}
