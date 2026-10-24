"""
In-process LiteAPI latency ring + cache/funnel snapshot for go/no-go (L11).
"""
from __future__ import annotations

import threading
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional, Tuple

_lock = threading.Lock()
_latencies_ms: Deque[Tuple[str, int, str]] = deque(maxlen=500)  # (endpoint, ms, day)
_calls_today: Dict[str, int] = {}
_errors_today: Dict[str, int] = {}
_day: str = ""


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def record_liteapi_call(
    endpoint: str,
    duration_ms: int,
    *,
    ok: bool = True,
) -> None:
    global _day
    day = _today()
    with _lock:
        if day != _day:
            _day = day
            _calls_today.clear()
            _errors_today.clear()
        _latencies_ms.append((endpoint, int(duration_ms), day))
        _calls_today[endpoint] = _calls_today.get(endpoint, 0) + 1
        if not ok:
            _errors_today[endpoint] = _errors_today.get(endpoint, 0) + 1


def _percentile(sorted_vals: List[float], p: float) -> Optional[float]:
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return float(sorted_vals[f])
    return float(sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f))


def process_latency_stats() -> Dict[str, Any]:
    day = _today()
    with _lock:
        vals = [ms for _ep, ms, d in _latencies_ms if d == day]
        calls = dict(_calls_today)
        errors = dict(_errors_today)
    vals_sorted = sorted(vals)
    return {
        "day": day,
        "calls_total": sum(calls.values()),
        "calls_by_endpoint": calls,
        "errors_by_endpoint": errors,
        "latency_ms_p50": _percentile(vals_sorted, 50),
        "latency_ms_p95": _percentile(vals_sorted, 95),
        "samples": len(vals_sorted),
    }


def _cache_status_counts(supabase: Any, table: str) -> Dict[str, int]:
    try:
        r = supabase.table(table).select("status").execute()
        out: Dict[str, int] = {}
        for row in r.data or []:
            st = str(row.get("status") or "unknown")
            out[st] = out.get(st, 0) + 1
        return out
    except Exception:
        return {}


def _ssp_missing_share(supabase: Any) -> Dict[str, Any]:
    try:
        r = (
            supabase.table("hotel_rates_cache")
            .select("top,status")
            .eq("status", "ok")
            .execute()
        )
        total = 0
        missing = 0
        gaps: List[float] = []
        for row in r.data or []:
            top = row.get("top") or []
            if not isinstance(top, list):
                continue
            for c in top[:1]:
                if not isinstance(c, dict):
                    continue
                total += 1
                if c.get("ssp_missing"):
                    missing += 1
                try:
                    gaps.append(float(c.get("margin_gap") or 0))
                except (TypeError, ValueError):
                    pass
        return {
            "hotels_scored": total,
            "ssp_missing": missing,
            "ssp_missing_pct": round(100.0 * missing / total, 1) if total else None,
            "margin_gap_avg": round(sum(gaps) / len(gaps), 2) if gaps else None,
        }
    except Exception:
        return {"hotels_scored": 0, "ssp_missing": 0}


def _booking_funnel(supabase: Any) -> Dict[str, int]:
    try:
        r = supabase.table("hotel_bookings").select("status").execute()
        out: Dict[str, int] = {}
        for row in r.data or []:
            st = str(row.get("status") or "unknown")
            out[st] = out.get(st, 0) + 1
        return out
    except Exception:
        return {}


def compliance_checklist(cfg: Any) -> List[Dict[str, Any]]:
    """UI/ops checklist §12 — status hints only (juriste hors code)."""
    booking_on = bool(getattr(cfg, "booking_enabled", True))
    ui_on = bool(getattr(cfg, "ui_enabled", True))
    return [
        {
            "id": "wording_vol_hotel",
            "label": "Wording « Vol + hôtel » (jamais pack/forfait)",
            "status": "ok",
            "note": "i18n deals.*",
        },
        {
            "id": "two_bookings",
            "label": "Mention deux réservations distinctes avant paiement",
            "status": "ok",
            "note": "deals.legal.twoBookings",
        },
        {
            "id": "excluded_fees",
            "label": "Taxes sur place affichées séparément",
            "status": "ok" if getattr(cfg, "excluded_fees_display", "separate") == "separate" else "warn",
            "note": f"DEALS_EXCLUDED_FEES_DISPLAY={getattr(cfg, 'excluded_fees_display', '')}",
        },
        {
            "id": "ssp_parity",
            "label": "Parité SSP (prix public ≥ SSP)",
            "status": "ok",
            "note": "pricing.public_hotel_price",
        },
        {
            "id": "cancel_before_pay",
            "label": "Conditions d’annulation hôtel avant paiement",
            "status": "ok",
            "note": "checkout cancel_deadline",
        },
        {
            "id": "cgv",
            "label": "CGV / mentions LiteAPI–Nuitee (à valider juriste)",
            "status": "todo",
            "note": "Texte paramétrable — validation juridique requise",
        },
        {
            "id": "ui_flag",
            "label": "Contrôle ouverture UI / booking",
            "status": "ok" if ui_on else "readonly",
            "note": f"DEALS_UI_ENABLED={ui_on} DEALS_BOOKING_ENABLED={booking_on}",
        },
        {
            "id": "prod_readonly_phase",
            "label": "Phase prod lecture seule (batch on, booking off)",
            "status": (
                "ok"
                if (
                    getattr(cfg, "liteapi_env", "") == "prod"
                    and ui_on
                    and not booking_on
                )
                or getattr(cfg, "liteapi_env", "") != "prod"
                else "warn"
            ),
            "note": "Prod + booking off = calibration ; activer booking après go",
        },
    ]


def go_no_go(cfg: Any, snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """Heuristic readiness — not a legal opinion."""
    blockers: List[str] = []
    warnings: List[str] = []

    if cfg.is_liteapi and not cfg.api_key:
        blockers.append("Clé LiteAPI manquante")
    if cfg.is_liteapi and cfg.liteapi_env == "prod" and cfg.booking_enabled and not cfg.payment_public_key:
        blockers.append("Clé publique paiement prod manquante")

    rates = snapshot.get("hotel_rates_cache") or {}
    no_rates = int(rates.get("no_rates") or 0)
    ok_rates = int(rates.get("ok") or 0)
    if ok_rates + no_rates > 0:
        ratio = no_rates / (ok_rates + no_rates)
        if ratio > 0.5:
            warnings.append(f"Taux no_rates élevé ({ratio:.0%})")

    ssp = snapshot.get("ssp") or {}
    if ssp.get("ssp_missing_pct") is not None and ssp["ssp_missing_pct"] > 40:
        warnings.append(f"ssp_missing {ssp['ssp_missing_pct']}%")

    checklist = compliance_checklist(cfg)
    if any(c["status"] == "todo" for c in checklist):
        warnings.append("Checklist §12 incomplète (CGV juriste)")

    ready = len(blockers) == 0
    return {
        "ready": ready and len(warnings) == 0,
        "ready_with_warnings": ready,
        "blockers": blockers,
        "warnings": warnings,
        "checklist": checklist,
    }


def collect_deals_metrics(supabase: Optional[Any] = None) -> Dict[str, Any]:
    from deals.liteapi_config import load_deals_config

    cfg = load_deals_config()
    process = process_latency_stats()
    snapshot: Dict[str, Any] = {
        "hotel_rates_cache": {},
        "deal_flight_cache": {},
        "booking_funnel": {},
        "ssp": {},
    }
    if supabase is not None:
        snapshot["hotel_rates_cache"] = _cache_status_counts(supabase, "hotel_rates_cache")
        snapshot["deal_flight_cache"] = _cache_status_counts(supabase, "deal_flight_cache")
        snapshot["booking_funnel"] = _booking_funnel(supabase)
        snapshot["ssp"] = _ssp_missing_share(supabase)
        snapshot["community"] = _community_stats(supabase)
        snapshot["baseline_guard"] = _baseline_guard_stats(supabase, cfg)
        snapshot["cached_kill"] = _cached_kill_stats(supabase, cfg)
        try:
            from deals.launch_metrics import collect_launch_metrics

            snapshot["launch"] = collect_launch_metrics(supabase, cfg=cfg)
        except Exception as e:
            snapshot["launch"] = {"error": str(e)}

    verdict = go_no_go(cfg, snapshot)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provider": cfg.provider,
        "liteapi_env": cfg.liteapi_env if cfg.is_liteapi else None,
        "deals_source": cfg.deals_source,
        "ui_enabled": cfg.ui_enabled,
        "booking_enabled": cfg.booking_enabled,
        "seed_scan_budget_per_day": cfg.seed_scan_budget_per_day,
        "scheduler_enabled": cfg.scheduler_enabled,
        "cached_enabled_env": cfg.cached_enabled,
        "process": process,
        "caches": snapshot,
        "launch": snapshot.get("launch"),
        "ryanair": _ryanair_ops_snapshot(),
        "go_no_go": verdict,
    }


def _ryanair_ops_snapshot() -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    try:
        from providers.ryanair_budget import status_snapshot

        out["budget"] = status_snapshot()
    except Exception as e:
        out["budget"] = {"error": str(e)}
    try:
        from providers.ryanair_cache import stats

        out["cache"] = stats()
    except Exception as e:
        out["cache"] = {"error": str(e)}
    return out


def _cached_kill_stats(supabase: Any, cfg: Any) -> Dict[str, Any]:
    try:
        from deals.click_checks import (
            FLAG_CACHED,
            get_runtime_flag,
            is_cached_deals_enabled,
        )

        enabled = is_cached_deals_enabled(
            supabase, env_default=getattr(cfg, "cached_enabled", True)
        )
        flag = get_runtime_flag(supabase, FLAG_CACHED)
        # Dry evaluate without writing — reuse evaluate via run with care:
        # only report status, don't call kill here
        return {
            "cached_enabled_effective": enabled,
            "runtime_flag": flag,
            "note": (
                "Travelpayouts prices_for_dates: no found_at in current mapping "
                "— DEALS_CACHED_MAX_AGE_H unused"
            ),
        }
    except Exception as e:
        return {"error": str(e)}


def _baseline_guard_stats(supabase: Any, cfg: Any) -> Dict[str, Any]:
    try:
        from deals.baseline_guard import baselines_freshness

        fresh, last, reason = baselines_freshness(
            supabase, max_age_h=getattr(cfg, "baseline_max_age_h", 36.0)
        )
        return {
            "fresh": fresh,
            "last_ok_at": last.isoformat() if last else None,
            "reason": reason,
            "max_age_h": getattr(cfg, "baseline_max_age_h", 36.0),
            "percent_badges_allowed": fresh,
        }
    except Exception as e:
        return {"fresh": None, "error": str(e)}


def _community_stats(supabase: Any) -> Dict[str, Any]:
    """D7: organic_share + active deals coverage + Lot F outbound clicks."""
    out: Dict[str, Any] = {
        "active": 0,
        "organic": 0,
        "seed": 0,
        "organic_share": None,
        "outbound_clicks_7d": 0,
        "outbound_by_partner": {},
        "affiliate_note": (
            "Travelpayouts: pas de webhook conversion branché — "
            "clics enregistrés dans click_price_checks uniquement"
        ),
    }
    try:
        res = (
            supabase.table("deals_active")
            .select("source_mix")
            .eq("status", "active")
            .limit(5000)
            .execute()
        )
        rows = res.data or []
        out["active"] = len(rows)
        organic = sum(1 for r in rows if (r.get("source_mix") or "") in ("organic", "mixed"))
        seed = sum(1 for r in rows if r.get("source_mix") == "seed")
        out["organic"] = organic
        out["seed"] = seed
        if rows:
            out["organic_share"] = round(organic / len(rows), 3)
    except Exception:
        pass
    try:
        since = datetime.now(timezone.utc).timestamp() - 7 * 86400
        since_iso = datetime.fromtimestamp(since, tz=timezone.utc).isoformat()
        clicks = (
            supabase.table("click_price_checks")
            .select("partner,source,clicked_at")
            .gte("clicked_at", since_iso)
            .limit(2000)
            .execute()
        )
        by_partner: Dict[str, int] = {}
        for row in clicks.data or []:
            p = str(row.get("partner") or "unknown").lower()
            by_partner[p] = by_partner.get(p, 0) + 1
        out["outbound_clicks_7d"] = len(clicks.data or [])
        out["outbound_by_partner"] = by_partner
    except Exception:
        pass
    return out
