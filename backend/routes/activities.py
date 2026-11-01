"""Activities / Viator / trip_items / itineraries API — Lots A–G."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from deals.cron_auth import require_cron

router = APIRouter(tags=["activities"])


def _svc():
    from supabase_deps import get_supabase_client, get_supabase_service_client

    return get_supabase_service_client() or get_supabase_client()


def _user_id(request: Request) -> Optional[str]:
    # Optional auth — many endpoints work as guest via draft_token
    try:
        from routes.planner import _require_user  # type: ignore

        return None
    except Exception:
        return None


class EventBody(BaseModel):
    domain: str = "activity"
    event: str
    surface: Optional[str] = None
    platform: Optional[str] = None
    place_id: Optional[str] = None
    trip_item_id: Optional[str] = None
    draft_token: Optional[str] = None
    planned_trip_id: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


class NearbyBody(BaseModel):
    lat: float
    lng: float
    adults: int = Field(2, ge=1, le=6)


class AddItemBody(BaseModel):
    product_code: Optional[str] = None
    place_id: Optional[str] = None
    draft_token: Optional[str] = None
    planned_trip_id: Optional[str] = None
    day_offset: int = 0
    moment: Optional[str] = None
    title: Optional[str] = None
    product_url: Optional[str] = None
    platform: Optional[str] = None
    surface: Optional[str] = None


class PatchItemBody(BaseModel):
    status: Optional[str] = None
    availability_state: Optional[str] = None
    sort_key: Optional[str] = None
    day_offset: Optional[int] = None
    moment: Optional[str] = None


class ReorderBody(BaseModel):
    items: List[Dict[str, Any]]  # [{id, sort_key, day_offset?}]


class TransferBody(BaseModel):
    draft_token: str
    planned_trip_id: str


class CreateItineraryBody(BaseModel):
    title: str
    draft_token: Optional[str] = None
    planned_trip_id: Optional[str] = None
    city_slug: Optional[str] = None
    visibility: str = "private"


class ApplyItineraryBody(BaseModel):
    draft_token: Optional[str] = None
    planned_trip_id: Optional[str] = None


def _draft_id_from_token(supabase, token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    from deals.my_trips import get_draft

    row = get_draft(supabase, token)
    return str(row["id"]) if row and row.get("id") else None


@router.get("/api/activities/config")
async def activities_public_config():
    from activities.config import activities_config_public_dict
    from activities.migrations_check import get_migrations_status

    d = activities_config_public_dict()
    d["migrations_ok"] = get_migrations_status().get("ok")
    return d


@router.get("/api/activities/cities/{city_slug}")
async def list_city_activities(
    city_slug: str,
    adults: int = Query(2, ge=1, le=6),
    destination_id: Optional[str] = None,
):
    from activities.config import load_activities_config
    from activities.service import search_city_activities

    cfg = load_activities_config()
    if not cfg.ui_enabled and not cfg.viator_api_key:
        # Allow API when key present even if UI off (admin/debug)
        pass
    return search_city_activities(
        _svc(),
        city_slug=city_slug,
        destination_id=destination_id,
        adults=adults,
        cfg=cfg,
    )


@router.post("/api/activities/nearby")
async def activities_nearby(body: NearbyBody):
    from activities.service import nearby_activities

    # Round on server too
    lat = round(float(body.lat), 2)
    lng = round(float(body.lng), 2)
    return nearby_activities(_svc(), lat=lat, lng=lng, adults=body.adults)


@router.get("/api/activities/products/{product_code}")
async def activity_product_detail(product_code: str):
    from activities.cache import cache_get, cache_set
    from activities.config import load_activities_config
    from activities.service import _normalize_product
    from activities.viator_client import ViatorClient, ViatorError

    cfg = load_activities_config()
    sb = _svc()
    cached = cache_get(
        sb, provider="viator", resource="product", cache_key=product_code
    )
    if isinstance(cached, dict):
        return {"ok": True, "product": cached, "cached": True}
    client = ViatorClient(cfg)
    try:
        raw = client.product_detail(product_code)
    except ViatorError as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not isinstance(raw, dict):
        raise HTTPException(status_code=404, detail="not_found")
    norm = _normalize_product(raw)
    cache_set(
        sb,
        provider="viator",
        resource="product",
        cache_key=product_code,
        payload=norm,
        ttl_h=cfg.cache_ttl_h,
    )
    return {"ok": True, "product": norm, "cached": False}


@router.post("/api/activities/events")
async def post_activity_event(body: EventBody):
    from activities.events import record_event

    sb = _svc()
    draft_id = _draft_id_from_token(sb, body.draft_token)
    return record_event(
        sb,
        domain=body.domain,
        event=body.event,
        surface=body.surface,
        platform=body.platform,
        place_id=body.place_id,
        trip_item_id=body.trip_item_id,
        draft_id=draft_id,
        planned_trip_id=body.planned_trip_id,
        meta=body.meta,
    )


@router.get("/api/activities/trip-items")
async def get_trip_items(
    draft_token: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
):
    from activities.trip_items import list_trip_items

    sb = _svc()
    draft_id = _draft_id_from_token(sb, draft_token)
    if not draft_id and not planned_trip_id:
        raise HTTPException(status_code=400, detail="draft_token or planned_trip_id required")
    return {"ok": True, "items": list_trip_items(sb, draft_id=draft_id, planned_trip_id=planned_trip_id)}


@router.post("/api/activities/trip-items")
async def create_trip_item(body: AddItemBody):
    from activities.events import record_event
    from activities.places import upsert_place_with_ref
    from activities.trip_items import add_activity_item

    sb = _svc()
    draft_id = _draft_id_from_token(sb, body.draft_token)
    if (draft_id is None) == (body.planned_trip_id is None):
        raise HTTPException(status_code=400, detail="exactly_one_owner")
    place_id = body.place_id
    if not place_id and body.product_code:
        place = upsert_place_with_ref(
            sb,
            kind="activity",
            name=body.title or body.product_code,
            provider="viator",
            external_id=body.product_code,
            location_precision="city",
            meta={"product_url": body.product_url},
        )
        place_id = place["id"] if place else None
    if not place_id:
        raise HTTPException(status_code=400, detail="place_or_product_required")
    item = add_activity_item(
        sb,
        place_id=place_id,
        draft_id=draft_id,
        planned_trip_id=body.planned_trip_id,
        day_offset=body.day_offset,
        moment=body.moment,
        meta={"product_code": body.product_code, "product_url": body.product_url},
    )
    if not item:
        raise HTTPException(status_code=500, detail="insert_failed")
    record_event(
        sb,
        domain="activity",
        event="add",
        surface=body.surface or "tab",
        platform=body.platform,
        place_id=place_id,
        trip_item_id=item.get("id"),
        draft_id=draft_id,
        planned_trip_id=body.planned_trip_id,
    )
    return {"ok": True, "item": item}


@router.patch("/api/activities/trip-items/{item_id}")
async def patch_trip_item(item_id: str, body: PatchItemBody):
    from activities.trip_items import update_item_status

    row = update_item_status(
        _svc(),
        item_id,
        status=body.status,
        availability_state=body.availability_state,
        sort_key=body.sort_key,
        day_offset=body.day_offset,
        moment=body.moment,
    )
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    return {"ok": True, "item": row}


@router.post("/api/activities/trip-items/reorder")
async def reorder_trip_items(body: ReorderBody):
    from activities.trip_items import update_item_status

    sb = _svc()
    updated = 0
    for it in body.items or []:
        iid = it.get("id")
        if not iid:
            continue
        if update_item_status(
            sb,
            str(iid),
            sort_key=it.get("sort_key"),
            day_offset=it.get("day_offset"),
            moment=it.get("moment"),
        ):
            updated += 1
    return {"ok": True, "updated": updated}


@router.post("/api/activities/trip-items/transfer")
async def transfer_items(body: TransferBody):
    from activities.trip_items import transfer_trip_items_draft_to_planned

    sb = _svc()
    draft_id = _draft_id_from_token(sb, body.draft_token)
    if not draft_id:
        raise HTTPException(status_code=404, detail="draft_not_found")
    return transfer_trip_items_draft_to_planned(
        sb, draft_id=draft_id, planned_trip_id=body.planned_trip_id
    )


@router.post("/api/activities/itineraries")
async def create_itinerary(body: CreateItineraryBody):
    from activities.config import load_activities_config
    from activities.itineraries import create_itinerary_from_trip

    if not load_activities_config().itineraries_enabled:
        raise HTTPException(status_code=404, detail="itineraries_disabled")
    sb = _svc()
    draft_id = _draft_id_from_token(sb, body.draft_token)
    return create_itinerary_from_trip(
        sb,
        draft_id=draft_id,
        planned_trip_id=body.planned_trip_id,
        title=body.title,
        city_slug=body.city_slug,
        visibility=body.visibility,
    )


@router.post("/api/activities/itineraries/{itinerary_id}/apply")
async def apply_itinerary(itinerary_id: str, body: ApplyItineraryBody):
    from activities.config import load_activities_config
    from activities.itineraries import apply_itinerary_to_trip

    if not load_activities_config().itineraries_enabled:
        raise HTTPException(status_code=404, detail="itineraries_disabled")
    sb = _svc()
    draft_id = _draft_id_from_token(sb, body.draft_token)
    return apply_itinerary_to_trip(
        sb,
        itinerary_id,
        draft_id=draft_id,
        planned_trip_id=body.planned_trip_id,
    )


@router.get("/api/activities/itineraries/{itinerary_id}")
async def get_itinerary(itinerary_id: str):
    sb = _svc()
    try:
        res = (
            sb.table("itineraries")
            .select("*, itinerary_items(*, places(*))")
            .eq("id", itinerary_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="not_found")
        return {"ok": True, "itinerary": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# —— Cron / admin jobs ——

@router.post("/api/activities/jobs/purge-cache")
async def job_purge_cache(authorization: Optional[str] = Header(None)):
    require_cron(authorization)
    from activities.cache import purge_expired

    return purge_expired(_svc())


@router.post("/api/activities/jobs/sync-destinations")
async def job_sync_destinations(authorization: Optional[str] = Header(None)):
    require_cron(authorization)
    from activities.service import sync_destinations_map

    return sync_destinations_map(_svc())


@router.post("/api/activities/jobs/sandbox-check")
async def job_sandbox_check(authorization: Optional[str] = Header(None)):
    require_cron(authorization)
    from activities.viator_client import run_sandbox_check

    return run_sandbox_check()


@router.get("/api/admin/activities/migrations")
async def admin_migrations_status():
    from activities.migrations_check import get_migrations_status

    return get_migrations_status()


@router.get("/api/admin/activities/events")
async def admin_activity_events(
    platform: Optional[str] = None,
    domain: str = "activity",
    limit: int = Query(200, ge=1, le=1000),
):
    """Funnel aggregate by event / platform / surface (Lot H)."""
    sb = _svc()
    if not sb:
        raise HTTPException(status_code=503, detail="no_supabase")
    try:
        q = (
            sb.table("events")
            .select("event,platform,surface")
            .eq("domain", domain)
            .order("created_at", desc=True)
            .limit(limit)
        )
        if platform:
            q = q.eq("platform", platform)
        res = q.execute()
        rows = list(res.data or [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    counts: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        key = f"{r.get('event')}|{r.get('platform')}|{r.get('surface')}"
        if key not in counts:
            counts[key] = {
                "event": r.get("event"),
                "platform": r.get("platform"),
                "surface": r.get("surface"),
                "n": 0,
            }
        counts[key]["n"] += 1
    funnel = sorted(counts.values(), key=lambda x: -int(x["n"]))
    return {"ok": True, "funnel": funnel, "raw_count": len(rows)}


@router.post("/api/activities/jobs/j7-reminders")
async def job_j7_reminders(authorization: Optional[str] = Header(None)):
    require_cron(authorization)
    from activities.reminders import run_activity_j7_reminders

    return run_activity_j7_reminders(_svc())
