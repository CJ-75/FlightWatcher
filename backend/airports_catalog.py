"""Merged airport catalog: Ryanair active + common Travelpayouts airports."""
from __future__ import annotations

import gzip
import json
import os
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Set, Tuple

from city_names_fr import (
    CITY_FR_BY_IATA,
    COUNTRY_FR_BY_ISO,
    city_for_code,
    localize_airport_dict,
)

# Europe + nearby leisure markets relevant to FR travelers
FOCUS_COUNTRIES: Set[str] = {
    "FR", "BE", "LU", "NL", "DE", "CH", "AT", "IT", "ES", "PT", "GB", "IE",
    "GR", "HR", "SI", "SK", "CZ", "PL", "HU", "RO", "BG", "DK", "SE", "NO",
    "FI", "EE", "LV", "LT", "MT", "CY", "IS", "AL", "BA", "ME", "RS", "MK",
    "XK", "TR", "MA", "TN", "DZ", "EG", "JO", "IL", "GE", "UA", "MD",
}

# Always include these hubs even if dump misses flightable flag
PRIORITY_IATA: Set[str] = {
    # France
    "CDG", "ORY", "BVA", "LYS", "MRS", "NCE", "TLS", "NTE", "BOD", "LIL",
    "SXB", "MPL", "PGF", "BIQ", "BIA", "AJA", "FSC", "CLY", "EGC", "BZR",
    "CCF", "RDZ", "CFE", "GNB", "CMF", "ETZ", "MLH", "BES", "RNS", "PUF",
    "LRH", "TLN", "FNI", "LDE", "PIS", "TUF", "XCR",
    # Neighbors / hubs
    "BRU", "CRL", "AMS", "EIN", "RTM", "LUX",
    "FRA", "MUC", "BER", "HAM", "CGN", "DUS", "STR", "HHN", "FMM", "NRN",
    "ZRH", "GVA", "BSL",
    "VIE", "SZG", "INN",
    "FCO", "CIA", "MXP", "LIN", "BGY", "VCE", "TSF", "NAP", "BLQ", "PSA",
    "FLR", "TRN", "GOA", "PMO", "CTA", "CAG", "BRI", "BDS",
    "MAD", "BCN", "AGP", "ALC", "VLC", "SVQ", "PMI", "IBZ", "ACE", "FUE",
    "TFS", "TFN", "LPA", "BIO", "SCQ", "GRO", "REU",
    "LIS", "OPO", "FAO",
    "LHR", "LGW", "STN", "LTN", "SEN", "MAN", "EDI", "GLA", "BHX", "BRS",
    "DUB", "ORK", "SNN", "BFS",
    "ATH", "SKG", "HER", "CHQ", "RHO", "CFU", "JTR", "JMK",
    "PRG", "BUD", "WAW", "KRK", "GDN", "WRO", "OTP", "SOF", "BEG", "ZAG",
    "SPU", "DBV", "LJU", "BTS", "TIA",
    "CPH", "ARN", "GOT", "OSL", "HEL", "KEF",
    "IST", "SAW", "AYT", "ADB", "BJV",
    "RAK", "CMN", "TNG", "AGA", "FEZ", "RBA",
    "TUN", "DJE", "MIR", "CAI", "HRG", "SSH",
    "AMM", "TLV", "LCA", "PFO", "MLA",
}

_CACHE: Dict[str, Any] = {"at": 0.0, "airports": None, "cities": None}
_CACHE_TTL = 24 * 60 * 60


def _token() -> str:
    return (os.getenv("TRAVELPAYOUTS_API_TOKEN") or "").strip()


def _http_json(url: str) -> Any:
    token = _token()
    headers = {
        "User-Agent": "FlightWatcher/1.0",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
    }
    if token:
        headers["X-Access-Token"] = token
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}token={urllib.parse.quote(token)}"
    req = urllib.request.Request(url, headers=headers)
    # Keep short — never block /api/airports cold path for a full dump download
    with urllib.request.urlopen(req, timeout=5) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
            try:
                raw = gzip.decompress(raw)
            except Exception:
                pass
        return json.loads(raw.decode("utf-8"))


def _load_tp_dumps() -> Tuple[List[dict], Dict[str, dict]]:
    now = time.time()
    if (
        _CACHE["airports"] is not None
        and _CACHE["cities"] is not None
        and now - float(_CACHE["at"] or 0) < _CACHE_TTL
    ):
        return _CACHE["airports"], _CACHE["cities"]

    airports: List[dict] = []
    cities: Dict[str, dict] = {}
    try:
        # Prefer FR locale files when available
        for loc in ("fr", "en"):
            try:
                airports = _http_json(
                    f"https://api.travelpayouts.com/data/{loc}/airports.json"
                )
                if isinstance(airports, list) and airports:
                    break
            except Exception:
                continue
        cities_raw: List[dict] = []
        for loc in ("fr", "en"):
            try:
                cities_raw = _http_json(
                    f"https://api.travelpayouts.com/data/{loc}/cities.json"
                )
                if isinstance(cities_raw, list) and cities_raw:
                    break
            except Exception:
                continue
        if isinstance(cities_raw, list):
            for c in cities_raw:
                code = (c.get("code") or "").strip().upper()
                if len(code) == 3:
                    cities[code] = c
        if not isinstance(airports, list):
            airports = []
        _CACHE["airports"] = airports
        _CACHE["cities"] = cities
        _CACHE["at"] = now
        print(f"  OK Travelpayouts dump: {len(airports)} airports, {len(cities)} cities")
    except Exception as e:
        print(f"Travelpayouts airports dump: {e}")
        if _CACHE["airports"] is None:
            _CACHE["airports"] = []
        if _CACHE["cities"] is None:
            _CACHE["cities"] = {}
    return _CACHE["airports"] or [], _CACHE["cities"] or {}


def _city_label(city_code: str, cities: Dict[str, dict], fallback: str) -> str:
    if city_code in CITY_FR_BY_IATA:
        return CITY_FR_BY_IATA[city_code]
    c = cities.get(city_code) or {}
    tr = c.get("name_translations") or {}
    fr = (tr.get("fr") or "").strip()
    if fr:
        return fr
    name = (c.get("name") or "").strip()
    if name:
        return city_for_code(city_code, name) or name
    return city_for_code(city_code, fallback) or fallback or city_code


def _airport_name_fr(item: dict, city: str) -> str:
    tr = item.get("name_translations") or {}
    fr = (tr.get("fr") or "").strip()
    if fr:
        return fr
    name = (item.get("name") or "").strip()
    return name or city


def common_airports_from_travelpayouts(
    country_names: Optional[Dict[str, str]] = None,
) -> List[dict]:
    """Flightable airports in focus countries + priority hubs."""
    country_names = country_names or dict(COUNTRY_FR_BY_ISO)
    raw_airports, cities = _load_tp_dumps()
    if not raw_airports:
        return []

    out: List[dict] = []
    seen: Set[str] = set()
    for item in raw_airports:
        code = (item.get("code") or "").strip().upper()
        if len(code) != 3 or code in seen:
            continue
        iata_type = (item.get("iata_type") or "airport").strip().lower()
        if iata_type and iata_type not in ("airport",):
            continue
        flightable = item.get("flightable")
        iso = (item.get("country_code") or "").strip().upper()
        is_priority = code in PRIORITY_IATA
        if not is_priority:
            if flightable is False:
                continue
            if iso and iso not in FOCUS_COUNTRIES:
                continue
        city_code = (item.get("city_code") or code).strip().upper()
        city = _city_label(city_code, cities, item.get("name") or code)
        # Prefer metro city name for known hubs
        if code in CITY_FR_BY_IATA:
            city = CITY_FR_BY_IATA[code]
        name = _airport_name_fr(item, city)
        country = country_names.get(iso, iso or "")
        out.append(
            localize_airport_dict(
                {
                    "code": code,
                    "name": name,
                    "city": city,
                    "country": country,
                }
            )
        )
        seen.add(code)

    # Ensure every priority code exists (minimal stub if dump missed it)
    for code in PRIORITY_IATA:
        if code in seen:
            continue
        city = CITY_FR_BY_IATA.get(code) or code
        out.append(
            localize_airport_dict(
                {
                    "code": code,
                    "name": city,
                    "city": city,
                    "country": "",
                }
            )
        )
        seen.add(code)

    print(f"  OK Catalogue commun: {len(out)} aeroport(s)")
    return out


def merge_airport_lists(*lists: List[dict]) -> List[dict]:
    """Dedupe by IATA; prefer first occurrence (Ryanair labels first if passed first)."""
    by_code: Dict[str, dict] = {}
    for lst in lists:
        for a in lst or []:
            code = (a.get("code") or "").strip().upper()
            if len(code) != 3:
                continue
            if code not in by_code:
                by_code[code] = {**a, "code": code}
            else:
                # Fill missing city/country from later sources
                cur = by_code[code]
                for key in ("city", "country", "name"):
                    if not (cur.get(key) or "").strip() and (a.get(key) or "").strip():
                        cur[key] = a[key]
    merged = list(by_code.values())

    def sort_key(a: dict):
        country = (a.get("country") or "").lower()
        city = (a.get("city") or "").lower()
        code = a.get("code") or ""
        # France first, then alpha city
        fr_rank = 0 if country.startswith("fran") else 1
        return (fr_rank, city, code)

    merged.sort(key=sort_key)
    return merged
