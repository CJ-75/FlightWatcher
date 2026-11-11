"""Admin CRUD for editorial parcours (Lot 2)."""
from __future__ import annotations

import logging
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("activities.itineraries_admin")

ADMIN_COLS = (
    "id,slug,title,subtitle,intro,cover_image,city_slug,served_city_id,"
    "status,author_kind,duration_kind,occasions,featured_from,featured_to,"
    "budget_estimate_eur,budget_basis,sort_weight,published_at,is_demo,"
    "visibility,updated_at,created_at"
)

VALID_STATUS = {"draft", "published", "retired"}
VALID_DURATION = {"2h", "half_day", "day", "weekend"}
VALID_BUDGET = {"for_two", "per_person"}
VALID_KIND = {"place", "activity", "free"}
VALID_MOMENT = {"morning", "afternoon", "evening"}


def _slugify(text: str) -> str:
    raw = (text or "").strip().lower()
    nfkd = unicodedata.normalize("NFKD", raw)
    ascii_ = "".join(c for c in nfkd if not unicodedata.combining(c))
    ascii_ = re.sub(r"[^a-z0-9]+", "-", ascii_).strip("-")
    return ascii_[:80] or "parcours"


def _serialize(row: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(row)
    if out.get("occasions") is None:
        out["occasions"] = []
    items = out.get("itinerary_items")
    if isinstance(items, list):
        out["itinerary_items"] = sorted(
            items,
            key=lambda it: (
                int(it.get("day_offset") or 0),
                int(it.get("position") or 0),
                str(it.get("sort_key") or ""),
            ),
        )
    return out


def _publish_blockers(itin: Dict[str, Any], items: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    blockers: List[Dict[str, str]] = []
    if not str(itin.get("intro") or "").strip():
        blockers.append({"code": "intro", "message": "Introduction requise."})
    if not str(itin.get("cover_image") or "").strip():
        blockers.append({"code": "cover", "message": "Photo de couverture requise."})
    if not str(itin.get("title") or "").strip():
        blockers.append({"code": "title", "message": "Titre requis."})
    if not str(itin.get("city_slug") or "").strip():
        blockers.append({"code": "city", "message": "Ville requise."})
    if not str(itin.get("slug") or "").strip():
        blockers.append({"code": "slug", "message": "Slug requis."})
    anchored = 0
    for step in items:
        kind = step.get("kind") or "free"
        if kind == "place" and step.get("place_id"):
            anchored += 1
        elif kind == "activity" and str(step.get("viator_product_code") or "").strip():
            anchored += 1
    if anchored < 3:
        blockers.append(
            {
                "code": "steps_anchored_min",
                "message": (
                    f"Au moins 3 étapes lieu vérifié ou activité Viator "
                    f"(actuellement {anchored}). Les étapes libres ne comptent pas."
                ),
            }
        )
    for i, step in enumerate(items):
        n = i + 1
        kind = step.get("kind") or "free"
        if kind == "place" and not step.get("place_id"):
            blockers.append(
                {
                    "code": f"place_{n}",
                    "message": f"Étape {n} (lieu) : rattacher un lieu vérifié.",
                }
            )
        if kind == "activity" and not str(step.get("viator_product_code") or "").strip():
            blockers.append(
                {
                    "code": f"activity_{n}",
                    "message": f"Étape {n} (activité) : code Viator requis.",
                }
            )
        if kind == "free" and not str(step.get("title") or "").strip():
            blockers.append(
                {
                    "code": f"free_{n}",
                    "message": f"Étape {n} (libre) : titre requis.",
                }
            )
    return blockers


def _place_warnings(supabase, items: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    warnings: List[Dict[str, str]] = []
    for i, step in enumerate(items):
        if (step.get("kind") or "free") == "free":
            warnings.append(
                {
                    "code": f"free_no_place_{i+1}",
                    "message": "Étape sans lieu : elle n’apparaîtra pas dans l’itinéraire.",
                }
            )
    place_ids = [str(it["place_id"]) for it in items if it.get("place_id")]
    if not place_ids or not supabase:
        return warnings
    try:
        reps = (
            supabase.table("place_reports")
            .select("place_id")
            .in_("place_id", place_ids)
            .limit(100)
            .execute()
        )
        reported = {str(r.get("place_id")) for r in (reps.data or [])}
        for i, step in enumerate(items):
            pid = step.get("place_id")
            if pid and str(pid) in reported:
                warnings.append(
                    {
                        "code": f"report_{i+1}",
                        "message": f"Étape {i+1} : lieu signalé (place_reports).",
                    }
                )
            place = step.get("places") or {}
            meta = place.get("meta") if isinstance(place, dict) else None
            if isinstance(meta, dict) and meta.get("closed"):
                warnings.append(
                    {
                        "code": f"closed_{i+1}",
                        "message": f"Étape {i+1} : lieu marqué fermé.",
                    }
                )
    except Exception as e:
        logger.debug("place_warnings: %s", e)
    return warnings


def list_admin_itineraries(
    supabase,
    *,
    city: Optional[str] = None,
    status: Optional[str] = None,
    occasion: Optional[str] = None,
    limit: int = 100,
) -> Dict[str, Any]:
    if not supabase:
        return {"ok": False, "itineraries": [], "error": "no_supabase"}
    lim = max(1, min(int(limit or 100), 200))
    try:
        q = (
            supabase.table("itineraries")
            .select(ADMIN_COLS)
            .eq("author_kind", "admin")
            .order("updated_at", desc=True)
            .limit(lim)
        )
        if city:
            q = q.eq("city_slug", str(city).strip().lower())
        if status:
            q = q.eq("status", str(status).strip().lower())
        if occasion:
            q = q.contains("occasions", [str(occasion).strip().lower()])
        res = q.execute()
        return {"ok": True, "itineraries": [_serialize(r) for r in (res.data or [])]}
    except Exception as e:
        logger.warning("list_admin_itineraries: %s", e)
        return {"ok": False, "itineraries": [], "error": str(e)}


def get_admin_itinerary(supabase, itinerary_id: str) -> Dict[str, Any]:
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    try:
        res = (
            supabase.table("itineraries")
            .select(f"{ADMIN_COLS}, itinerary_items(*, places(*))")
            .eq("id", itinerary_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            return {"ok": False, "error": "not_found"}
        row = _serialize(res.data[0])
        items = list(row.get("itinerary_items") or [])
        return {
            "ok": True,
            "itinerary": row,
            "blockers": _publish_blockers(row, items),
            "warnings": _place_warnings(supabase, items),
        }
    except Exception as e:
        logger.warning("get_admin_itinerary: %s", e)
        return {"ok": False, "error": str(e)}


def create_admin_itinerary(
    supabase,
    *,
    title: str = "Nouveau parcours",
    city_slug: Optional[str] = None,
    cover_image: Optional[str] = None,
) -> Dict[str, Any]:
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    base_slug = _slugify(title)
    slug = base_slug
    for attempt in range(20):
        try:
            payload = {
                "title": (title or "Nouveau parcours").strip()[:200],
                "slug": slug,
                "city_slug": (city_slug or "").strip().lower() or None,
                "status": "draft",
                "author_kind": "admin",
                "visibility": "private",
                "occasions": [],
                "sort_weight": 0,
                "is_demo": False,
                "cover_image": cover_image,
            }
            res = supabase.table("itineraries").insert(payload).execute()
            if not res.data:
                return {"ok": False, "error": "insert_failed"}
            return {"ok": True, "itinerary": _serialize(res.data[0])}
        except Exception as e:
            msg = str(e).lower()
            if "slug" in msg or "unique" in msg or "duplicate" in msg:
                slug = f"{base_slug}-{attempt + 2}"
                continue
            logger.warning("create_admin_itinerary: %s", e)
            return {"ok": False, "error": str(e)}
    return {"ok": False, "error": "slug_collision"}


def _normalize_item(raw: Dict[str, Any], position: int) -> Dict[str, Any]:
    kind = str(raw.get("kind") or "free").strip().lower()
    if kind not in VALID_KIND:
        kind = "free"
    item_type = {
        "place": "place",
        "activity": "activity",
        "free": "free",
    }[kind]
    moment = raw.get("moment")
    if moment and str(moment) not in VALID_MOMENT:
        moment = None
    sort_key = f"a{position:02d}"
    photo = raw.get("photo")
    meta_in = raw.get("meta") if isinstance(raw.get("meta"), dict) else {}
    meta: Dict[str, Any] = dict(meta_in) if meta_in else {}
    # Gallery: photo = first; meta.photos = full list (max 5)
    photos_raw = meta.get("photos") or raw.get("photos")
    if isinstance(photos_raw, list):
        photos = [str(u).strip() for u in photos_raw if str(u).strip()][:5]
        if photos:
            meta["photos"] = photos
            if not photo:
                photo = photos[0]
        else:
            meta.pop("photos", None)
    if meta.get("maps_url"):
        meta["maps_url"] = str(meta["maps_url"]).strip()[:2000]
    for coord_key in ("lat", "lng"):
        if coord_key in meta and meta[coord_key] is not None:
            try:
                meta[coord_key] = float(meta[coord_key])
            except (TypeError, ValueError):
                meta.pop(coord_key, None)
    row = {
        "kind": kind,
        "item_type": item_type,
        "position": position,
        "title": (raw.get("title") or None),
        "note": (raw.get("note") or None),
        "duration_minutes": raw.get("duration_minutes"),
        "photo": photo,
        "place_id": raw.get("place_id"),
        "viator_product_code": raw.get("viator_product_code"),
        "day_offset": int(raw.get("day_offset") or 0),
        "moment": moment,
        "sort_key": sort_key,
        "notes": raw.get("note"),
        "meta": meta or {},
    }
    return row


def update_admin_itinerary(
    supabase,
    itinerary_id: str,
    patch: Dict[str, Any],
) -> Dict[str, Any]:
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    items_in = patch.pop("items", None) if "items" in patch else None
    allowed = {
        "title",
        "subtitle",
        "intro",
        "slug",
        "city_slug",
        "cover_image",
        "duration_kind",
        "occasions",
        "featured_from",
        "featured_to",
        "budget_estimate_eur",
        "budget_basis",
        "sort_weight",
        "status",
        "is_demo",
    }
    data: Dict[str, Any] = {}
    for k, v in patch.items():
        if k not in allowed:
            continue
        if k == "status" and v is not None and str(v) not in VALID_STATUS:
            return {"ok": False, "error": "invalid_status"}
        if k == "duration_kind" and v is not None and str(v) not in VALID_DURATION:
            return {"ok": False, "error": "invalid_duration"}
        if k == "budget_basis" and v is not None and str(v) not in VALID_BUDGET:
            return {"ok": False, "error": "invalid_budget_basis"}
        if k == "city_slug" and v is not None:
            v = str(v).strip().lower() or None
        if k == "slug" and v is not None:
            v = _slugify(str(v))
        if k == "occasions":
            v = [str(x).strip().lower() for x in (v or []) if str(x).strip()]
        data[k] = v

    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        if data:
            res = (
                supabase.table("itineraries")
                .update(data)
                .eq("id", itinerary_id)
                .execute()
            )
            if not res.data:
                return {"ok": False, "error": "not_found"}

        if items_in is not None:
            if not isinstance(items_in, list):
                return {"ok": False, "error": "invalid_items"}
            supabase.table("itinerary_items").delete().eq(
                "itinerary_id", itinerary_id
            ).execute()
            rows = []
            for i, raw in enumerate(items_in):
                if not isinstance(raw, dict):
                    continue
                row = _normalize_item(raw, i)
                row["itinerary_id"] = itinerary_id
                rows.append(row)
            if rows:
                try:
                    supabase.table("itinerary_items").insert(rows).execute()
                except Exception as insert_err:
                    msg = str(insert_err).lower()
                    # Before meta migration: retry without meta column
                    if "meta" in msg:
                        stripped = [{k: v for k, v in r.items() if k != "meta"} for r in rows]
                        supabase.table("itinerary_items").insert(stripped).execute()
                    else:
                        raise

        return get_admin_itinerary(supabase, itinerary_id)
    except Exception as e:
        logger.warning("update_admin_itinerary: %s", e)
        return {"ok": False, "error": str(e)}


def publish_admin_itinerary(supabase, itinerary_id: str) -> Dict[str, Any]:
    got = get_admin_itinerary(supabase, itinerary_id)
    if not got.get("ok"):
        return got
    itin = got["itinerary"]
    items = list(itin.get("itinerary_items") or [])
    blockers = _publish_blockers(itin, items)
    warnings = got.get("warnings") or []
    if blockers:
        return {
            "ok": False,
            "error": "publish_blocked",
            "blockers": blockers,
            "warnings": warnings,
        }
    try:
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("itineraries").update(
            {
                "status": "published",
                "visibility": "public",
                "published_at": itin.get("published_at") or now,
                "updated_at": now,
            }
        ).eq("id", itinerary_id).execute()
        return get_admin_itinerary(supabase, itinerary_id)
    except Exception as e:
        return {"ok": False, "error": str(e)}


def set_status_admin_itinerary(
    supabase, itinerary_id: str, status: str
) -> Dict[str, Any]:
    if status not in VALID_STATUS:
        return {"ok": False, "error": "invalid_status"}
    if status == "published":
        return publish_admin_itinerary(supabase, itinerary_id)
    data: Dict[str, Any] = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if status == "draft":
        data["visibility"] = "private"
    if status == "retired":
        data["visibility"] = "private"
    try:
        supabase.table("itineraries").update(data).eq("id", itinerary_id).execute()
        return get_admin_itinerary(supabase, itinerary_id)
    except Exception as e:
        return {"ok": False, "error": str(e)}


def delete_admin_itinerary(supabase, itinerary_id: str) -> Dict[str, Any]:
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    try:
        supabase.table("itineraries").delete().eq("id", itinerary_id).execute()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
