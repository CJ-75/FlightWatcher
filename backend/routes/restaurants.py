"""Restaurants / Tes adresses — link import + user_places + trip add."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from supabase_deps import get_user_id_from_token

logger = logging.getLogger("routes.restaurants")
router = APIRouter(tags=["restaurants"])


def _svc(_request: Request = None):
    from supabase_deps import get_supabase_client, get_supabase_service_client

    return get_supabase_service_client() or get_supabase_client()


def _uid(request: Request) -> Optional[str]:
    return get_user_id_from_token(request)


class ImportLinksBody(BaseModel):
    text: str = Field(..., min_length=1)
    draft_token: Optional[str] = None
    planned_trip_id: Optional[str] = None
    city_slug: Optional[str] = None


class ConfirmPlaceBody(BaseModel):
    place_id: str
    draft_token: Optional[str] = None
    planned_trip_id: Optional[str] = None
    item_type: str = "restaurant"  # restaurant | activity
    day_offset: int = 0
    moment: Optional[str] = None
    save_address: bool = True
    source_url: Optional[str] = None
    city_slug: Optional[str] = None


class UserPlacePatch(BaseModel):
    status: Optional[str] = None
    note: Optional[str] = None
    rating: Optional[int] = None


class OpeningBody(BaseModel):
    opening_hours_raw: Optional[str] = None
    date_iso: str
    moment: Optional[str] = None
    holiday_closed: bool = False


@router.get("/api/restaurants/config")
async def restaurants_config():
    from activities.restaurants_config import restaurants_config_public_dict

    return restaurants_config_public_dict()


@router.post("/api/restaurants/opening")
async def restaurants_opening(body: OpeningBody):
    """Evaluate opening chip (shared rules mirrored in Python lightly)."""
    raw = (body.opening_hours_raw or "").strip()
    if body.holiday_closed:
        return {
            "status": "closed",
            "label": "Fermé (jour férié)",
            "reason": "holiday",
        }
    if not raw:
        return {
            "status": "unknown",
            "label": "Horaires non renseignés",
            "reason": "missing",
        }
    if raw.upper() in ("24/7", "OPEN"):
        return {"status": "open", "label": "Ouvert ✓", "reason": "open"}
    # Defer rich parse to client shared helper; server returns unknown if complex
    return {
        "status": "unknown",
        "label": "Horaires à vérifier",
        "reason": "server_simple",
        "opening_hours_raw": raw,
        "date_iso": body.date_iso,
        "moment": body.moment,
    }


@router.post("/api/restaurants/import-links")
async def import_links(request: Request, body: ImportLinksBody):
    from activities.config import load_activities_config
    from activities.restaurants_config import load_restaurants_config
    from activities.restaurants_service import parse_share_payload, recognize_and_upsert

    act = load_activities_config()
    cfg = load_restaurants_config()
    if not act.planner_restaurants_enabled and not cfg.link_import_enabled:
        raise HTTPException(status_code=404, detail="Restaurants désactivés")
    if not cfg.link_import_enabled:
        raise HTTPException(status_code=404, detail="Import de liens désactivé")

    sb = _svc(request)
    uid = _uid(request)
    parsed_list = parse_share_payload(body.text, max_links=cfg.link_import_max_links)
    results: List[Dict[str, Any]] = []
    for parsed in parsed_list:
        rec = recognize_and_upsert(
            sb,
            parsed,
            user_id=uid,
            city_slug=body.city_slug,
        )
        row = {
            "source": parsed.get("source"),
            "url_clean": parsed.get("url_clean"),
            "status": rec.get("status"),
            "bucket": rec.get("bucket"),
            "place_id": rec.get("place_id"),
            "place": rec.get("place"),
            "parse": parsed,
            "attribution": (rec.get("geo") or {}).get("attribution"),
        }
        if sb:
            try:
                sb.table("link_imports").insert(
                    {
                        "user_id": uid,
                        "draft_token": body.draft_token,
                        "planned_trip_id": body.planned_trip_id,
                        "source": parsed.get("source") or "unknown",
                        "url_clean": (parsed.get("url_clean") or "")[:2000],
                        "parse_result": parsed,
                        "place_id": rec.get("place_id"),
                        "status": rec.get("status") or "pending",
                    }
                ).execute()
            except Exception as e:
                logger.debug("link_imports insert: %s", e)
        results.append(row)

    cities: Dict[str, int] = {}
    for r in results:
        place = r.get("place") or {}
        slug = place.get("city_slug") or body.city_slug
        if slug:
            cities[str(slug)] = cities.get(str(slug), 0) + 1
    suggested_city = None
    if cities:
        suggested_city = max(cities.items(), key=lambda x: x[1])[0]

    return {
        "ok": True,
        "results": results,
        "counts": {
            "restaurant": sum(1 for r in results if r.get("bucket") == "restaurant"),
            "attraction": sum(1 for r in results if r.get("bucket") == "attraction"),
            "unknown": sum(1 for r in results if r.get("bucket") == "unknown"),
            "needs_clarify": sum(
                1 for r in results if r.get("status") == "needs_clarify"
            ),
        },
        "suggested_city": suggested_city,
    }


@router.post("/api/restaurants/confirm")
async def confirm_place(request: Request, body: ConfirmPlaceBody):
    from activities.trip_items import add_place_item

    sb = _svc(request)
    uid = _uid(request)
    if not sb:
        raise HTTPException(status_code=503, detail="Supabase indisponible")

    draft_id = None
    if body.draft_token:
        try:
            d = (
                sb.table("my_trip_drafts")
                .select("id")
                .eq("draft_token", body.draft_token)
                .limit(1)
                .execute()
            )
            draft_id = (d.data or [{}])[0].get("id")
        except Exception:
            draft_id = None

    item_type = body.item_type if body.item_type in ("restaurant", "activity") else "restaurant"
    item = None
    if draft_id or body.planned_trip_id:
        item = add_place_item(
            sb,
            place_id=body.place_id,
            item_type=item_type,
            draft_id=draft_id,
            planned_trip_id=body.planned_trip_id,
            day_offset=body.day_offset,
            moment=body.moment,
            user_id=uid,
            meta={"source_url": body.source_url},
        )

    user_place = None
    if body.save_address and (uid or body.draft_token):
        try:
            row = {
                "place_id": body.place_id,
                "status": "to_try",
                "source_url": body.source_url,
                "city_slug": body.city_slug,
                "updated_at": __import__("datetime")
                .datetime.now(__import__("datetime").timezone.utc)
                .isoformat(),
            }
            if uid:
                row["user_id"] = uid
            else:
                row["draft_token"] = body.draft_token
            user_place = (
                sb.table("user_places").upsert(row).execute().data or [None]
            )[0]
        except Exception as e:
            logger.debug("user_places: %s", e)

    return {"ok": True, "item": item, "user_place": user_place}


@router.get("/api/restaurants/addresses")
async def list_addresses(
    request: Request,
    city_slug: Optional[str] = None,
    draft_token: Optional[str] = None,
):
    sb = _svc(request)
    uid = _uid(request)
    if not sb:
        return {"ok": True, "items": []}
    try:
        q = sb.table("user_places").select("*, places(*, restaurant_details(*))")
        if uid:
            q = q.eq("user_id", uid)
        elif draft_token:
            q = q.eq("draft_token", draft_token)
        else:
            return {"ok": True, "items": []}
        if city_slug:
            q = q.eq("city_slug", city_slug)
        res = q.order("created_at", desc=True).limit(100).execute()
        return {"ok": True, "items": res.data or []}
    except Exception as e:
        logger.warning("list_addresses: %s", e)
        return {"ok": True, "items": [], "error": str(e)}


@router.patch("/api/restaurants/addresses/{address_id}")
async def patch_address(request: Request, address_id: str, body: UserPlacePatch):
    sb = _svc(request)
    uid = _uid(request)
    if not sb or not uid:
        raise HTTPException(status_code=401, detail="Connexion requise")
    patch: Dict[str, Any] = {}
    if body.status in ("to_try", "loved", "meh"):
        patch["status"] = body.status
    if body.note is not None:
        patch["note"] = body.note[:2000]
    if body.rating is not None and 1 <= body.rating <= 5:
        patch["rating"] = body.rating
    if not patch:
        return {"ok": True}
    try:
        res = (
            sb.table("user_places")
            .update(patch)
            .eq("id", address_id)
            .eq("user_id", uid)
            .execute()
        )
        return {"ok": True, "item": (res.data or [None])[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/restaurants/report")
async def report_place(request: Request, body: Dict[str, Any]):
    sb = _svc(request)
    uid = _uid(request)
    place_id = body.get("place_id")
    if not sb or not place_id:
        raise HTTPException(status_code=400, detail="place_id requis")
    try:
        sb.table("place_reports").insert(
            {
                "place_id": place_id,
                "user_id": uid,
                "reason": body.get("reason") or "closed",
                "note": (body.get("note") or "")[:500] or None,
            }
        ).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/admin/restaurants/metrics")
async def admin_metrics(request: Request):
    """Best-effort admin counters (service client)."""
    sb = _svc(request)
    if not sb:
        return {"ok": False}
    out: Dict[str, Any] = {"ok": True}
    try:
        links = sb.table("link_imports").select("id", count="exact").limit(1).execute()
        out["link_imports"] = getattr(links, "count", None) or len(links.data or [])
    except Exception:
        out["link_imports"] = None
    try:
        ups = sb.table("user_places").select("id", count="exact").limit(1).execute()
        out["user_places"] = getattr(ups, "count", None) or len(ups.data or [])
    except Exception:
        out["user_places"] = None
    try:
        restos = (
            sb.table("trip_items")
            .select("id", count="exact")
            .eq("item_type", "restaurant")
            .limit(1)
            .execute()
        )
        out["trip_restaurants"] = getattr(restos, "count", None) or len(
            restos.data or []
        )
    except Exception:
        out["trip_restaurants"] = None
    return out
