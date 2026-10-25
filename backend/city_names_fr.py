"""French city / country labels for airport IATA codes (Ryanair FR + overrides)."""
from __future__ import annotations

import json
import time
import urllib.request
from typing import Dict, Optional, Tuple

# When Ryanair /fr still leaves an English (or local) city name
CITY_FR_BY_IATA: Dict[str, str] = {
    "VIE": "Vienne",
    "CPH": "Copenhague",
    "BGY": "Bergame",
    "CGN": "Cologne",
    "HER": "Héraklion",
    "CHQ": "La Canée",
    "FEZ": "Fès",
    "AGP": "Malaga",
    "GDN": "Gdansk",
    "WRO": "Wroclaw",
    "POZ": "Poznan",
    "KTW": "Katowice",
    "LCJ": "Lodz",
    "HAM": "Hambourg",
    "HAJ": "Hanovre",
    "DRS": "Dresde",
    "NUE": "Nuremberg",
    "FRA": "Francfort",
    "DUS": "Düsseldorf",
    "SCN": "Sarrebruck",
    "JTR": "Santorin",
    "ZTH": "Zante",
    "EFL": "Céphalonie",
    "MAH": "Minorque",
    "PMI": "Palma",
    "LPA": "Grande Canarie",
    "TFS": "Tenerife",
    "TFN": "Tenerife",
    "ACE": "Lanzarote",
    "FUE": "Fuerteventura",
    "IBZ": "Ibiza",
    "VCE": "Venise",
    "TSF": "Venise",
    "FCO": "Rome",
    "CIA": "Rome",
    "MXP": "Milan",
    "LIN": "Milan",
    "STN": "Londres",
    "LTN": "Londres",
    "LGW": "Londres",
    "LHR": "Londres",
    "SEN": "Londres",
    "CRL": "Charleroi",
    "BRU": "Bruxelles",
    "BSL": "Bâle",
    "MLH": "Mulhouse",
    "GVA": "Genève",
    "ZRH": "Zurich",
    "EDI": "Édimbourg",
    "GLA": "Glasgow",
    "MAN": "Manchester",
    "BHX": "Birmingham",
    "BRS": "Bristol",
    "LPL": "Liverpool",
    "NCL": "Newcastle",
    "LBA": "Leeds",
    "BFS": "Belfast",
    "DUB": "Dublin",
    "ORK": "Cork",
    "SNN": "Shannon",
    "LIS": "Lisbonne",
    "OPO": "Porto",
    "FAO": "Faro",
    "BCN": "Barcelone",
    "MAD": "Madrid",
    "SVQ": "Séville",
    "VLC": "Valence",
    "ALC": "Alicante",
    "AGP": "Malaga",
    "BIO": "Bilbao",
    "SCQ": "Saint-Jacques-de-Compostelle",
    "OVD": "Asturies",
    "SDR": "Santander",
    "ZAZ": "Saragosse",
    "GRO": "Gérone",
    "REU": "Reus",
    "GRX": "Grenade",
    "LEI": "Almería",
    "XRY": "Jerez",
    "NAP": "Naples",
    "BRI": "Bari",
    "BDS": "Brindisi",
    "PMO": "Palerme",
    "CTA": "Catane",
    "CAG": "Cagliari",
    "AHO": "Alghero",
    "PSA": "Pise",
    "FLR": "Florence",
    "BLQ": "Bologne",
    "TRN": "Turin",
    "GOA": "Gênes",
    "TRS": "Trieste",
    "AOI": "Ancône",
    "PSR": "Pescara",
    "SUF": "Lamezia",
    "ATH": "Athènes",
    "SKG": "Thessalonique",
    "RHO": "Rhodes",
    "KGS": "Kos",
    "JMK": "Mykonos",
    "CFU": "Corfou",
    "PVK": "Préveza",
    "KLX": "Kalamata",
    "KVA": "Kavala",
    "PRG": "Prague",
    "BRQ": "Brno",
    "WAW": "Varsovie",
    "KRK": "Cracovie",
    "BUD": "Budapest",
    "OTP": "Bucarest",
    "BBU": "Bucarest",
    "CLJ": "Cluj-Napoca",
    "TSR": "Timisoara",
    "IAS": "Iasi",
    "SBZ": "Sibiu",
    "SOF": "Sofia",
    "VAR": "Varna",
    "BOJ": "Burgas",
    "ZAG": "Zagreb",
    "SPU": "Split",
    "DBV": "Dubrovnik",
    "ZAD": "Zadar",
    "PUY": "Pula",
    "LJU": "Ljubljana",
    "BTS": "Bratislava",
    "SZG": "Salzbourg",
    "INN": "Innsbruck",
    "GRZ": "Graz",
    "LNZ": "Linz",
    "BER": "Berlin",
    "MUC": "Munich",
    "STR": "Stuttgart",
    "LEJ": "Leipzig",
    "BRE": "Brême",
    "FMM": "Memmingen",
    "NRN": "Weeze",
    "DTM": "Dortmund",
    "HHN": "Hahn",
    "ARN": "Stockholm",
    "NYO": "Stockholm",
    "GOT": "Göteborg",
    "MMX": "Malmö",
    "OSL": "Oslo",
    "BGO": "Bergen",
    "SVG": "Stavanger",
    "TOS": "Tromsø",
    "HEL": "Helsinki",
    "TMP": "Tampere",
    "TKU": "Turku",
    "OUL": "Oulu",
    "RVN": "Rovaniemi",
    "KEF": "Reykjavik",
    "RKV": "Reykjavik",
    "MLA": "Malte",
    "LCA": "Larnaca",
    "PFO": "Paphos",
    "ECN": "Ercan",
    "AMM": "Amman",
    "AQJ": "Aqaba",
    "RAK": "Marrakech",
    "CMN": "Casablanca",
    "TNG": "Tanger",
    "RBA": "Rabat",
    "NDR": "Nador",
    "HRG": "Hurghada",
    "TUN": "Tunis",
    "DJE": "Djerba",
    "PDL": "Ponta Delgada",
    "OUD": "Oujda",
    "AGA": "Agadir",
    "ESU": "Essaouira",
    "TIA": "Tirana",
    "BEG": "Belgrade",
    "INI": "Nis",
    "PRN": "Pristina",
    "TGD": "Podgorica",
    "TIV": "Tivat",
    "SKP": "Skopje",
    "OHD": "Ohrid",
    "SJJ": "Sarajevo",
    "BNX": "Banja Luka",
    "AMS": "Amsterdam",
    "EIN": "Eindhoven",
    "RTM": "Rotterdam",
    "LUX": "Luxembourg",
    "NCE": "Nice",
    "MRS": "Marseille",
    "TLS": "Toulouse",
    "NTE": "Nantes",
    "LYS": "Lyon",
    "LIL": "Lille",
    "SXB": "Strasbourg",
    "MPL": "Montpellier",
    "PGF": "Perpignan",
    "BIA": "Bastia",
    "AJA": "Ajaccio",
    "FSC": "Figari",
    "CLY": "Calvi",
    "EGC": "Bergerac",
    "BVE": "Brive",
    "BZR": "Béziers",
    "CCF": "Carcassonne",
    "RDZ": "Rodez",
    "PIS": "Poitiers",
    "LRH": "La Rochelle",
    "TUF": "Tours",
    "CMF": "Chambéry",
    "GNB": "Grenoble",
    "CFE": "Clermont-Ferrand",
    "DLE": "Dole",
    "ETZ": "Metz",
    "BIQ": "Biarritz",
    "BOD": "Bordeaux",
    "CDG": "Paris",
    "ORY": "Paris",
    "BVA": "Paris",
    "XCR": "Paris",
}

COUNTRY_FR_BY_ISO: Dict[str, str] = {
    "FR": "France",
    "GB": "Royaume-Uni",
    "ES": "Espagne",
    "IT": "Italie",
    "DE": "Allemagne",
    "PT": "Portugal",
    "GR": "Grèce",
    "IE": "Irlande",
    "BE": "Belgique",
    "NL": "Pays-Bas",
    "CH": "Suisse",
    "AT": "Autriche",
    "PL": "Pologne",
    "CZ": "République tchèque",
    "HU": "Hongrie",
    "RO": "Roumanie",
    "BG": "Bulgarie",
    "HR": "Croatie",
    "SI": "Slovénie",
    "SK": "Slovaquie",
    "DK": "Danemark",
    "SE": "Suède",
    "NO": "Norvège",
    "FI": "Finlande",
    "AL": "Albanie",
    "BA": "Bosnie-Herzégovine",
    "CY": "Chypre",
    "EE": "Estonie",
    "LT": "Lituanie",
    "LU": "Luxembourg",
    "LV": "Lettonie",
    "ME": "Monténégro",
    "MT": "Malte",
    "RS": "Serbie",
    "TR": "Turquie",
    "MA": "Maroc",
    "JO": "Jordanie",
    "IS": "Islande",
    "MK": "Macédoine du Nord",
    "XK": "Kosovo",
    "UA": "Ukraine",
    "MD": "Moldavie",
    "GE": "Géorgie",
    "IL": "Israël",
    "EG": "Égypte",
    "TN": "Tunisie",
    "DZ": "Algérie",
}

# Fallback when we only have an English label (no IATA)
CITY_EN_TO_FR: Dict[str, str] = {
    "athens": "Athènes",
    "lisbon": "Lisbonne",
    "london": "Londres",
    "vienna": "Vienne",
    "copenhagen": "Copenhague",
    "prague": "Prague",
    "warsaw": "Varsovie",
    "krakow": "Cracovie",
    "cracow": "Cracovie",
    "seville": "Séville",
    "sevilla": "Séville",
    "valencia": "Valence",
    "naples": "Naples",
    "venice": "Venise",
    "florence": "Florence",
    "milan": "Milan",
    "rome": "Rome",
    "munich": "Munich",
    "cologne": "Cologne",
    "hamburg": "Hambourg",
    "brussels": "Bruxelles",
    "geneva": "Genève",
    "zurich": "Zurich",
    "basel": "Bâle",
    "edinburgh": "Édimbourg",
    "barcelona": "Barcelone",
    "malaga": "Malaga",
    "palermo": "Palerme",
    "catania": "Catane",
    "genoa": "Gênes",
    "turin": "Turin",
    "bologna": "Bologne",
    "pisa": "Pise",
    "bergamo": "Bergame",
    "bucharest": "Bucarest",
    "thessaloniki": "Thessalonique",
    "heraklion": "Héraklion",
    "chania": "La Canée",
    "corfu": "Corfou",
    "kefalonia": "Céphalonie",
    "zakynthos": "Zante",
    "santorini": "Santorin",
    "malta": "Malte",
    "tangier": "Tanger",
    "fez": "Fès",
    "gothenburg": "Göteborg",
    "ancona": "Ancône",
    "bremen": "Brême",
    "dusseldorf": "Düsseldorf",
    "duesseldorf": "Düsseldorf",
    "frankfurt": "Francfort",
    "hanover": "Hanovre",
    "hannover": "Hanovre",
    "dresden": "Dresde",
    "saarbrucken": "Sarrebruck",
    "saarbrücken": "Sarrebruck",
    "menorca": "Minorque",
    "mahon": "Minorque",
    "gran canaria": "Grande Canarie",
    "las palmas": "Grande Canarie",
    "treviso": "Venise",
    "charleroi": "Charleroi",
    "stansted": "Londres",
    "luton": "Londres",
    "gatwick": "Londres",
    "heathrow": "Londres",
    "reykjavik": "Reykjavik",
    "keflavik": "Reykjavik",
    "cracovie": "Cracovie",
    "athenes": "Athènes",
    "athènes": "Athènes",
    "lisbonne": "Lisbonne",
    "londres": "Londres",
    "vienne": "Vienne",
    "copenhague": "Copenhague",
    "varsovie": "Varsovie",
    "barcelone": "Barcelone",
    "séville": "Séville",
    "valence": "Valence",
    "venise": "Venise",
    "palerme": "Palerme",
    "catane": "Catane",
    "gênes": "Gênes",
    "bologne": "Bologne",
    "pise": "Pise",
    "bergame": "Bergame",
    "bucarest": "Bucarest",
    "thessalonique": "Thessalonique",
    "héraklion": "Héraklion",
    "corfou": "Corfou",
    "céphalonie": "Céphalonie",
    "santorin": "Santorin",
    "malte": "Malte",
    "tanger": "Tanger",
    "fès": "Fès",
    "göteborg": "Göteborg",
    "ancône": "Ancône",
    "brême": "Brême",
    "hambourg": "Hambourg",
    "francfort": "Francfort",
    "hanovre": "Hanovre",
    "dresde": "Dresde",
    "sarrebruck": "Sarrebruck",
    "minorque": "Minorque",
    "grande canarie": "Grande Canarie",
    "édimbourg": "Édimbourg",
    "geneve": "Genève",
    "genève": "Genève",
    "bale": "Bâle",
    "bâle": "Bâle",
}

COUNTRY_EN_TO_FR: Dict[str, str] = {
    "france": "France",
    "united kingdom": "Royaume-Uni",
    "uk": "Royaume-Uni",
    "spain": "Espagne",
    "italy": "Italie",
    "germany": "Allemagne",
    "portugal": "Portugal",
    "greece": "Grèce",
    "ireland": "Irlande",
    "belgium": "Belgique",
    "netherlands": "Pays-Bas",
    "switzerland": "Suisse",
    "austria": "Autriche",
    "poland": "Pologne",
    "czech republic": "République tchèque",
    "czechia": "République tchèque",
    "hungary": "Hongrie",
    "romania": "Roumanie",
    "bulgaria": "Bulgarie",
    "croatia": "Croatie",
    "slovenia": "Slovénie",
    "slovakia": "Slovaquie",
    "denmark": "Danemark",
    "sweden": "Suède",
    "norway": "Norvège",
    "finland": "Finlande",
    "albania": "Albanie",
    "bosnia and herzegovina": "Bosnie-Herzégovine",
    "cyprus": "Chypre",
    "estonia": "Estonie",
    "lithuania": "Lituanie",
    "luxembourg": "Luxembourg",
    "latvia": "Lettonie",
    "montenegro": "Monténégro",
    "malta": "Malte",
    "serbia": "Serbie",
    "turkey": "Turquie",
    "morocco": "Maroc",
    "jordan": "Jordanie",
    "iceland": "Islande",
    "north macedonia": "Macédoine du Nord",
    "kosovo": "Kosovo",
    "ukraine": "Ukraine",
    "moldova": "Moldavie",
    "georgia": "Géorgie",
    "israel": "Israël",
    "egypt": "Égypte",
    "tunisia": "Tunisie",
    "algeria": "Algérie",
}

_CACHE: Dict[str, Tuple[str, str, str]] = {}  # code -> (city, country, name)
_CACHE_AT = 0.0
_CACHE_TTL = 60 * 60 * 6  # 6h


def _load_ryanair_fr() -> None:
    global _CACHE, _CACHE_AT
    now = time.time()
    if _CACHE and now - _CACHE_AT < _CACHE_TTL:
        return
    url = "https://www.ryanair.com/api/views/locate/5/airports/fr/active"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "FlightWatcher/1.0", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        next_cache: Dict[str, Tuple[str, str, str]] = {}
        for item in data if isinstance(data, list) else []:
            code = (item.get("code") or "").strip().upper()
            if len(code) != 3:
                continue
            name = (item.get("name") or code).strip()
            city = ((item.get("city") or {}).get("name") or name).strip()
            iso = ((item.get("country") or {}).get("code") or "").strip().upper()
            country = COUNTRY_FR_BY_ISO.get(iso) or (
                (item.get("country") or {}).get("name") or iso or ""
            ).strip()
            next_cache[code] = (city, country, name)
        if next_cache:
            _CACHE = next_cache
            _CACHE_AT = now
    except Exception as e:
        print(f"⚠️ city_names_fr cache: {e}")


def _normalize_key(s: str) -> str:
    return (
        s.strip()
        .lower()
        .replace("’", "'")
        .replace("–", "-")
        .replace("—", "-")
    )


def translate_city_label(label: Optional[str]) -> str:
    """Translate a free-form city/airport label to French when possible."""
    if not label:
        return ""
    raw = label.strip()
    key = _normalize_key(raw)
    if key in CITY_EN_TO_FR:
        return CITY_EN_TO_FR[key]
    # Strip common airport suffixes: "London Stansted", "Venice M.Polo"
    for sep in (" - ", "-", " ", ","):
        if sep in key:
            head = key.split(sep)[0].strip()
            if head in CITY_EN_TO_FR:
                return CITY_EN_TO_FR[head]
    return raw


def translate_country_label(label: Optional[str]) -> str:
    if not label:
        return ""
    key = _normalize_key(label)
    return COUNTRY_EN_TO_FR.get(key, label.strip())


def city_for_code(code: Optional[str], fallback: Optional[str] = None) -> str:
    c = (code or "").strip().upper()
    if c in CITY_FR_BY_IATA:
        return CITY_FR_BY_IATA[c]
    _load_ryanair_fr()
    if c in _CACHE:
        city = _CACHE[c][0]
        # Still English from Ryanair? try label translate
        return translate_city_label(city) or city
    if fallback:
        return translate_city_label(fallback)
    return c or ""


def country_for_code(code: Optional[str], fallback: Optional[str] = None) -> str:
    c = (code or "").strip().upper()
    _load_ryanair_fr()
    if c in _CACHE:
        return _CACHE[c][1] or translate_country_label(fallback) or ""
    return translate_country_label(fallback) or ""


# Prefer these airport labels when Ryanair /fr still uses English
AIRPORT_FR_BY_IATA: Dict[str, str] = {
    "ATH": "Athènes",
    "CPH": "Copenhague",
    "VIE": "Vienne",
    "HAM": "Hambourg",
    "VCE": "Venise Marco Polo",
    "TSF": "Venise-Trévise",
    "BGY": "Milan-Bergame",
    "MXP": "Milan Malpensa",
    "LIN": "Milan Linate",
    "FCO": "Rome-Fiumicino",
    "CIA": "Rome-Ciampino",
    "STN": "Londres-Stansted",
    "LTN": "Londres-Luton",
    "LGW": "Londres-Gatwick",
    "LHR": "Londres-Heathrow",
    "CRL": "Bruxelles-Charleroi",
    "BRU": "Bruxelles-Zaventem",
    "BVA": "Paris-Beauvais",
    "CDG": "Paris-Charles de Gaulle",
    "ORY": "Paris-Orly",
    "MRS": "Marseille-Provence",
    "NCE": "Nice-Côte d'Azur",
    "LYS": "Lyon-Saint-Exupéry",
    "TLS": "Toulouse-Blagnac",
    "NTE": "Nantes-Atlantique",
    "BOD": "Bordeaux-Mérignac",
    "LIL": "Lille-Lesquin",
    "SXB": "Strasbourg",
    "MPL": "Montpellier-Méditerranée",
    "BSL": "Bâle-Mulhouse",
    "GVA": "Genève",
    "CTA": "Catane",
    "EFL": "Céphalonie",
    "HER": "Héraklion",
    "CHQ": "La Canée",
    "JTR": "Santorin",
    "FRA": "Francfort",
    "DUS": "Düsseldorf",
    "HAJ": "Hanovre",
    "DRS": "Dresde",
    "CGN": "Cologne",
    "WAW": "Varsovie-Chopin",
    "KRK": "Cracovie",
    "OTP": "Bucarest Otopeni",
    "LIS": "Lisbonne",
    "BCN": "Barcelone El Prat",
    "SVQ": "Séville",
    "VLC": "Valence",
    "EDI": "Édimbourg",
    "GOT": "Göteborg-Landvetter",
    "LPA": "Grande Canarie",
    "TFS": "Ténérife Sud",
    "TFN": "Ténérife Nord",
    "FEZ": "Fès",
    "TNG": "Tanger",
    "MLA": "Malte",
}


def airport_name_for_code(code: Optional[str], fallback: Optional[str] = None) -> str:
    c = (code or "").strip().upper()
    if c in AIRPORT_FR_BY_IATA:
        return AIRPORT_FR_BY_IATA[c]
    _load_ryanair_fr()
    if c in _CACHE:
        name = (_CACHE[c][2] or "").strip()
        if name:
            # Translate whole label or leading city token
            translated = translate_city_label(name)
            if translated != name:
                return translated
            return name
    city = city_for_code(c, fallback)
    return city or c or ""


def destination_full_fr(
    code: Optional[str],
    *,
    fallback_full: Optional[str] = None,
) -> str:
    """Build 'Aéroport, Pays' in French for an IATA code (city resolved separately)."""
    name_fb = None
    country_fb = None
    if fallback_full and "," in fallback_full:
        name_fb, country_fb = [p.strip() for p in fallback_full.split(",", 1)]
    elif fallback_full:
        name_fb = fallback_full.strip()
    airport = airport_name_for_code(code, name_fb)
    country = country_for_code(code, country_fb)
    if airport and country:
        return f"{airport}, {country}"
    return airport or country or (fallback_full or "")


def localize_airport_dict(airport: dict) -> dict:
    """Mutate/return airport dict with French city (+ keep name readable)."""
    code = (airport.get("code") or "").strip().upper()
    city = city_for_code(code, airport.get("city"))
    country = airport.get("country") or country_for_code(code)
    # Prefer French city; keep airport name but translate leading city if English
    name = airport.get("name") or city
    name_fr = translate_city_label(name)
    if name_fr != name and city and name_fr.lower().startswith(city.lower()[:4]):
        name = name_fr
    elif city and name:
        # If name starts with English city equivalent, rebuild lightly
        pass
    airport["city"] = city
    airport["country"] = country
    airport["name"] = name
    return airport
