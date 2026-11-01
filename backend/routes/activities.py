"""Activities / Viator / trip_items / itineraries API — Lots A–H (+ hardening)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from admin_auth import require_admin
from deals.cron_auth import require_cron

router = APIRouter(tags=["activities"])


def _svc():
    from supabase_deps import get_supabase_client, get_supabase_service_client

    return get_supabase_service_client() or get_supabase_client()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for") or ""
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    if request.client:
        return request.client.host or "unknown"
    return "unknown"


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
    draft_token: Optional[str] = None


class ReorderBody(BaseModel):
    items: List[Dict[str, Any]]
    draft_token: Optional[str] = None
    planned_trip_id: Optional[str] = None


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


@router.get("/api/activities/config")
async def activities_public_config():
    from activities.config import activities_config_public_dict

    # migrations_ok intentionally omitted — admin-only
    return activities_config_public_dict()


@router.get("/api/activities/cities/{city_slug}")
async def list_city_activities(
    city_slug: str,
    adults: int = Query(2, ge=1, le=6),
    destination_id: Optional[str] = None,
):
    from activities.config import load_activities_config
    from activities.service import search_city_activities

    cfg = load_activities_config()
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
async def post_activity_event(body: EventBody, request: Request):
    from activities.access import draft_id_from_token
    from activities.event_limits import check_ip_rate_limit, validate_event_fields
    from activities.events import record_event

    err = validate_event_fields(
        domain=body.domain,
        event=body.event,
        surface=body.surface,
        platform=body.platform,
    )
    if err:
        raise HTTPException(status_code=400, detail=err)
    if not check_ip_rate_limit(_client_ip(request)):
        raise HTTPException(status_code=429, detail="rate_limited")

    sb = _svc()
    draft_id = draft_id_from_token(sb, body.draft_token)
    # Strip oversized meta
    meta = body.meta if isinstance(body.meta, dict) else None
    if meta and len(str(meta)) > 2000:
        meta = {"truncated": True}
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
        meta=meta,
    )


@router.get("/api/activities/trip-items")
async def get_trip_items(
    request: Request,
    draft_token: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
):
    from activities.access import resolve_owner_for_write
    from activities.trip_items import list_trip_items

    sb = _svc()
    draft_id, planned = resolve_owner_for_write(
        sb, request, draft_token=draft_token, planned_trip_id=planned_trip_id
    )
    return {
        "ok": True,
        "items": list_trip_items(sb, draft_id=draft_id, planned_trip_id=planned),
    }


@router.post("/api/activities/trip-items")
async def create_trip_item(body: AddItemBody, request: Request):
    from activities.access import resolve_owner_for_write
    from activities.events import record_event
    from activities.places import upsert_place_with_ref
    from activities.trip_items import add_activity_item

    sb = _svc()
    draft_id, planned = resolve_owner_for_write(
        sb,
        request,
        draft_token=body.draft_token,
        planned_trip_id=body.planned_trip_id,
    )
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
        planned_trip_id=planned,
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
        planned_trip_id=planned,
    )
    return {"ok": True, "item": item}


@router.patch("/api/activities/trip-items/{item_id}")
async def patch_trip_item(item_id: str, body: PatchItemBody, request: Request):
    from activities.access import assert_can_mutate_item, get_trip_item
    from activities.trip_items import update_item_status

    sb = _svc()
    item = get_trip_item(sb, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="not_found")
    assert_can_mutate_item(sb, request, item, draft_token=body.draft_token)
    row = update_item_status(
        sb,
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
async def reorder_trip_items(body: ReorderBody, request: Request):
    from activities.access import assert_can_mutate_item, get_trip_item, resolve_owner_for_write
    from activities.trip_items import update_item_status

    sb = _svc()
    # Establish owner scope first
    draft_id, planned = resolve_owner_for_write(
        sb,
        request,
        draft_token=body.draft_token,
        planned_trip_id=body.planned_trip_id,
    )
    updated = 0
    for it in body.items or []:
        iid = it.get("id")
        if not iid:
            continue
        row = get_trip_item(sb, str(iid))
        if not row:
            continue
        # Must belong to the same owner
        if draft_id and str(row.get("draft_id") or "") != draft_id:
            raise HTTPException(status_code=403, detail="item_owner_mismatch")
        if planned and str(row.get("planned_trip_id") or "") != planned:
            raise HTTPException(status_code=403, detail="item_owner_mismatch")
        assert_can_mutate_item(sb, request, row, draft_token=body.draft_token)
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
async def transfer_items(body: TransferBody, request: Request):
    from activities.access import require_draft_token, require_planned_trip_member
    from activities.trip_items import transfer_trip_items_draft_to_planned

    sb = _svc()
    draft_id = require_draft_token(sb, body.draft_token)
    require_planned_trip_member(sb, request, body.planned_trip_id)
    return transfer_trip_items_draft_to_planned(
        sb, draft_id=draft_id, planned_trip_id=body.planned_trip_id
    )


@router.post("/api/activities/itineraries")
async def create_itinerary(body: CreateItineraryBody, request: Request):
    from activities.access import resolve_owner_for_write, user_id_from_request
    from activities.config import load_activities_config
    from activities.itineraries import create_itinerary_from_trip

    if not load_activities_config().itineraries_enabled:
        raise HTTPException(status_code=404, detail="itineraries_disabled")
    sb = _svc()
    draft_id, planned = resolve_owner_for_write(
        sb,
        request,
        draft_token=body.draft_token,
        planned_trip_id=body.planned_trip_id,
    )
    return create_itinerary_from_trip(
        sb,
        draft_id=draft_id,
        planned_trip_id=planned,
        title=body.title,
        city_slug=body.city_slug,
        visibility=body.visibility,
        owner_user_id=user_id_from_request(request),
    )


@router.post("/api/activities/itineraries/{itinerary_id}/apply")
async def apply_itinerary(itinerary_id: str, body: ApplyItineraryBody, request: Request):
    from activities.access import resolve_owner_for_write, user_id_from_request
    from activities.config import load_activities_config
    from activities.itineraries import apply_itinerary_to_trip

    if not load_activities_config().itineraries_enabled:
        raise HTTPException(status_code=404, detail="itineraries_disabled")
    sb = _svc()
    draft_id, planned = resolve_owner_for_write(
        sb,
        request,
        draft_token=body.draft_token,
        planned_trip_id=body.planned_trip_id,
    )
    return apply_itinerary_to_trip(
        sb,
        itinerary_id,
        draft_id=draft_id,
        planned_trip_id=planned,
        user_id=user_id_from_request(request),
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


# —— Cron jobs (Bearer CRON_SECRET) ——

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


@router.post("/api/activities/jobs/refresh-snapshots")
async def job_refresh_snapshots(authorization: Optional[str] = Header(None)):
    """Weekly (or configured) city snapshot refresh — requires CRON_SECRET."""
    require_cron(authorization)
    from activities.snapshots import refresh_city_snapshots

    return refresh_city_snapshots(_svc())


@router.post("/api/activities/jobs/j7-reminders")
async def job_j7_reminders(authorization: Optional[str] = Header(None)):
    require_cron(authorization)
    from activities.reminders import run_activity_j7_reminders

    return run_activity_j7_reminders(_svc())


# —— Admin (require_admin) ——

@router.get("/api/admin/activities/migrations")
@require_admin
async def admin_migrations_status(request: Request):
    from activities.migrations_check import get_migrations_status

    return get_migrations_status()


@router.get("/api/admin/activities/events")
@require_admin
async def admin_activity_events(
    request: Request,
    platform: Optional[str] = None,
    domain: str = "activity",
    limit: int = Query(200, ge=1, le=1000),
):
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
