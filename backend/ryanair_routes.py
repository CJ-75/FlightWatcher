"""Ryanair route helpers — live served destinations per departure airport."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from collections import defaultdict
from typing import Dict, Optional, Set, Tuple

from city_names_fr import city_for_code, country_for_code

# Short in-memory cache so planner create/scan don't hit Ryanair every call.
# Empty sets are cached too (CDG/ORY return 404 — not Ryanair bases).
_CACHE: Dict[str, Tuple[float, Set[str]]] = {}
_CACHE_TTL_SEC = 60 * 60  # 1h
_NEG_CACHE_TTL_SEC = 6 * 60 * 60  # 6h for known empty / 404 origins
_WIDGET_EMPTY_LOGGED: Set[str] = set()


def _cache_get(code: str) -> Optional[Set[str]]:
    cached = _CACHE.get(code)
    if not cached:
        return None
    ts, codes = cached
    ttl = _NEG_CACHE_TTL_SEC if not codes else _CACHE_TTL_SEC
    if time.time() - ts >= ttl:
        return None
    return set(codes)


def _cache_set(code: str, codes: Set[str]) -> None:
    _CACHE[code] = (time.time(), set(codes))


def fetch_served_codes(departure: str) -> Set[str]:
    """IATA codes currently served from departure (official routes widget)."""
    code = (departure or "").strip().upper()
    if len(code) != 3:
        return set()

    hit = _cache_get(code)
    if hit is not None:
        return hit

    url = (
        "https://www.ryanair.com/api/views/locate/searchWidget/routes/fr/airport/"
        + code
    )
    codes: Set[str] = set()
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "FlightWatcher/1.0", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for item in data if isinstance(data, list) else []:
            arr = item.get("arrivalAirport") or {}
            dest = (arr.get("code") or "").strip().upper()
            if len(dest) == 3:
                codes.add(dest)
    except urllib.error.HTTPError as e:
        # 404 = airport not in Ryanair network (CDG, ORY…) — cache empty, log once
        if code not in _WIDGET_EMPTY_LOGGED:
            print(f"ℹ️  Routes Ryanair {code}: HTTP {e.code} (pas de base Ryanair, cache)")
            _WIDGET_EMPTY_LOGGED.add(code)
        _cache_set(code, set())
        return set()
    except Exception as e:
        if code not in _WIDGET_EMPTY_LOGGED:
            print(f"⚠️  Routes Ryanair {code}: {e}")
            _WIDGET_EMPTY_LOGGED.add(code)
        # Cache empty briefly so list/get don't hammer the widget
        _cache_set(code, set())
        return set()

    _cache_set(code, codes)
    return set(codes)


def fetch_destinations_by_country(departure: str) -> dict:
    """Grouped destinations for /api/destinations (same source as served codes)."""
    code = (departure or "").strip().upper()
    if len(code) != 3:
        return {}

    # Reuse served-codes negative cache: skip widget HTTP for known empty origins
    hit = _cache_get(code)
    if hit is not None and not hit:
        return {}

    url = (
        "https://www.ryanair.com/api/views/locate/searchWidget/routes/fr/airport/"
        + code
    )
    by_country: dict = defaultdict(dict)
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "FlightWatcher/1.0", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        codes: Set[str] = set()
        for item in data if isinstance(data, list) else []:
            arr = item.get("arrivalAirport") or {}
            dest_code = (arr.get("code") or "").strip().upper()
            if len(dest_code) != 3:
                continue
            codes.add(dest_code)
            city = city_for_code(
                dest_code,
                ((arr.get("city") or {}).get("name") or arr.get("name") or dest_code),
            )
            iso = ((arr.get("country") or {}).get("code") or "").strip().upper()
            country = country_for_code(
                dest_code,
                ((arr.get("country") or {}).get("name") or "Autre"),
            )
            if not country and iso:
                country = iso
            dest_full = f"{city}, {country}" if country else city
            by_country[country][dest_code] = {
                "code": dest_code,
                "nom": city,
                "pays": country,
                "destinationFull": dest_full,
            }
        _cache_set(code, codes)
    except urllib.error.HTTPError as e:
        if code not in _WIDGET_EMPTY_LOGGED:
            print(
                f"ℹ️  Routes widget {code}: HTTP {e.code} "
                "(pas de base Ryanair → catalogue commun)"
            )
            _WIDGET_EMPTY_LOGGED.add(code)
        _cache_set(code, set())
        return {}
    except Exception as e:
        if code not in _WIDGET_EMPTY_LOGGED:
            print(f"⚠️  Routes widget échoué pour {code}: {e}")
            _WIDGET_EMPTY_LOGGED.add(code)
        _cache_set(code, set())
        return {}
    return by_country


def invalid_arrival_codes(departure: str, arrival: Optional[str]) -> list[str]:
    """Return arrival IATA codes not served from any departure origin.

    ``departure`` may be a single IATA or comma-separated city airports
    (e.g. ``CDG,ORY,BVA``). Empty arrival = ok.

    Ryanair-only check: if no origin has Ryanair routes (all CDG/ORY…),
    do not block — Travelpayouts may still serve the route.
    """
    if not arrival:
        return []
    codes = [
        c.strip().upper()
        for c in str(arrival).replace(";", ",").split(",")
        if c.strip()
    ]
    if not codes:
        return []
    deps = [
        c.strip().upper()
        for c in str(departure or "").replace(";", ",").split(",")
        if c.strip() and len(c.strip()) == 3 and c.strip().isalpha()
    ]
    if not deps:
        return []

    # Prefer origins that likely have Ryanair data first (BVA before CDG)
    deps_sorted = sorted(
        deps,
        key=lambda c: 0 if _cache_get(c) else 1,
    )

    served: Set[str] = set()
    remaining = set(codes)
    for dep in deps_sorted:
        if not remaining:
            break
        served |= fetch_served_codes(dep)
        remaining -= served

    if not served:
        # No Ryanair coverage from any origin — don't block multi-provider trips
        return []
    return [c for c in codes if c not in served]
