"""Restaurants / link-import feature flags."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Optional


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


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name) or default)
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class RestaurantsConfig:
    link_import_enabled: bool
    link_import_max_links: int
    resolve_allowed_hosts: List[str]
    resolve_max_redirects: int
    place_match_radius_m: float
    place_match_min_similarity: float
    place_public_min_distinct_users: int
    geoapify_api_key: str
    google_places_api_key: str
    google_place_id_lookup_enabled: bool
    llm_enrich_enabled: bool
    local_dishes_enabled: bool


def load_restaurants_config() -> RestaurantsConfig:
    hosts = [
        h.strip().lower()
        for h in _env(
            "LINK_RESOLVE_ALLOWED_HOSTS",
            "maps.app.goo.gl,goo.gl,www.google.com,www.google.fr,maps.google.com",
        ).split(",")
        if h.strip()
    ]
    return RestaurantsConfig(
        link_import_enabled=_env_bool("LINK_IMPORT_ENABLED", False),
        link_import_max_links=max(1, _env_int("LINK_IMPORT_MAX_LINKS", 20)),
        resolve_allowed_hosts=hosts,
        resolve_max_redirects=max(1, min(5, _env_int("LINK_RESOLVE_MAX_REDIRECTS", 3))),
        place_match_radius_m=_env_float("PLACE_MATCH_RADIUS_M", 150),
        place_match_min_similarity=_env_float("PLACE_MATCH_MIN_SIMILARITY", 0.45),
        place_public_min_distinct_users=max(
            1, _env_int("PLACE_PUBLIC_MIN_DISTINCT_USERS", 3)
        ),
        geoapify_api_key=_env("GEOAPIFY_API_KEY"),
        google_places_api_key=_env("GOOGLE_PLACES_API_KEY"),
        google_place_id_lookup_enabled=_env_bool(
            "GOOGLE_PLACE_ID_LOOKUP_ENABLED", True
        ),
        llm_enrich_enabled=_env_bool("LLM_ENRICH_ENABLED", False),
        local_dishes_enabled=_env_bool("RESTAURANTS_LOCAL_DISHES_ENABLED", True),
    )


def restaurants_config_public_dict(cfg: Optional[RestaurantsConfig] = None) -> dict:
    cfg = cfg or load_restaurants_config()
    from activities.config import load_activities_config

    act = load_activities_config()
    return {
        "planner_restaurants_enabled": act.planner_restaurants_enabled,
        "link_import_enabled": cfg.link_import_enabled,
        "link_import_max_links": cfg.link_import_max_links,
        "restaurants_local_dishes_enabled": cfg.local_dishes_enabled,
    }
