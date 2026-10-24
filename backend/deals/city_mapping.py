"""
L12 / D0 — airport IATA → served city mapping.

City name is the user-facing label; multiple IATAs (CIA/FCO) share one served_city.
`verified=true` required before a dest can become a community deal.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("deals.city_mapping")


def _slugify(name: str) -> str:
    raw = (name or "").strip().lower()
    nfkd = unicodedata.normalize("NFKD", raw)
    ascii_ = "".join(c for c in nfkd if not unicodedata.combining(c))
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_).strip("-")
    return slug or "ville"


def build_mapping_rows_from_city_dict() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Build served_cities + airport_city_mapping rows from CITY_FR_BY_IATA.
    Groups IATAs that share the same French city name.
    Returns (cities, mappings) — cities keyed later by slug.
    """
    from city_names_fr import CITY_FR_BY_IATA, country_for_code
    from deals.airport_tz import tz_for_iata
    from deals.destinations_seed import DESTINATIONS_SEED

    # Prefer curated deal destination coords / primary iata when available
    seed_by_city: Dict[str, Dict[str, Any]] = {}
    for d in DESTINATIONS_SEED:
        seed_by_city[(d.get("city_name") or "").strip().lower()] = d

    by_city: Dict[str, List[str]] = {}
    for iata, city in CITY_FR_BY_IATA.items():
        code = (iata or "").strip().upper()
        name = (city or "").strip()
        if len(code) != 3 or not name:
            continue
        key = name.lower()
        by_city.setdefault(key, [])
        if code not in by_city[key]:
            by_city[key].append(code)

    cities: List[Dict[str, Any]] = []
    mappings: List[Dict[str, Any]] = []

    for city_key, iatas in sorted(by_city.items(), key=lambda x: x[0]):
        iatas_sorted = sorted(iatas)
        display = CITY_FR_BY_IATA.get(iatas_sorted[0], city_key.title())
        # Prefer seed display name casing
        seed = seed_by_city.get(city_key)
        if seed:
            display = seed.get("city_name") or display
            primary = (seed.get("iata_arrival") or iatas_sorted[0]).upper()
            if primary not in iatas_sorted:
                iatas_sorted = [primary] + iatas_sorted
            country = (seed.get("country_code") or country_for_code(primary, "") or "").upper()
            lat = seed.get("center_lat")
            lng = seed.get("center_lng")
            tz = seed.get("timezone") or tz_for_iata(primary)
            verified = True  # curated seed cities are verified
        else:
            primary = iatas_sorted[0]
            country = (country_for_code(primary, "") or "").upper()
            lat = None
            lng = None
            tz = tz_for_iata(primary)
            # Multi-airport known cities or single IATA with FR label → verified
            verified = len(iatas_sorted) >= 2 or bool(display)

        slug = _slugify(display)
        cities.append(
            {
                "slug": slug,
                "city_name": display,
                "country_code": country or "",
                "center_lat": lat,
                "center_lng": lng,
                "timezone": tz or "Europe/Paris",
                "primary_iata": primary,
                "verified": verified,
                "_iatas": iatas_sorted,
            }
        )

    return cities, mappings


def upsert_city_mapping(supabase) -> Dict[str, Any]:
    """Upsert served_cities + airport_city_mapping from CITY_FR_BY_IATA."""
    cities, _ = build_mapping_rows_from_city_dict()
    inserted_cities = 0
    inserted_maps = 0
    verified_maps = 0

    for city in cities:
        iatas = city.pop("_iatas", [])
        row = {k: v for k, v in city.items() if not k.startswith("_")}
        existing = (
            supabase.table("served_cities")
            .select("id, verified")
            .eq("slug", row["slug"])
            .limit(1)
            .execute()
        )
        if existing.data:
            city_id = existing.data[0]["id"]
            # Never downgrade verified; refresh metadata
            patch = {
                "city_name": row["city_name"],
                "country_code": row["country_code"],
                "timezone": row["timezone"],
                "primary_iata": row["primary_iata"],
                "updated_at": "now()",
            }
            if row.get("center_lat") is not None:
                patch["center_lat"] = row["center_lat"]
                patch["center_lng"] = row["center_lng"]
            if row.get("verified") and not existing.data[0].get("verified"):
                patch["verified"] = True
            try:
                # supabase-py: use iso timestamp instead of 'now()' string
                from datetime import datetime, timezone

                patch["updated_at"] = datetime.now(timezone.utc).isoformat()
                supabase.table("served_cities").update(patch).eq("id", city_id).execute()
            except Exception as e:
                logger.warning("served_cities update %s: %s", row["slug"], e)
        else:
            from datetime import datetime, timezone

            row["updated_at"] = datetime.now(timezone.utc).isoformat()
            res = supabase.table("served_cities").insert(row).execute()
            if not res.data:
                logger.warning("served_cities insert failed slug=%s", row["slug"])
                continue
            city_id = res.data[0]["id"]
            inserted_cities += 1

        city_verified = bool(row.get("verified"))
        for iata in iatas:
            map_row = {
                "iata": iata,
                "served_city_id": city_id,
                "verified": city_verified,
            }
            try:
                from datetime import datetime, timezone

                map_row["updated_at"] = datetime.now(timezone.utc).isoformat()
                existing_m = (
                    supabase.table("airport_city_mapping")
                    .select("iata, verified")
                    .eq("iata", iata)
                    .limit(1)
                    .execute()
                )
                if existing_m.data:
                    patch_m = {
                        "served_city_id": city_id,
                        "updated_at": map_row["updated_at"],
                    }
                    if map_row["verified"] and not existing_m.data[0].get("verified"):
                        patch_m["verified"] = True
                    supabase.table("airport_city_mapping").update(patch_m).eq(
                        "iata", iata
                    ).execute()
                else:
                    supabase.table("airport_city_mapping").insert(map_row).execute()
                    inserted_maps += 1
                if map_row["verified"]:
                    verified_maps += 1
            except Exception as e:
                logger.warning("airport_city_mapping %s: %s", iata, e)

    return {
        "cities_upserted": len(cities),
        "cities_inserted": inserted_cities,
        "mappings_inserted": inserted_maps,
        "verified_mappings": verified_maps,
    }


def resolve_served_city(
    supabase,
    iata: str,
    *,
    require_verified: bool = False,
) -> Optional[Dict[str, Any]]:
    """Resolve IATA → served city row (+ mapping verified flag)."""
    code = (iata or "").strip().upper()
    if len(code) != 3:
        return None
    try:
        m = (
            supabase.table("airport_city_mapping")
            .select("iata, verified, served_city_id, served_cities(*)")
            .eq("iata", code)
            .limit(1)
            .execute()
        )
        if not m.data:
            return None
        row = m.data[0]
        city = row.get("served_cities") or {}
        if isinstance(city, list):
            city = city[0] if city else {}
        if require_verified and not (
            row.get("verified") and city.get("verified")
        ):
            return None
        return {
            "iata": code,
            "mapping_verified": bool(row.get("verified")),
            "served_city_id": row.get("served_city_id") or city.get("id"),
            "city_name": city.get("city_name") or code,
            "country_code": city.get("country_code") or "",
            "slug": city.get("slug"),
            "primary_iata": city.get("primary_iata") or code,
            "center_lat": city.get("center_lat"),
            "center_lng": city.get("center_lng"),
            "timezone": city.get("timezone") or "Europe/Paris",
            "verified": bool(city.get("verified") and row.get("verified")),
        }
    except Exception as e:
        logger.warning("resolve_served_city %s: %s", code, e)
        return None


def city_name_for_iata(supabase, iata: str, fallback: Optional[str] = None) -> str:
    """User-facing city name: mapping first, then CITY_FR_BY_IATA."""
    resolved = resolve_served_city(supabase, iata) if supabase else None
    if resolved and resolved.get("city_name"):
        return str(resolved["city_name"])
    try:
        from city_names_fr import city_for_code

        return city_for_code(iata, fallback or (iata or "").upper())
    except Exception:
        return fallback or (iata or "").upper()


def iatas_for_served_city(supabase, served_city_id: str) -> List[str]:
    try:
        res = (
            supabase.table("airport_city_mapping")
            .select("iata")
            .eq("served_city_id", served_city_id)
            .execute()
        )
        return [str(r["iata"]).upper() for r in (res.data or []) if r.get("iata")]
    except Exception:
        return []
