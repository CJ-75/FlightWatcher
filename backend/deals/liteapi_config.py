"""LiteAPI / Deals environment configuration and startup guards."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


class LiteApiConfigError(RuntimeError):
    """Raised when DEALS_PROVIDER=liteapi is misconfigured."""


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _env_float(name: str, default: float) -> float:
    raw = _env(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _parse_list(raw: str) -> List[str]:
    return [p.strip() for p in raw.split(",") if p.strip()]


def _parse_occupancies(raw: str) -> List[int]:
    out: List[int] = []
    for part in _parse_list(raw or "2"):
        try:
            n = int(part)
            if n >= 1 and n not in out:
                out.append(n)
        except ValueError:
            continue
    return out or [2]


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name)
    if not raw:
        return default
    return raw.lower() in ("1", "true", "yes", "on")


def _parse_score_weights(raw: str) -> Dict[str, float]:
    defaults = {
        "prix": 1.0,
        "note": 0.35,
        "dist": 0.25,
        "breakfast": 0.15,
        "refundable": 0.05,
        "late": 0.3,
    }
    if not raw:
        return defaults
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            merged = dict(defaults)
            for k, v in data.items():
                try:
                    merged[str(k)] = float(v)
                except (TypeError, ValueError):
                    continue
            return merged
    except json.JSONDecodeError:
        pass
    return defaults


def _parse_community_score_weights(raw: str) -> Dict[str, float]:
    defaults = {
        "disc": 1.0,
        "fresh": 0.4,
        "pop": 0.2,
        "qual": 0.2,
        "hotel": 0.15,
    }
    if not raw:
        return defaults
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            merged = dict(defaults)
            for k, v in data.items():
                try:
                    merged[str(k)] = float(v)
                except (TypeError, ValueError):
                    continue
            return merged
    except json.JSONDecodeError:
        pass
    return defaults


@dataclass(frozen=True)
class DealsConfig:
    provider: str
    liteapi_env: str  # sandbox | prod
    api_key: str
    payment_public_key: str
    search_base: str
    book_base: str
    timeout_s: float
    max_concurrency: int
    margin_max_pct: float
    currency: str
    guest_nationality: str
    weekends_ahead: int
    calendar_weekends_ahead: int
    window_kinds: Tuple[str, ...]
    occupancies: Tuple[int, ...]
    budget_flight_pp: float
    budget_pack_pp: float
    score_weights: Dict[str, float]
    # Product: show excluded taxes separately (not folded into price_pp)
    excluded_fees_display: str  # "separate" | "included"
    # Product: show flight redirect CTA after hotel confirmation
    flight_cta_timing: str  # "after_hotel" | "before_hotel"
    # L11: hide Deals tab / block in-app hotel booking (prod read-only phase)
    ui_enabled: bool
    booking_enabled: bool
    # v3 community deals
    deals_source: str  # community | legacy_catalog
    max_flight_pp: float
    min_per_origin: int
    nearby_origins_km: float
    fresh_tau_h: float
    fresh_tau_short_h: float
    revalidate_budget_per_hour: int
    seed_catalog_size: int
    seed_scan_budget_per_day: int
    seed_min_budget_share: float
    obs_retention_days: int
    observations_enabled: bool
    community_score_weights: Dict[str, float]
    # v3.1 Lot A (+ early flags for E)
    scheduler_enabled: bool
    baseline_max_age_h: float
    legacy_fallback_enabled: bool
    calendar_enabled: bool
    min_discount: float

    @property
    def is_liteapi(self) -> bool:
        return self.provider == "liteapi"

    @property
    def is_community(self) -> bool:
        return self.deals_source == "community"

    @property
    def is_sandbox(self) -> bool:
        return self.liteapi_env == "sandbox"

    @property
    def is_prod_readonly(self) -> bool:
        return self.is_liteapi and self.liteapi_env == "prod" and self.ui_enabled and not self.booking_enabled


def load_deals_config() -> DealsConfig:
    provider = (_env("DEALS_PROVIDER", "mock") or "mock").lower()
    liteapi_env = (_env("LITEAPI_ENV", "sandbox") or "sandbox").lower()
    if liteapi_env not in ("sandbox", "prod"):
        liteapi_env = "sandbox"

    if liteapi_env == "prod":
        api_key = _env("LITEAPI_API_KEY_PROD")
        payment_public_key = _env("LITEAPI_PAYMENT_PUBLIC_KEY_PROD")
        search_base = _env("LITEAPI_SEARCH_BASE", "https://api.liteapi.travel/v3.0")
        book_base = _env("LITEAPI_BOOK_BASE", "https://book.liteapi.travel/v3.0")
    else:
        api_key = _env("LITEAPI_API_KEY_SANDBOX")
        payment_public_key = _env("LITEAPI_PAYMENT_PUBLIC_KEY_SANDBOX")
        search_base = _env("LITEAPI_SEARCH_BASE", "https://api.liteapi.travel/v3.0")
        book_base = _env("LITEAPI_BOOK_BASE", "https://book.liteapi.travel/v3.0")

    kinds = tuple(_parse_list(_env("DEALS_WINDOW_KINDS", "FRI_SUN")) or ["FRI_SUN"])
    occupancies = tuple(_parse_occupancies(_env("DEALS_OCCUPANCIES", "2")))
    deals_source = (_env("DEALS_SOURCE", "legacy_catalog") or "legacy_catalog").lower()
    if deals_source not in ("community", "legacy_catalog"):
        deals_source = "legacy_catalog"

    return DealsConfig(
        provider=provider,
        liteapi_env=liteapi_env,
        api_key=api_key,
        payment_public_key=payment_public_key,
        search_base=search_base.rstrip("/"),
        book_base=book_base.rstrip("/"),
        timeout_s=_env_float("LITEAPI_TIMEOUT_S", 8.0),
        max_concurrency=_env_int("LITEAPI_MAX_CONCURRENCY", 4),
        margin_max_pct=_env_float("LITEAPI_MARGIN_MAX_PCT", 25.0),
        currency=_env("DEALS_CURRENCY", "EUR") or "EUR",
        guest_nationality=_env("DEALS_GUEST_NATIONALITY", "FR") or "FR",
        weekends_ahead=max(1, _env_int("DEALS_WEEKENDS_AHEAD", 3)),
        calendar_weekends_ahead=max(1, _env_int("DEALS_CALENDAR_WEEKENDS_AHEAD", 8)),
        window_kinds=kinds,
        occupancies=occupancies,
        budget_flight_pp=_env_float("DEALS_BUDGET_FLIGHT_PP", 150.0),
        budget_pack_pp=_env_float("DEALS_BUDGET_PACK_PP", 350.0),
        score_weights=_parse_score_weights(_env("DEALS_SCORE_WEIGHTS")),
        excluded_fees_display=_env("DEALS_EXCLUDED_FEES_DISPLAY", "separate") or "separate",
        flight_cta_timing=_env("DEALS_FLIGHT_CTA_TIMING", "after_hotel") or "after_hotel",
        ui_enabled=_env_bool("DEALS_UI_ENABLED", True),
        booking_enabled=_env_bool("DEALS_BOOKING_ENABLED", True),
        deals_source=deals_source,
        max_flight_pp=_env_float("DEALS_MAX_FLIGHT_PP", 120.0),
        min_per_origin=max(1, _env_int("DEALS_MIN_PER_ORIGIN", 12)),
        nearby_origins_km=_env_float("DEALS_NEARBY_ORIGINS_KM", 100.0),
        fresh_tau_h=_env_float("DEALS_FRESH_TAU_H", 6.0),
        fresh_tau_short_h=_env_float("DEALS_FRESH_TAU_SHORT_H", 3.0),
        revalidate_budget_per_hour=max(1, _env_int("DEALS_REVALIDATE_BUDGET_PER_HOUR", 200)),
        seed_catalog_size=max(5, _env_int("SEED_CATALOG_SIZE", 25)),
        seed_scan_budget_per_day=max(10, _env_int("SEED_SCAN_BUDGET_PER_DAY", 300)),
        seed_min_budget_share=min(1.0, max(0.0, _env_float("SEED_MIN_BUDGET_SHARE", 0.2))),
        obs_retention_days=max(7, _env_int("OBS_RETENTION_DAYS", 90)),
        observations_enabled=_env_bool("DEALS_OBSERVATIONS_ENABLED", True),
        community_score_weights=_parse_community_score_weights(
            _env("DEALS_COMMUNITY_SCORE_WEIGHTS")
        ),
        scheduler_enabled=_env_bool("DEALS_SCHEDULER_ENABLED", False),
        baseline_max_age_h=_env_float("DEALS_BASELINE_MAX_AGE_H", 36.0),
        legacy_fallback_enabled=_env_bool("DEALS_LEGACY_FALLBACK_ENABLED", False),
        calendar_enabled=_env_bool("DEALS_CALENDAR_ENABLED", False),
        min_discount=min(0.9, max(0.0, _env_float("DEALS_MIN_DISCOUNT", 0.15))),
    )


def validate_liteapi_keys(cfg: DealsConfig) -> None:
    """Refuse mismatched sandbox/prod keys when LiteAPI is the active provider."""
    if not cfg.is_liteapi:
        return

    if not cfg.api_key:
        raise LiteApiConfigError(
            f"DEALS_PROVIDER=liteapi requires LITEAPI_API_KEY_{'PROD' if cfg.liteapi_env == 'prod' else 'SANDBOX'}"
        )

    key_lower = cfg.api_key.lower()
    is_sand_key = key_lower.startswith("sand_")
    if cfg.liteapi_env == "prod" and is_sand_key:
        raise LiteApiConfigError(
            "LITEAPI_ENV=prod but API key looks like sandbox (sand_…). Refusing to start."
        )
    if cfg.liteapi_env == "sandbox" and cfg.api_key and not is_sand_key and key_lower.startswith("prod_"):
        raise LiteApiConfigError(
            "LITEAPI_ENV=sandbox but API key looks like prod (prod_…). Refusing to start."
        )

    # Payment public key soft-check: if set, warn via exception on hard mismatch prefixes
    pk = (cfg.payment_public_key or "").lower()
    if pk:
        if cfg.liteapi_env == "prod" and "sand" in pk and "test" in pk:
            raise LiteApiConfigError(
                "LITEAPI_ENV=prod but payment public key appears sandbox/test. Refusing to start."
            )


def assert_deals_config_ok(cfg: Optional[DealsConfig] = None) -> DealsConfig:
    cfg = cfg or load_deals_config()
    validate_liteapi_keys(cfg)
    return cfg


def deals_config_public_dict(cfg: Optional[DealsConfig] = None) -> Dict[str, Any]:
    """Safe subset for /api/config (no secrets)."""
    cfg = cfg or load_deals_config()
    return {
        "deals_provider": cfg.provider,
        "liteapi_env": cfg.liteapi_env if cfg.is_liteapi else None,
        "currency": cfg.currency,
        "window_kinds": list(cfg.window_kinds),
        "occupancies": list(cfg.occupancies),
        "weekends_ahead": cfg.weekends_ahead,
        "calendar_weekends_ahead": cfg.calendar_weekends_ahead,
        "budget_flight_pp": cfg.budget_flight_pp,
        "budget_pack_pp": cfg.budget_pack_pp,
        "excluded_fees_display": cfg.excluded_fees_display,
        "flight_cta_timing": cfg.flight_cta_timing,
        "ui_enabled": cfg.ui_enabled,
        "booking_enabled": cfg.booking_enabled,
        "prod_readonly": cfg.is_prod_readonly,
        "payment_public_key": cfg.payment_public_key if cfg.is_liteapi else None,
        "deals_source": cfg.deals_source,
        "max_flight_pp": cfg.max_flight_pp,
        "min_per_origin": cfg.min_per_origin,
        "seed_catalog_size": cfg.seed_catalog_size,
        "seed_scan_budget_per_day": cfg.seed_scan_budget_per_day,
        "scheduler_enabled": cfg.scheduler_enabled,
        "baseline_max_age_h": cfg.baseline_max_age_h,
        "legacy_fallback_enabled": cfg.legacy_fallback_enabled,
        "calendar_enabled": cfg.calendar_enabled,
    }
