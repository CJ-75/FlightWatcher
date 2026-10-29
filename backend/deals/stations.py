"""
Main train stations (gares) per destination — for hotel proximity labels.

Keys: city slug / city_name (normalized) + IATA arrival codes.
Coords are station building centres (hand-picked).
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional, Sequence

from deals.hotel_pool import haversine_m

# Each entry: name (display FR), lat, lng. Order = preference when distances tie.
_STATIONS: Dict[str, List[Dict[str, Any]]] = {
    "lisbonne": [
        {"name": "Gare de Santa Apolónia", "lat": 38.7139, "lng": -9.1220},
        {"name": "Gare d’Oriente", "lat": 38.7679, "lng": -9.0990},
    ],
    "porto": [
        {"name": "Gare de São Bento", "lat": 41.1456, "lng": -8.6100},
        {"name": "Campanhã", "lat": 41.1489, "lng": -8.5856},
    ],
    "barcelone": [
        {"name": "Barcelona Sants", "lat": 41.3792, "lng": 2.1406},
        {"name": "Barcelona Passeig de Gràcia", "lat": 41.3927, "lng": 2.1648},
    ],
    "rome": [
        {"name": "Roma Termini", "lat": 41.9009, "lng": 12.5018},
        {"name": "Roma Tiburtina", "lat": 41.9109, "lng": 12.5308},
    ],
    "milan": [
        {"name": "Milano Centrale", "lat": 45.4861, "lng": 9.2040},
        {"name": "Milano Cadorna", "lat": 45.4682, "lng": 9.1766},
    ],
    "madrid": [
        {"name": "Madrid Atocha", "lat": 40.4066, "lng": -3.6893},
        {"name": "Madrid Chamartín", "lat": 40.4722, "lng": -3.6823},
    ],
    "dublin": [
        {"name": "Dublin Connolly", "lat": 53.3509, "lng": -6.2490},
        {"name": "Dublin Heuston", "lat": 53.3464, "lng": -6.2943},
    ],
    "budapest": [
        {"name": "Budapest Keleti", "lat": 47.5004, "lng": 19.0839},
        {"name": "Budapest Nyugati", "lat": 47.5105, "lng": 19.0574},
    ],
    "prague": [
        {"name": "Praha hlavní nádraží", "lat": 50.0831, "lng": 14.4350},
    ],
    "cracovie": [
        {"name": "Kraków Główny", "lat": 50.0675, "lng": 19.9475},
    ],
    "londres": [
        {"name": "London St Pancras", "lat": 51.5314, "lng": -0.1261},
        {"name": "London King’s Cross", "lat": 51.5308, "lng": -0.1238},
        {"name": "London Victoria", "lat": 51.4952, "lng": -0.1441},
    ],
    "valence": [
        {"name": "València Joaquín Sorolla", "lat": 39.4626, "lng": -0.3825},
        {"name": "València Nord", "lat": 39.4669, "lng": -0.3774},
    ],
    "seville": [
        {"name": "Sevilla Santa Justa", "lat": 37.3920, "lng": -5.9750},
    ],
    "naples": [
        {"name": "Napoli Centrale", "lat": 40.8522, "lng": 14.2715},
    ],
    "malaga": [
        {"name": "Málaga María Zambrano", "lat": 36.7120, "lng": -4.4320},
    ],
    "stockholm": [
        {"name": "Stockholm Central", "lat": 59.3300, "lng": 18.0570},
    ],
    "vienne": [
        {"name": "Wien Hauptbahnhof", "lat": 48.1850, "lng": 16.3780},
    ],
    "berlin": [
        {"name": "Berlin Hauptbahnhof", "lat": 52.5250, "lng": 13.3694},
    ],
    "amsterdam": [
        {"name": "Amsterdam Centraal", "lat": 52.3791, "lng": 4.9003},
    ],
    "bruxelles": [
        {"name": "Bruxelles-Midi", "lat": 50.8357, "lng": 4.3362},
        {"name": "Bruxelles-Central", "lat": 50.8455, "lng": 4.3571},
    ],
    "lyon": [
        {"name": "Lyon Part-Dieu", "lat": 45.7606, "lng": 4.8595},
        {"name": "Lyon Perrache", "lat": 45.7485, "lng": 4.8258},
    ],
    "nice": [
        {"name": "Nice-Ville", "lat": 43.7046, "lng": 7.2619},
    ],
    "marseille": [
        {"name": "Marseille-Saint-Charles", "lat": 43.3027, "lng": 5.3806},
    ],
    "paris": [
        {"name": "Paris Gare de Lyon", "lat": 48.8443, "lng": 2.3744},
        {"name": "Paris Gare du Nord", "lat": 48.8809, "lng": 2.3553},
        {"name": "Paris Montparnasse", "lat": 48.8411, "lng": 2.3200},
    ],
    "athenes": [
        {"name": "Athènes Larissis", "lat": 37.9919, "lng": 23.7210},
    ],
    "varsovie": [
        {"name": "Warszawa Centralna", "lat": 52.2288, "lng": 21.0032},
    ],
    "copenhague": [
        {"name": "København H", "lat": 55.6728, "lng": 12.5644},
    ],
    "oslo": [
        {"name": "Oslo S", "lat": 59.9111, "lng": 10.7528},
    ],
    "helsinki": [
        {"name": "Helsinki Central", "lat": 60.1719, "lng": 24.9414},
    ],
    "florence": [
        {"name": "Firenze Santa Maria Novella", "lat": 43.7764, "lng": 11.2478},
    ],
    "venise": [
        {"name": "Venezia Santa Lucia", "lat": 45.4410, "lng": 12.3211},
        {"name": "Venezia Mestre", "lat": 45.4825, "lng": 12.2320},
    ],
    "turin": [
        {"name": "Torino Porta Nuova", "lat": 45.0616, "lng": 7.6775},
    ],
    "bologne": [
        {"name": "Bologna Centrale", "lat": 44.5058, "lng": 11.3417},
    ],
    "palma": [
        {"name": "Estació Intermodal", "lat": 39.5765, "lng": 2.6542},
    ],
}

# Extra IATA → city key (low-cost arrivals that share the same gares)
_IATA_ALIAS: Dict[str, str] = {
    "LIS": "lisbonne",
    "OPO": "porto",
    "BCN": "barcelone",
    "CIA": "rome",
    "FCO": "rome",
    "BGY": "milan",
    "MXP": "milan",
    "LIN": "milan",
    "MAD": "madrid",
    "DUB": "dublin",
    "BUD": "budapest",
    "PRG": "prague",
    "KRK": "cracovie",
    "STN": "londres",
    "LTN": "londres",
    "LGW": "londres",
    "LHR": "londres",
    "VLC": "valence",
    "SVQ": "seville",
    "NAP": "naples",
    "AGP": "malaga",
    "ARN": "stockholm",
    "NYO": "stockholm",
    "VIE": "vienne",
    "BER": "berlin",
    "AMS": "amsterdam",
    "BRU": "bruxelles",
    "CRL": "bruxelles",
    "LYS": "lyon",
    "NCE": "nice",
    "MRS": "marseille",
    "CDG": "paris",
    "ORY": "paris",
    "BVA": "paris",
    "ATH": "athenes",
    "WAW": "varsovie",
    "WMI": "varsovie",
    "CPH": "copenhague",
    "OSL": "oslo",
    "HEL": "helsinki",
    "FLR": "florence",
    "VCE": "venise",
    "TSF": "venise",
    "TRN": "turin",
    "BLQ": "bologne",
    "PMI": "palma",
}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _city_key(city: Optional[str]) -> Optional[str]:
    if not city:
        return None
    n = _norm(city)
    if not n:
        return None
    # Direct slug / known keys
    compact = n.replace(" ", "")
    for key in _STATIONS:
        if key == n or key.replace(" ", "") == compact:
            return key
        if _norm(key) == n:
            return key
    # Partial (e.g. "Milan Italie")
    for key in _STATIONS:
        kn = _norm(key)
        if kn in n or n in kn:
            return key
    # FR spellings already in keys; EN aliases
    aliases = {
        "lisbon": "lisbonne",
        "barcelona": "barcelone",
        "seville": "seville",
        "sevilla": "seville",
        "krakow": "cracovie",
        "cracow": "cracovie",
        "london": "londres",
        "vienna": "vienne",
        "brussels": "bruxelles",
        "athens": "athenes",
        "warsaw": "varsovie",
        "copenhagen": "copenhague",
        "venice": "venise",
        "florence": "florence",
        "turin": "turin",
        "bologna": "bologne",
        "valencia": "valence",
        "prague": "prague",
        "roma": "rome",
        "milano": "milan",
    }
    return aliases.get(compact) or aliases.get(n)


def stations_for(
    *,
    city: Optional[str] = None,
    iata: Optional[str] = None,
) -> List[Dict[str, Any]]:
    code = (iata or "").strip().upper()
    if code and code in _IATA_ALIAS:
        return list(_STATIONS.get(_IATA_ALIAS[code]) or [])
    key = _city_key(city)
    if key:
        return list(_STATIONS.get(key) or [])
    return []


def distances_to_stations(
    lat: float,
    lng: float,
    stations: Sequence[Dict[str, Any]],
    *,
    top_n: int = 2,
) -> List[Dict[str, Any]]:
    scored: List[Dict[str, Any]] = []
    for s in stations:
        try:
            slat = float(s["lat"])
            slng = float(s["lng"])
        except (KeyError, TypeError, ValueError):
            continue
        name = str(s.get("name") or "").strip()
        if not name:
            continue
        d = int(round(haversine_m(lat, lng, slat, slng)))
        scored.append({"name": name, "distance_m": d})
    scored.sort(key=lambda x: x["distance_m"])
    return scored[: max(1, top_n)]


def enrich_hotels_with_stations(
    hotels: Sequence[Dict[str, Any]],
    stations: Sequence[Dict[str, Any]],
    *,
    top_n: int = 2,
) -> List[Dict[str, Any]]:
    """Attach stations[] + nearest station_name / station_distance_m on each hotel."""
    if not stations:
        return list(hotels)
    out: List[Dict[str, Any]] = []
    for h in hotels:
        row = dict(h) if isinstance(h, dict) else {}
        try:
            lat = float(
                row.get("lat")
                if row.get("lat") is not None
                else row.get("latitude")
            )
            lng = float(
                row.get("lng")
                if row.get("lng") is not None
                else row.get("longitude")
            )
        except (TypeError, ValueError):
            out.append(row)
            continue
        dists = distances_to_stations(lat, lng, stations, top_n=top_n)
        if dists:
            row["stations"] = dists
            row["station_name"] = dists[0]["name"]
            row["station_distance_m"] = dists[0]["distance_m"]
        out.append(row)
    return out
