"""
Lot D2 — airport labels when IATA ≠ city name, distance > 25 km.
"""
from __future__ import annotations

import logging
import unicodedata
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("deals.airport_display")

# Approx. km airport → primary city centre (public geography). Show only if > 25.
DISTANCE_KM_SEED: Dict[str, float] = {
    "BVA": 85,   # Beauvais → Paris
    "CRL": 46,   # Charleroi → Bruxelles
    "BGY": 48,   # Bergame → Milan
    "TSF": 30,   # Trévise → Venise
    "STN": 60,   # Stansted → Londres
    "LTN": 55,   # Luton → Londres
    "SEN": 65,   # Southend → Londres
    "CIA": 15,   # Ciampino → Rome (<25 → no distance label)
    "FCO": 30,   # Fiumicino → Rome
    "ORY": 18,
    "CDG": 25,
    "HHN": 120,  # Hahn → Francfort area
    "NRN": 70,   # Weeze → Düsseldorf
    "EIN": 110,  # Eindhoven
}


def _norm(s: str) -> str:
    raw = (s or "").strip().lower()
    nfkd = unicodedata.normalize("NFKD", raw)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def airport_differs_from_city(airport_label: str, city_name: str) -> bool:
    a = _norm(airport_label)
    c = _norm(city_name)
    if not a or not c:
        return False
    if a == c:
        return False
    # "paris-beauvais" contains neither exact city alone
    if c in a and a != c:
        # e.g. city Paris, airport Paris-Beauvais → differs (secondary)
        # e.g. city Lisbonne, airport Lisbonne → same enough if equal after strip
        rest = a.replace(c, "").strip(" -–—")
        return bool(rest)
    return True


def _airport_full_name(iata: str) -> str:
    """Always resolve IATA → human airport name (FR)."""
    code = (iata or "").strip().upper()
    if not code:
        return ""
    try:
        from city_names_fr import airport_name_for_code

        return (airport_name_for_code(code, code) or code).strip()
    except Exception:
        return code


def format_from_airport(iata: str, city_name: str) -> Optional[str]:
    """« depuis Paris-Beauvais » when airport name ≠ city (hint only)."""
    label = _airport_full_name(iata)
    if not label:
        return None
    if not airport_differs_from_city(label, city_name or ""):
        return None
    return f"depuis {label}"


def format_arrival_airport(iata: str, city_name: str) -> Optional[str]:
    """« arrivée Milan-Bergame » when airport name ≠ city (hint only)."""
    label = _airport_full_name(iata)
    if not label:
        return None
    if not airport_differs_from_city(label, city_name or ""):
        return None
    return f"arrivée {label}"


def distance_label(distance_km: Optional[float]) -> Optional[str]:
    if distance_km is None:
        return None
    try:
        km = float(distance_km)
    except (TypeError, ValueError):
        return None
    if km <= 25:
        return None
    return f"à {int(round(km))} km du centre"


def enrich_route_labels(
    *,
    origin_iata: str,
    dest_iata: str,
    city_name: str,
    origin_city: Optional[str] = None,
    distance_km: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Always expose full airport names for UI cards/lightbox.
    route_hint keeps the shorter « depuis / arrivée » notes when useful.
    """
    origin_city = origin_city or ""
    # Infer Paris for BVA/CDG/ORY if unknown
    if not origin_city and (origin_iata or "").upper() in ("BVA", "CDG", "ORY"):
        origin_city = "Paris"

    origin_name = _airport_full_name(origin_iata)
    arrival_name = _airport_full_name(dest_iata)
    from_hint = format_from_airport(origin_iata, origin_city or origin_iata)
    arr_hint = format_arrival_airport(dest_iata, city_name or dest_iata)
    dist_lbl = distance_label(distance_km)
    parts = [p for p in (from_hint, arr_hint, dist_lbl) if p]
    return {
        "origin_airport_label": origin_name or None,
        "arrival_airport_label": arrival_name or None,
        "distance_label": dist_lbl,
        "route_hint": " · ".join(parts) if parts else None,
    }


def upsert_airport_distances(supabase) -> Dict[str, Any]:
    n = 0
    for iata, km in DISTANCE_KM_SEED.items():
        try:
            supabase.table("airport_city_mapping").update(
                {"distance_km_to_center": km}
            ).eq("iata", iata).execute()
            n += 1
        except Exception as e:
            logger.debug("distance upsert %s: %s", iata, e)
    return {"ok": True, "updated": n}


def distance_for_iata(supabase, iata: str, *, prefer_seed: bool = True) -> Optional[float]:
    """
    Km airport → city centre. Seed first on list path (prefer_seed=True) to
    avoid one Supabase round-trip per deal row.
    """
    code = (iata or "").strip().upper()
    if not code:
        return None
    if prefer_seed and code in DISTANCE_KM_SEED:
        return DISTANCE_KM_SEED[code]
    try:
        res = (
            supabase.table("airport_city_mapping")
            .select("distance_km_to_center")
            .eq("iata", code)
            .limit(1)
            .execute()
        )
        if res.data and res.data[0].get("distance_km_to_center") is not None:
            return float(res.data[0]["distance_km_to_center"])
    except Exception:
        pass
    return DISTANCE_KM_SEED.get(code)


def distances_for_iatas(iatas: list) -> Dict[str, Optional[float]]:
    """Batch resolve from seed only (list enrichment)."""
    out: Dict[str, Optional[float]] = {}
    for raw in iatas or []:
        code = (raw or "").strip().upper()
        if not code or code in out:
            continue
        out[code] = DISTANCE_KM_SEED.get(code)
    return out
