"""
v4 Occasions Lot D — LiteAPI weather with 6h cache + horizon gate.
Never invent °C: missing days / out-of-horizon → no badge.
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("deals.weather")

# Docs: reliability decreases beyond one week — stay inside this for °C badges.
DEFAULT_HORIZON_DAYS = 7
CACHE_TTL_S = 6 * 3600
_mem: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_budget_used = 0


def weather_enabled() -> bool:
    raw = (os.getenv("DEALS_WEATHER_ENABLED") or "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def forecast_horizon_days() -> int:
    raw = (os.getenv("DEALS_WEATHER_HORIZON_DAYS") or "").strip()
    try:
        n = int(raw) if raw else DEFAULT_HORIZON_DAYS
    except ValueError:
        n = DEFAULT_HORIZON_DAYS
    return max(1, min(n, 16))


def weather_budget_per_run() -> int:
    raw = (os.getenv("DEALS_WEATHER_BUDGET_PER_RUN") or "").strip()
    try:
        n = int(raw) if raw else 40
    except ValueError:
        n = 40
    return max(0, min(n, 200))


def reset_budget() -> None:
    global _budget_used
    _budget_used = 0


def _cache_key(lat: float, lon: float, start: date, end: date) -> str:
    raw = f"{round(lat, 3)}|{round(lon, 3)}|{start.isoformat()}|{end.isoformat()}"
    return hashlib.sha1(raw.encode()).hexdigest()[:40]


def _parse_daily(payload: Any) -> List[Dict[str, Any]]:
    """Normalize LiteAPI weather payload → [{date, max_c, min_c}, ...]."""
    days: List[Dict[str, Any]] = []
    if not payload:
        return days
    root = payload
    if isinstance(payload, dict):
        root = payload.get("weatherData") or payload.get("data") or payload
    items = root if isinstance(root, list) else []
    for item in items:
        if not isinstance(item, dict):
            continue
        daily = item.get("dailyWeather") or item
        if not isinstance(daily, dict):
            continue
        d_raw = daily.get("date")
        temp = daily.get("temperature") or {}
        if not isinstance(temp, dict):
            temp = {}
        try:
            max_c = temp.get("max")
            min_c = temp.get("min")
            max_f = float(max_c) if max_c is not None else None
            min_f = float(min_c) if min_c is not None else None
        except (TypeError, ValueError):
            max_f, min_f = None, None
        if d_raw and max_f is not None:
            days.append(
                {
                    "date": str(d_raw)[:10],
                    "max_c": max_f,
                    "min_c": min_f,
                }
            )
    return days


def stay_within_horizon(
    out_d: date,
    ret_d: date,
    *,
    today: Optional[date] = None,
    horizon: Optional[int] = None,
) -> bool:
    """True only if the whole stay is within the trusted forecast window."""
    today = today or date.today()
    h = horizon if horizon is not None else forecast_horizon_days()
    limit = today + timedelta(days=h)
    return out_d >= today and ret_d <= limit


def _load_db_cache(supabase: Any, key: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = (
            supabase.table("deal_weather_cache")
            .select("payload,fetched_at,days_with_temp")
            .eq("cache_key", key)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        row = res.data[0]
        fetched = row.get("fetched_at")
        if fetched:
            try:
                ts = datetime.fromisoformat(str(fetched).replace("Z", "+00:00"))
                if datetime.now(timezone.utc) - ts > timedelta(seconds=CACHE_TTL_S):
                    return None
            except (TypeError, ValueError):
                pass
        payload = row.get("payload") or {}
        days = _parse_daily(payload)
        return {"payload": payload, "days": days, "from_cache": True}
    except Exception as e:
        logger.debug("weather db cache miss: %s", e)
        return None


def _save_db_cache(
    supabase: Any,
    *,
    key: str,
    lat: float,
    lon: float,
    start: date,
    end: date,
    payload: Any,
    days: List[Dict[str, Any]],
) -> None:
    if not supabase:
        return
    try:
        supabase.table("deal_weather_cache").upsert(
            {
                "cache_key": key,
                "latitude": lat,
                "longitude": lon,
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "payload": payload if isinstance(payload, dict) else {"raw": payload},
                "days_with_temp": len(days),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="cache_key",
        ).execute()
    except Exception as e:
        logger.debug("weather db cache write: %s", e)


def fetch_weather_days(
    *,
    latitude: float,
    longitude: float,
    start: date,
    end: date,
    supabase: Any = None,
    client: Any = None,
) -> Dict[str, Any]:
    """
    Return {ok, days:[{date,max_c,min_c}], from_cache, error?}.
    Respects in-memory + DB cache and per-run LiteAPI budget.
    """
    global _budget_used
    if end < start:
        return {"ok": False, "days": [], "error": "bad_range"}

    key = _cache_key(latitude, longitude, start, end)
    now_m = time.monotonic()
    hit = _mem.get(key)
    if hit and now_m - hit[0] < CACHE_TTL_S:
        return {**hit[1], "from_cache": True}

    db = _load_db_cache(supabase, key)
    if db and db.get("days") is not None:
        out = {"ok": True, "days": db["days"], "from_cache": True}
        _mem[key] = (now_m, out)
        return out

    if _budget_used >= weather_budget_per_run():
        return {"ok": False, "days": [], "error": "budget_exhausted"}

    try:
        if client is None:
            from deals.liteapi_client import get_liteapi_client

            client = get_liteapi_client()
        payload = client.get_weather(
            latitude=latitude,
            longitude=longitude,
            start_date=start.isoformat(),
            end_date=end.isoformat(),
            units="metric",
        )
        _budget_used += 1
    except Exception as e:
        logger.warning("weather fetch fail: %s", e)
        return {"ok": False, "days": [], "error": str(e)}

    days = _parse_daily(payload)
    out = {"ok": bool(days), "days": days, "from_cache": False}
    if days:
        _mem[key] = (now_m, out)
        _save_db_cache(
            supabase,
            key=key,
            lat=latitude,
            lon=longitude,
            start=start,
            end=end,
            payload=payload,
            days=days,
        )
    return out


def resolve_city_coords(supabase: Any, row: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    sid = row.get("served_city_id")
    if not sid or not supabase:
        return None
    try:
        res = (
            supabase.table("served_cities")
            .select("center_lat,center_lng")
            .eq("id", sid)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        r = res.data[0]
        lat, lng = r.get("center_lat"), r.get("center_lng")
        if lat is None or lng is None:
            return None
        return float(lat), float(lng)
    except Exception:
        return None


def stay_temps_c(
    row: Dict[str, Any],
    *,
    supabase: Any = None,
    today: Optional[date] = None,
    client: Any = None,
) -> Optional[List[float]]:
    """
    Max °C per stay day, or None if horizon/coords/forecast incomplete.
    Incomplete → caller must NOT show °C / tag il-fera-beau.
    """
    if not weather_enabled():
        return None
    try:
        out_d = date.fromisoformat(str(row.get("out_date"))[:10])
        ret_d = date.fromisoformat(str(row.get("ret_date"))[:10])
    except (TypeError, ValueError):
        return None
    today = today or date.today()
    if not stay_within_horizon(out_d, ret_d, today=today):
        return None
    coords = resolve_city_coords(supabase, row)
    if not coords:
        return None
    lat, lon = coords
    fetched = fetch_weather_days(
        latitude=lat,
        longitude=lon,
        start=out_d,
        end=ret_d,
        supabase=supabase,
        client=client,
    )
    by_date = {d["date"]: d["max_c"] for d in fetched.get("days") or []}
    temps: List[float] = []
    cur = out_d
    while cur <= ret_d:
        key = cur.isoformat()
        if key not in by_date:
            return None  # incomplete → no invention
        temps.append(float(by_date[key]))
        cur += timedelta(days=1)
    return temps


def rule_il_fera_beau_temps(
    temps: List[float],
    *,
    out_d: date,
    winter_min_c: float = 18.0,
    summer_min_c: float = 24.0,
) -> bool:
    """Majority of stay days reach the seasonal max threshold."""
    if not temps:
        return False
    # Nov–Mar winter threshold
    thr = winter_min_c if out_d.month in (11, 12, 1, 2, 3) else summer_min_c
    good = sum(1 for t in temps if t >= thr)
    return good * 2 >= len(temps)  # majority (≥ half)
