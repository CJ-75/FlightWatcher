"""Ryanair route helpers — live served destinations per departure airport."""
from __future__ import annotations

import json
import time
import urllib.request
from collections import defaultdict
from typing import Dict, Optional, Set

# Short in-memory cache so planner create/scan don't hit Ryanair every call
_CACHE: Dict[str, tuple[float, Set[str]]] = {}
_CACHE_TTL_SEC = 60 * 60  # 1h


def fetch_served_codes(departure: str) -> Set[str]:
    """IATA codes currently served from departure (official routes widget)."""
    code = (departure or "").strip().upper()
    if len(code) != 3:
        return set()

    now = time.time()
    cached = _CACHE.get(code)
    if cached and now - cached[0] < _CACHE_TTL_SEC:
        return set(cached[1])

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
    except Exception as e:
        print(f"⚠️  Routes Ryanair {code}: {e}")
        if cached:
            return set(cached[1])
        return set()

    _CACHE[code] = (now, codes)
    return set(codes)


def fetch_destinations_by_country(departure: str) -> dict:
    """Grouped destinations for /api/destinations (same source as served codes)."""
    code = (departure or "").strip().upper()
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
            city = ((arr.get("city") or {}).get("name") or arr.get("name") or dest_code).strip()
            country = ((arr.get("country") or {}).get("name") or "Autre").strip()
            name = (arr.get("name") or city).strip()
            dest_full = f"{name}, {country}" if country else name
            by_country[country][dest_code] = {
                "code": dest_code,
                "nom": city,
                "pays": country,
                "destinationFull": dest_full,
            }
        _CACHE[code] = (time.time(), codes)
    except Exception as e:
        print(f"⚠️  Routes widget échoué pour {code}: {e}")
        return {}
    return by_country


def invalid_arrival_codes(departure: str, arrival: Optional[str]) -> list[str]:
    """Return arrival IATA codes that are NOT served from departure. Empty arrival = ok."""
    if not arrival:
        return []
    codes = [
        c.strip().upper()
        for c in str(arrival).replace(";", ",").split(",")
        if c.strip()
    ]
    if not codes:
        return []
    served = fetch_served_codes(departure)
    if not served:
        # If Ryanair unreachable, don't block create/scan
        return []
    return [c for c in codes if c not in served]
