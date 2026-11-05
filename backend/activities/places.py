"""places + place_refs upsert — Lot A."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("activities.places")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _point_wkt(lat: float, lng: float) -> str:
    # PostGIS EWKT via geography — Supabase accepts GeoJSON or WKT depending on client;
    # we store via RPC-friendly GeoJSON in geom if supported, else meta lat/lng.
    return f"SRID=4326;POINT({lng} {lat})"


def upsert_place_with_ref(
    supabase,
    *,
    kind: str,
    name: str,
    provider: str,
    external_id: str,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    location_precision: str = "city",
    served_city_id: Optional[str] = None,
    city_slug: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Find place by (provider, external_id) or create place + place_ref.
    Returns place row dict with id.
    """
    if not supabase or not external_id:
        return None
    ext = str(external_id).strip()
    try:
        existing = (
            supabase.table("place_refs")
            .select("place_id, places(*)")
            .eq("provider", provider)
            .eq("external_id", ext)
            .limit(1)
            .execute()
        )
        if existing.data:
            place = existing.data[0].get("places")
            if not isinstance(place, dict):
                pid = existing.data[0].get("place_id")
                if pid:
                    r = (
                        supabase.table("places")
                        .select("*")
                        .eq("id", pid)
                        .limit(1)
                        .execute()
                    )
                    place = (r.data or [None])[0]
            if isinstance(place, dict):
                # Backfill photo_url onto existing place when provided.
                incoming_photo = str((meta or {}).get("photo_url") or "").strip()
                if incoming_photo:
                    place_meta = dict(place.get("meta") or {})
                    if not place_meta.get("photo_url"):
                        place_meta["photo_url"] = incoming_photo
                        try:
                            supabase.table("places").update(
                                {"meta": place_meta, "updated_at": _now_iso()}
                            ).eq("id", place["id"]).execute()
                            place = {**place, "meta": place_meta}
                        except Exception as e:
                            logger.debug("place photo backfill: %s", e)
                return place
    except Exception as e:
        logger.debug("place_refs lookup: %s", e)

    place_row: Dict[str, Any] = {
        "kind": kind,
        "name": (name or "Lieu")[:300],
        "location_precision": location_precision
        if location_precision in ("exact", "city")
        else "city",
        "served_city_id": served_city_id,
        "city_slug": city_slug,
        "meta": dict(meta or {}),
        "updated_at": _now_iso(),
    }
    if lat is not None and lng is not None:
        try:
            place_row["meta"] = {
                **place_row["meta"],
                "lat": float(lat),
                "lng": float(lng),
            }
            # Prefer GeoJSON for PostgREST
            place_row["geom"] = {
                "type": "Point",
                "coordinates": [float(lng), float(lat)],
            }
        except (TypeError, ValueError):
            pass

    try:
        ins = supabase.table("places").insert(place_row).execute()
        place = (ins.data or [None])[0]
        if not place:
            return None
        supabase.table("place_refs").insert(
            {
                "place_id": place["id"],
                "provider": provider,
                "external_id": ext,
                "meta": {},
            }
        ).execute()
        return place
    except Exception as e:
        logger.warning("upsert_place_with_ref: %s", e)
        # Race: ref may already exist
        try:
            existing = (
                supabase.table("place_refs")
                .select("place_id")
                .eq("provider", provider)
                .eq("external_id", ext)
                .limit(1)
                .execute()
            )
            if existing.data:
                pid = existing.data[0]["place_id"]
                r = (
                    supabase.table("places")
                    .select("*")
                    .eq("id", pid)
                    .limit(1)
                    .execute()
                )
                return (r.data or [None])[0]
        except Exception:
            pass
        return None
