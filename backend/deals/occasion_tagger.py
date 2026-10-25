"""
v4 Occasions Lot B — compute occasion_tags / occasion_badge at materialize.
Data-only rules; unverified / weather-gated occasions skipped.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from deals.holiday_service import (
    french_public_holidays,
    is_french_workday,
    is_hors_vacances,
    workdays_in_range,
)
from deals.occasions_config import (
    AMBIANCE_NOEL_IATA,
    HIVER_SOLEIL_IATA,
    MOINS_EUR,
    NUITS_POLAIRES_IATA,
    OCCASIONS,
    pick_badge,
)

logger = logging.getLogger("deals.occasion_tagger")

_TIME_RE = re.compile(r"T(\d{2}):(\d{2})")


def _parse_date(v: Any) -> Optional[date]:
    try:
        return date.fromisoformat(str(v)[:10])
    except (TypeError, ValueError):
        return None


def _parse_clock(iso: Any) -> Optional[time]:
    if not iso:
        return None
    m = _TIME_RE.search(str(iso))
    if not m:
        return None
    try:
        return time(int(m.group(1)), int(m.group(2)))
    except ValueError:
        return None


def _hotel0(row: Dict[str, Any]) -> Dict[str, Any]:
    top = row.get("hotel_top3")
    if isinstance(top, list) and top and isinstance(top[0], dict):
        return top[0]
    return {}


def _flight(row: Dict[str, Any]) -> Dict[str, Any]:
    f = row.get("flight_snapshot")
    return f if isinstance(f, dict) else {}


def _price_pp(row: Dict[str, Any], adults: int = 2) -> float:
    flight = _flight(row)
    try:
        fpp = float(flight.get("price_pp_eur") or 0)
    except (TypeError, ValueError):
        fpp = 0.0
    hotel = _hotel0(row)
    try:
        public = float(
            hotel.get("public_hotel_price")
            or hotel.get("public_price")
            or 0
        )
    except (TypeError, ValueError):
        public = 0.0
    hpp = (public / max(1, adults)) if public > 0 else 0.0
    if hpp > 0:
        return round(fpp + hpp, 2)
    return round(fpp, 2)


def _board_has_breakfast(hotel: Dict[str, Any]) -> bool:
    board = str(hotel.get("board") or hotel.get("board_name") or "").upper()
    return "BI" in board or "BREAKFAST" in board or "PETIT" in board


def rule_sans_conge(row: Dict[str, Any]) -> bool:
    """Fri dep ≥ 18:00 local → Sun ret, or Fri→Mon arr ≤ 09:00."""
    out_d = _parse_date(row.get("out_date"))
    ret_d = _parse_date(row.get("ret_date"))
    if not out_d or not ret_d:
        return False
    flight = _flight(row)
    out_t = _parse_clock(flight.get("out_dep_local"))
    ret_t = _parse_clock(flight.get("ret_dep_local") or flight.get("ret_arr_local"))
    # Fri → Sun
    if out_d.weekday() == 4 and ret_d.weekday() == 6:
        if out_t and out_t >= time(18, 0):
            return True
        # if no clock, still accept classic Fri–Sun weekend (strict prompt wants ≥18h)
        return False
    # Fri → Mon early
    if out_d.weekday() == 4 and ret_d.weekday() == 0:
        if out_t and out_t >= time(18, 0) and ret_t and ret_t <= time(9, 0):
            return True
    return False


def rule_un_jour_conge(row: Dict[str, Any]) -> bool:
    """Stay spans exactly 1 French workday (holidays excluded)."""
    out_d = _parse_date(row.get("out_date"))
    ret_d = _parse_date(row.get("ret_date"))
    if not out_d or not ret_d or ret_d < out_d:
        return False
    # Count workdays strictly inside the trip (departure day if afternoon? use inclusive)
    n = workdays_in_range(out_d, ret_d)
    return n == 1


def rule_hotel_plebiscite(row: Dict[str, Any]) -> bool:
    hotel = _hotel0(row)
    try:
        rating = float(hotel.get("rating")) if hotel.get("rating") is not None else None
    except (TypeError, ValueError):
        rating = None
    try:
        reviews = int(hotel.get("review_count") or 0)
    except (TypeError, ValueError):
        reviews = 0
    return rating is not None and rating >= 9.0 and reviews >= 1000


def rule_extras_offerts(row: Dict[str, Any]) -> bool:
    hotel = _hotel0(row)
    if _board_has_breakfast(hotel):
        return True
    perks = hotel.get("perks")
    if isinstance(perks, list) and len(perks) > 0:
        return True
    if isinstance(perks, str) and perks.strip():
        return True
    return False


def rule_moins_eur(row: Dict[str, Any], *, max_pp: float = MOINS_EUR) -> bool:
    pp = _price_pp(row)
    return 0 < pp < float(max_pp)


def rule_hors_vacances(row: Dict[str, Any], *, periods=None) -> bool:
    out_d = _parse_date(row.get("out_date"))
    ret_d = _parse_date(row.get("ret_date"))
    if not out_d or not ret_d:
        return False
    return is_hors_vacances(out_d, ret_d, periods=periods)


def rule_whitelist_iata(row: Dict[str, Any], *, iatas: Sequence[str]) -> bool:
    dest = str(row.get("dest_iata") or "").upper()
    return dest in {str(x).upper() for x in iatas}


def rule_covers_nye(row: Dict[str, Any]) -> bool:
    out_d = _parse_date(row.get("out_date"))
    ret_d = _parse_date(row.get("ret_date"))
    if not out_d or not ret_d:
        return False
    # Night of Dec 31: out <= Dec 31 and ret >= Jan 1 (or out on Dec 31)
    for y in {out_d.year, ret_d.year, out_d.year + 1}:
        nye = date(y, 12, 31)
        nye_next = date(y + 1, 1, 1)
        if out_d <= nye and ret_d >= nye_next:
            return True
        if out_d <= nye and ret_d >= nye:
            return True
    return False


def rule_pont_noel(row: Dict[str, Any]) -> bool:
    """Stay includes Dec 25 when it is Fri or Mon (bridge weekend)."""
    out_d = _parse_date(row.get("out_date"))
    ret_d = _parse_date(row.get("ret_date"))
    if not out_d or not ret_d:
        return False
    for y in {out_d.year, ret_d.year}:
        xmas = date(y, 12, 25)
        if xmas.weekday() not in (0, 4):  # Mon or Fri
            continue
        if out_d <= xmas <= ret_d:
            return True
    return False


def rule_max_sur_place(row: Dict[str, Any], *, min_hours: float = 40) -> bool:
    flight = _flight(row)
    out_iso = flight.get("out_arr_local") or flight.get("out_dep_local")
    ret_iso = flight.get("ret_dep_local")
    if not out_iso or not ret_iso:
        # fallback: nights * 24 rough
        try:
            nights = int(row.get("nights") or 0)
        except (TypeError, ValueError):
            nights = 0
        return nights >= 2 and (nights * 20) >= min_hours
    try:
        a = datetime.fromisoformat(str(out_iso).replace("Z", "+00:00"))
        b = datetime.fromisoformat(str(ret_iso).replace("Z", "+00:00"))
        hours = (b - a).total_seconds() / 3600.0
        return hours >= min_hours
    except ValueError:
        return False


def rule_pepites(row: Dict[str, Any], *, min_rating: float = 8.5) -> bool:
    """Good hotel, below median flight if baseline present — popularity deferred."""
    hotel = _hotel0(row)
    try:
        rating = float(hotel.get("rating")) if hotel.get("rating") is not None else None
    except (TypeError, ValueError):
        rating = None
    if rating is None or rating < min_rating:
        return False
    baseline = row.get("baseline_snapshot") if isinstance(row.get("baseline_snapshot"), dict) else {}
    try:
        median = float(baseline.get("median") or 0)
        fpp = float(_flight(row).get("price_pp_eur") or 0)
    except (TypeError, ValueError):
        return False
    if median <= 0 or fpp <= 0:
        return False
    return fpp <= median


_RULES = {
    "sans_conge": lambda row, params, ctx: rule_sans_conge(row),
    "un_jour_conge": lambda row, params, ctx: rule_un_jour_conge(row),
    "hotel_plebiscite": lambda row, params, ctx: rule_hotel_plebiscite(row),
    "extras_offerts": lambda row, params, ctx: rule_extras_offerts(row),
    "moins_eur": lambda row, params, ctx: rule_moins_eur(
        row, max_pp=float(params.get("max_pp") or MOINS_EUR)
    ),
    "hors_vacances": lambda row, params, ctx: rule_hors_vacances(
        row, periods=ctx.get("school_periods")
    ),
    "whitelist_iata": lambda row, params, ctx: rule_whitelist_iata(
        row, iatas=params.get("iatas") or []
    ),
    "covers_nye": lambda row, params, ctx: rule_covers_nye(row),
    "pont_noel": lambda row, params, ctx: rule_pont_noel(row),
    "max_sur_place": lambda row, params, ctx: rule_max_sur_place(
        row, min_hours=float(params.get("min_hours") or 40)
    ),
    "pepites": lambda row, params, ctx: rule_pepites(
        row, min_rating=float(params.get("min_rating") or 8.5)
    ),
    "il_fera_beau": lambda row, params, ctx: rule_il_fera_beau(row, params, ctx),
}


def rule_il_fera_beau(row: Dict[str, Any], params: Dict[str, Any], ctx: Dict[str, Any]) -> bool:
    """Lot D — majority of stay days ≥ seasonal max °C (LiteAPI only, no invention)."""
    from deals.weather_service import rule_il_fera_beau_temps, stay_temps_c, weather_enabled

    if not weather_enabled():
        return False
    temps = stay_temps_c(
        row,
        supabase=ctx.get("supabase"),
        today=ctx.get("today"),
        client=ctx.get("liteapi"),
    )
    if not temps:
        return False
    out_d = _parse_date(row.get("out_date"))
    if not out_d:
        return False
    return rule_il_fera_beau_temps(
        temps,
        out_d=out_d,
        winter_min_c=float(params.get("winter_min_c") or 18),
        summer_min_c=float(params.get("summer_min_c") or 24),
    )


def _is_promoted_today(occ: Dict[str, Any], today: date) -> bool:
    kind = occ.get("kind") or "evergreen"
    if kind == "evergreen":
        return True
    if not occ.get("verified", True):
        return False
    months = occ.get("promote_months")
    if months and today.month not in months:
        return False
    pf = occ.get("promote_from")  # "MM-DD"
    if isinstance(pf, str) and len(pf) >= 5:
        try:
            mm, dd = int(pf[:2]), int(pf[3:5])
            start = date(today.year, mm, dd)
            # window wraps year for winter chips starting Oct
            if today < start and mm >= 10:
                return False
            if today < start and mm < 6 and today.month <= mm:
                return False
        except ValueError:
            pass
    # stay month filter for ambiance-noel style
    stay_range = occ.get("stay_month_range")
    if stay_range and today.month not in stay_range and today.month not in (10, 11, 12, 1):
        # still allow tagging deals whose stay is in range even if chip month differs
        pass
    return True


def _stay_in_window(row: Dict[str, Any], occ: Dict[str, Any]) -> bool:
    """Optional stay_day_from / stay_day_to as (month, day)."""
    a = occ.get("stay_day_from")
    b = occ.get("stay_day_to")
    if not a or not b:
        return True
    out_d = _parse_date(row.get("out_date"))
    ret_d = _parse_date(row.get("ret_date"))
    if not out_d or not ret_d:
        return False
    try:
        y = out_d.year
        start = date(y, int(a[0]), int(a[1]))
        end = date(y, int(b[0]), int(b[1]))
        if end < start:
            end = date(y + 1, int(b[0]), int(b[1]))
        # overlap
        return out_d <= end and ret_d >= start
    except (TypeError, ValueError, IndexError):
        return True


def _occasion_active(occ: Dict[str, Any]) -> bool:
    """Unverified occasions skipped; il-fera-beau opens when DEALS_WEATHER_ENABLED."""
    slug = occ.get("slug")
    if slug == "il-fera-beau":
        try:
            from deals.weather_service import weather_enabled

            return weather_enabled()
        except Exception:
            return False
    return bool(occ.get("verified", True))


def tag_deal_row(
    row: Dict[str, Any],
    *,
    today: Optional[date] = None,
    school_periods=None,
    has_discount_badge: bool = False,
    supabase: Any = None,
    liteapi: Any = None,
) -> Tuple[List[str], Optional[str]]:
    """Return (occasion_tags, occasion_badge) for one deals_active row."""
    today = today or date.today()
    ctx = {
        "school_periods": school_periods,
        "today": today,
        "supabase": supabase,
        "liteapi": liteapi,
    }
    tags: List[str] = []
    for occ in OCCASIONS:
        if not _occasion_active(occ):
            continue
        rule_name = occ.get("rule") or ""
        fn = _RULES.get(str(rule_name))
        if not fn:
            continue
        if not _stay_in_window(row, occ):
            continue
        try:
            ok = bool(fn(row, occ.get("params") or {}, ctx))
        except Exception as e:
            logger.debug("rule %s fail: %s", rule_name, e)
            ok = False
        if ok:
            tags.append(str(occ["slug"]))
    # dedupe preserve order
    seen: Set[str] = set()
    uniq: List[str] = []
    for t in tags:
        if t in seen:
            continue
        seen.add(t)
        uniq.append(t)
    badge = pick_badge(uniq, has_discount_badge=has_discount_badge)
    return uniq, badge


def tag_deals_batch(
    supabase: Any,
    rows: Sequence[Dict[str, Any]],
    *,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """Write occasion_tags / occasion_badge for provided deals_active rows."""
    from deals.holiday_service import fetch_school_holidays_fr
    from deals.weather_service import reset_budget, weather_enabled

    today = today or date.today()
    try:
        periods = fetch_school_holidays_fr()
    except Exception:
        periods = None

    reset_budget()
    liteapi = None
    if weather_enabled():
        try:
            from deals.liteapi_client import get_liteapi_client

            liteapi = get_liteapi_client()
        except Exception as e:
            logger.warning("weather client unavailable: %s", e)

    updated = 0
    errors = 0
    now = datetime.utcnow().isoformat() + "Z"
    for row in rows:
        key = row.get("deal_key")
        if not key:
            continue
        try:
            disc = row.get("discount_pct")
            has_disc = False
            try:
                has_disc = disc is not None and float(disc) >= 15
            except (TypeError, ValueError):
                has_disc = False
            tags, badge = tag_deal_row(
                row,
                today=today,
                school_periods=periods,
                has_discount_badge=has_disc,
                supabase=supabase,
                liteapi=liteapi,
            )
            if supabase:
                supabase.table("deals_active").update(
                    {
                        "occasion_tags": tags,
                        "occasion_badge": badge,
                        "updated_at": now,
                    }
                ).eq("deal_key", key).execute()
            updated += 1
            row["occasion_tags"] = tags
            row["occasion_badge"] = badge
        except Exception as e:
            errors += 1
            logger.warning("tag deal %s: %s", key, e)
    return {"ok": True, "tagged": updated, "errors": errors}


def retag_active_wall(supabase: Any, *, limit: int = 800) -> Dict[str, Any]:
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    try:
        res = (
            supabase.table("deals_active")
            .select(
                "deal_key,dest_iata,served_city_id,out_date,ret_date,nights,"
                "flight_snapshot,hotel_top3,baseline_snapshot,discount_pct,status"
            )
            .eq("status", "active")
            .limit(max(1, min(int(limit), 2000)))
            .execute()
        )
        rows = list(res.data or [])
    except Exception as e:
        return {"ok": False, "error": str(e)}
    summary = tag_deals_batch(supabase, rows)
    summary["scanned"] = len(rows)
    return summary
