"""Activities feature flags + Viator env (Lot A/B)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Optional, Tuple


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _env_bool(name: str, default: bool = False) -> bool:
    raw = _env(name)
    if not raw:
        return default
    return raw.lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name) or default)
    except (TypeError, ValueError):
        return default


def _parse_radius_steps(raw: str) -> List[int]:
    out: List[int] = []
    for part in (raw or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(int(part))
        except ValueError:
            continue
    return out or [10, 25, 50, 100, 150]


def _parse_quality_steps(raw: str) -> List[Tuple[float, int]]:
    """e.g. 4.5:50,4.3:20,4.0:10 → [(4.5, 50), ...]"""
    out: List[Tuple[float, int]] = []
    for part in (raw or "").split(","):
        part = part.strip()
        if ":" not in part:
            continue
        a, b = part.split(":", 1)
        try:
            out.append((float(a), int(b)))
        except ValueError:
            continue
    return out or [(4.5, 50), (4.3, 20), (4.0, 10)]


@dataclass(frozen=True)
class ActivitiesConfig:
    viator_api_key: str
    viator_env: str  # sandbox | prod
    cache_ttl_h: int
    max_retries: int
    ui_enabled: bool
    snapshot_refresh: str  # weekly | once
    min_results: int
    max_results: int
    radius_steps_km: List[int]
    max_queries_per_geo: int
    geo_cache_cell_km: float
    quality_steps: List[Tuple[float, int]]
    planner_activities_enabled: bool
    planner_restaurants_enabled: bool
    itineraries_enabled: bool

    @property
    def viator_base_url(self) -> str:
        if self.viator_env.lower() == "prod":
            return "https://api.viator.com/partner"
        return "https://api.sandbox.viator.com/partner"


def load_activities_config() -> ActivitiesConfig:
    return ActivitiesConfig(
        viator_api_key=_env("VIATOR_API_KEY"),
        viator_env=_env("VIATOR_ENV", "sandbox") or "sandbox",
        cache_ttl_h=max(1, _env_int("VIATOR_CACHE_TTL_H", 24)),
        max_retries=max(0, _env_int("VIATOR_MAX_RETRIES", 4)),
        ui_enabled=_env_bool("ACTIVITIES_ENABLED", False),
        snapshot_refresh=(_env("ACTIVITIES_SNAPSHOT_REFRESH", "weekly") or "weekly").lower(),
        min_results=max(3, _env_int("ACTIVITIES_MIN_RESULTS", 21)),
        max_results=max(3, _env_int("ACTIVITIES_MAX_RESULTS", 30)),
        radius_steps_km=_parse_radius_steps(
            _env("ACTIVITIES_RADIUS_STEPS_KM", "10,25,50,100,150")
        ),
        max_queries_per_geo=max(1, _env_int("ACTIVITIES_MAX_QUERIES_PER_GEO", 6)),
        geo_cache_cell_km=float(_env("ACTIVITIES_GEO_CACHE_CELL_KM", "5") or 5),
        quality_steps=_parse_quality_steps(
            _env("ACTIVITIES_QUALITY_STEPS", "4.5:50,4.3:20,4.0:10")
        ),
        planner_activities_enabled=_env_bool("PLANNER_ACTIVITIES_ENABLED", False),
        planner_restaurants_enabled=_env_bool("PLANNER_RESTAURANTS_ENABLED", False),
        itineraries_enabled=_env_bool("ITINERARIES_ENABLED", False),
    )


def activities_config_public_dict(cfg: Optional[ActivitiesConfig] = None) -> dict:
    cfg = cfg or load_activities_config()
    return {
        "activities_ui_enabled": cfg.ui_enabled,
        "planner_activities_enabled": cfg.planner_activities_enabled,
        "planner_restaurants_enabled": cfg.planner_restaurants_enabled,
        "itineraries_enabled": cfg.itineraries_enabled,
        "activities_min_results": cfg.min_results,
        "activities_max_results": cfg.max_results,
        "viator_env": cfg.viator_env if cfg.viator_api_key else None,
    }
