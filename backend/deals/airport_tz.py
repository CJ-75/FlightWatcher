"""IATA → IANA timezone (best-effort for deal flight attachment)."""
from __future__ import annotations

from typing import Dict

# Common FR origins + deal destinations. Fallback: Europe/Paris.
AIRPORT_TZ: Dict[str, str] = {
    # France
    "BVA": "Europe/Paris",
    "ORY": "Europe/Paris",
    "CDG": "Europe/Paris",
    "MRS": "Europe/Paris",
    "NCE": "Europe/Paris",
    "LYS": "Europe/Paris",
    "TLS": "Europe/Paris",
    "BOD": "Europe/Paris",
    "NTE": "Europe/Paris",
    "LIL": "Europe/Paris",
    "SXB": "Europe/Paris",
    "MPL": "Europe/Paris",
    "BIQ": "Europe/Paris",
    "BES": "Europe/Paris",
    "RNS": "Europe/Paris",
    "PGF": "Europe/Paris",
    "FNI": "Europe/Paris",
    "CFE": "Europe/Paris",
    "EGC": "Europe/Paris",
    # Deal destinations
    "LIS": "Europe/Lisbon",
    "OPO": "Europe/Lisbon",
    "BCN": "Europe/Madrid",
    "MAD": "Europe/Madrid",
    "CIA": "Europe/Rome",
    "FCO": "Europe/Rome",
    "BGY": "Europe/Rome",
    "MXP": "Europe/Rome",
    "DUB": "Europe/Dublin",
    "BUD": "Europe/Budapest",
    "PRG": "Europe/Prague",
    "KRK": "Europe/Warsaw",
    "WAW": "Europe/Warsaw",
    # Catalogue mondial (eu_gap / maghreb / gulf / longhaul)
    "AMS": "Europe/Amsterdam",
    "ATH": "Europe/Athens",
    "HER": "Europe/Athens",
    "BER": "Europe/Berlin",
    "VIE": "Europe/Vienna",
    "VCE": "Europe/Rome",
    "IBZ": "Europe/Madrid",
    "GLA": "Europe/London",
    "OSL": "Europe/Oslo",
    "HEL": "Europe/Helsinki",
    "FNC": "Atlantic/Madeira",
    "AGA": "Africa/Casablanca",
    "CMN": "Africa/Casablanca",
    "ALG": "Africa/Algiers",
    "CAI": "Africa/Cairo",
    "DXB": "Asia/Dubai",
    "AUH": "Asia/Dubai",
    "RAI": "Atlantic/Cape_Verde",
    "BKK": "Asia/Bangkok",
    "JFK": "America/New_York",
    "EWR": "America/New_York",
    "LGA": "America/New_York",
    "YUL": "America/Toronto",
    "NRT": "Asia/Tokyo",
    "HND": "Asia/Tokyo",
}


def tz_for_iata(iata: str, fallback: str = "Europe/Paris") -> str:
    code = (iata or "").strip().upper()
    return AIRPORT_TZ.get(code, fallback)
