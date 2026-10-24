"""Deals listing + user liked deals + batch jobs."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from deals.cron_auth import require_cron
from deals.provider import get_deal_provider
from supabase_deps import (
    SUPABASE_AVAILABLE,
    get_supabase_client,
    get_supabase_service_client,
    get_user_id_from_token,
    optional_auth,
)

router = APIRouter()


class LikeDealRequest(BaseModel):
    """Snapshot of the deal at like time (legacy + LiteAPI fields)."""
    id: str
    title: str
    city: str
    country: str
    image_url: str = ""
    price_per_person: float
    currency: str = "EUR"
    nights: int = 1
    departure_airport: str
    dates: Dict[str, Any]
    hotel_name: Optional[str] = None
    hotel_stars: Optional[int] = None
    board: Optional[str] = None
    highlights: List[str] = Field(default_factory=list)
    description: str = ""
    provider: str = "mock"
    booking_url: str = ""
    badge: Optional[str] = None
    deal_key: Optional[str] = None
    origin_iata: Optional[str] = None
    destination: Optional[str] = None
    window_kind: Optional[str] = None
    window_id: Optional[str] = None
    adults: Optional[int] = None
    flight: Optional[Dict[str, Any]] = None
    hotel: Optional[Dict[str, Any]] = None
    price_breakdown: Optional[Dict[str, Any]] = None
    ssp_source: Optional[str] = None
    flags: Optional[Dict[str, Any]] = None
    alt_hotels: Optional[List[Dict[str, Any]]] = None
    fetched_at: Optional[str] = None


def _require_user(request: Request) -> str:
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    return user_id


def _svc():
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    client = get_supabase_service_client() or get_supabase_client()
    if not client:
        raise HTTPException(status_code=503, detail="Client Supabase indisponible")
    return client


def _row_to_liked(row: dict) -> dict:
    deal = row.get("deal_data") or {}
    if isinstance(deal, dict) and not deal.get("id"):
        deal = {**deal, "id": row["deal_id"]}
    return {
        "id": row["id"],
        "deal_id": row["deal_id"],
        "deal_key": row.get("deal_key") or (deal.get("deal_key") if isinstance(deal, dict) else None),
        "deal": deal,
        "created_at": row.get("created_at"),
    }


@router.get("/api/deals/metrics")
async def deals_metrics(authorization: Optional[str] = Header(None)):
    """
    Observability snapshot (L11): latences process, caches, funnel bookings, go/no-go.
    Protégé par CRON_SECRET (ou service role côté ops).
    """
    require_cron(authorization)
    try:
        from deals.metrics import collect_deals_metrics

        supabase = None
        try:
            supabase = _svc()
        except HTTPException:
            supabase = None
        return collect_deals_metrics(supabase)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/deals")
async def list_deals(
    origin: Optional[str] = Query(
        None,
        description="IATA départ (un ou plusieurs: BVA ou CDG,ORY,BVA)",
    ),
    adults: Optional[int] = Query(None, ge=1, le=6),
    window: Optional[str] = Query(None, description="FRI_SUN | SAT_MON"),
    max_pp: Optional[float] = Query(None, ge=0, description="Budget max € / pers."),
):
    """List deals. Cache-only when DEALS_PROVIDER=liteapi; community when DEALS_SOURCE=community."""
    try:
        provider = get_deal_provider()
        return provider.list_deals(
            origin=origin,
            adults=adults,
            window=window,
            max_pp=max_pp,
        )
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/deals/calendar")
async def get_calendar(
    origin: str = Query(..., min_length=3, max_length=3, description="IATA départ"),
    slug: Optional[str] = Query(None, description="Slug destination"),
    destination_id: Optional[str] = Query(None),
    iata: Optional[str] = Query(None, description="IATA arrivée (ex. LIS)"),
    adults: int = Query(2, ge=1, le=6),
    window: str = Query("FRI_SUN", description="FRI_SUN | SAT_MON"),
):
    """
    Heatmap « meilleur week-end » — lecture cache uniquement (job min-rates, TTL 12 h).
    """
    if not slug and not destination_id and not iata:
        raise HTTPException(status_code=400, detail="slug, destination_id ou iata requis")
    try:
        from deals.calendar import get_deal_calendar

        supabase = _svc()
        data = get_deal_calendar(
            supabase,
            destination_slug=slug,
            destination_id=destination_id,
            iata_arrival=iata,
            origin=origin.upper(),
            adults=adults,
            window_kind=window,
        )
        if data is None:
            raise HTTPException(status_code=404, detail="Destination introuvable")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/liked-deals")
@optional_auth
async def list_liked_deals(request: Request):
    """List deals liked by the current user."""
    user_id = _require_user(request)
    try:
        supabase = _svc()
        result = (
            supabase.table("liked_deals")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return [_row_to_liked(row) for row in (result.data or [])]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur liked_deals: {str(e)}")


@router.get("/api/liked-deals/ids")
@optional_auth
async def list_liked_deal_ids(request: Request):
    """Lightweight list of liked deal ids for the current user."""
    user_id = _require_user(request)
    try:
        supabase = _svc()
        result = (
            supabase.table("liked_deals")
            .select("deal_id")
            .eq("user_id", user_id)
            .execute()
        )
        return [row["deal_id"] for row in (result.data or [])]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur liked_deals: {str(e)}")


@router.post("/api/liked-deals")
@optional_auth
async def like_deal(body: LikeDealRequest, request: Request):
    """Like (favorite) a deal for the current user."""
    user_id = _require_user(request)
    deal_id = (body.id or "").strip()
    if not deal_id:
        raise HTTPException(status_code=400, detail="deal id requis")

    try:
        supabase = _svc()
        existing = (
            supabase.table("liked_deals")
            .select("*")
            .eq("user_id", user_id)
            .eq("deal_id", deal_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            return _row_to_liked(existing.data[0])

        deal_data = body.model_dump()
        row = {
            "user_id": user_id,
            "deal_id": deal_id,
            "deal_data": deal_data,
        }
        deal_key = (body.deal_key or "").strip() or None
        if deal_key:
            row["deal_key"] = deal_key

        result = (
            supabase.table("liked_deals")
            .insert(row)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=500, detail="Erreur lors du like")
        liked = _row_to_liked(result.data[0])
        # L10: auto-enable price alert when deal_key present
        if deal_key:
            try:
                from deals.price_alerts import upsert_alert_for_like

                upsert_alert_for_like(
                    supabase,
                    user_id=user_id,
                    deal_key=deal_key,
                    price_pp=float(body.price_per_person or 0),
                )
            except Exception:
                pass
        return liked
    except HTTPException:
        raise
    except Exception as e:
        # Column deal_key may not exist yet — retry without it
        msg = str(e)
        if "deal_key" in msg.lower():
            try:
                supabase = _svc()
                result = (
                    supabase.table("liked_deals")
                    .insert({
                        "user_id": user_id,
                        "deal_id": deal_id,
                        "deal_data": body.model_dump(),
                    })
                    .execute()
                )
                if result.data:
                    return _row_to_liked(result.data[0])
            except Exception as e2:
                raise HTTPException(status_code=500, detail=f"Erreur liked_deals: {str(e2)}")
        raise HTTPException(status_code=500, detail=f"Erreur liked_deals: {msg}")


@router.delete("/api/liked-deals/{deal_id}")
@optional_auth
async def unlike_deal(deal_id: str, request: Request):
    """Remove a liked deal for the current user."""
    user_id = _require_user(request)
    try:
        supabase = _svc()
        try:
            from deals.price_alerts import delete_alert_for_unlike

            delete_alert_for_unlike(supabase, user_id=user_id, deal_id=deal_id)
        except Exception:
            pass
        supabase.table("liked_deals").delete().eq("user_id", user_id).eq(
            "deal_id", deal_id
        ).execute()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur liked_deals: {str(e)}")


@router.post("/api/deals/jobs/seed-destinations")
async def job_seed_destinations(authorization: Optional[str] = Header(None)):
    """Upsert the 10 curated destinations (no LiteAPI call)."""
    require_cron(authorization)
    try:
        from deals.hotel_pool import upsert_destinations

        supabase = _svc()
        rows = upsert_destinations(supabase)
        return {"upserted": len(rows), "slugs": [r.get("slug") for r in rows]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/bootstrap-hotel-pools")
async def job_bootstrap_hotel_pools(
    authorization: Optional[str] = Header(None),
    slug: Optional[str] = Query(None, description="Limiter à une destination (slug)"),
):
    """
    Mensuel / manuel : seed destinations + rebuild hotel_pool via LiteAPI /data/hotels.
    Requires LITEAPI_API_KEY_* and service role Supabase.
    """
    require_cron(authorization)
    try:
        from deals.hotel_pool import bootstrap_hotel_pools
        from deals.liteapi_config import load_deals_config

        cfg = load_deals_config()
        if not cfg.api_key:
            raise HTTPException(
                status_code=503,
                detail="Clé LiteAPI manquante (LITEAPI_API_KEY_SANDBOX ou _PROD)",
            )
        supabase = _svc()
        slugs = [slug] if slug else None
        summary = bootstrap_hotel_pools(supabase, cfg=cfg, slugs=slugs)
        return summary
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/refresh-deal-flights")
async def job_refresh_deal_flights(
    authorization: Optional[str] = Header(None),
    slug: Optional[str] = Query(None, description="Limiter à une destination (slug)"),
    origin: Optional[str] = Query(None, description="Limiter à une origine IATA"),
):
    """
    Upsert fenêtres canoniques + remplit deal_flight_cache (scan + rattachement §7).
    Pas d'appel LiteAPI. Protégé par CRON_SECRET.
    """
    require_cron(authorization)
    try:
        from deals.flight_cache import refresh_deal_flights
        from deals.liteapi_config import load_deals_config

        cfg = load_deals_config()
        supabase = _svc()
        slugs = [slug] if slug else None
        origins = [origin.strip().upper()] if origin else None
        summary = refresh_deal_flights(
            supabase, cfg=cfg, origins=origins, slugs=slugs
        )
        return summary
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/refresh-hotel-rates")
async def job_refresh_hotel_rates(
    authorization: Optional[str] = Header(None),
    slug: Optional[str] = Query(None, description="Limiter à une destination (slug)"),
    force: bool = Query(False, description="Ignorer TTL / is_due"),
):
    """
    Remplit hotel_rates_cache (LiteAPI /hotels/rates + scoring SSP).
    Skip si pas de vol en cache. Protégé par CRON_SECRET.
    """
    require_cron(authorization)
    try:
        from deals.hotel_rates import refresh_hotel_rates
        from deals.liteapi_config import load_deals_config

        cfg = load_deals_config()
        if not cfg.api_key:
            raise HTTPException(
                status_code=503,
                detail="Clé LiteAPI manquante (LITEAPI_API_KEY_SANDBOX ou _PROD)",
            )
        supabase = _svc()
        slugs = [slug] if slug else None
        summary = refresh_hotel_rates(
            supabase, cfg=cfg, slugs=slugs, force=force
        )
        # L10: after rates refresh, check liked-deal price drops
        try:
            from deals.price_alerts import run_price_alerts

            summary["price_alerts"] = run_price_alerts(supabase)
        except Exception as e:
            summary["price_alerts_error"] = str(e)
        return summary
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/check-price-alerts")
async def job_check_price_alerts(
    authorization: Optional[str] = Header(None),
    dry_run: bool = Query(False, description="Ne pas envoyer / maj baselines"),
):
    """Compare liked deals vs cache ; email si baisse ≥ seuil (défaut 8 %). CRON_SECRET."""
    require_cron(authorization)
    try:
        from deals.price_alerts import run_price_alerts

        supabase = _svc()
        return run_price_alerts(supabase, dry_run=dry_run)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/refresh-deal-calendar")
async def job_refresh_deal_calendar(
    authorization: Optional[str] = Header(None),
    slug: Optional[str] = Query(None, description="Limiter à une destination (slug)"),
    origin: Optional[str] = Query(None, description="Limiter à une origine IATA"),
    force: bool = Query(False, description="Ignorer TTL 12 h"),
):
    """
    Calendrier min-rates (8 week-ends) + jointure vols. Cache 12 h. CRON_SECRET.
    """
    require_cron(authorization)
    try:
        from deals.calendar import refresh_deal_calendar
        from deals.liteapi_config import load_deals_config

        cfg = load_deals_config()
        if not cfg.api_key:
            raise HTTPException(
                status_code=503,
                detail="Clé LiteAPI manquante (LITEAPI_API_KEY_SANDBOX ou _PROD)",
            )
        supabase = _svc()
        slugs = [slug] if slug else None
        origins = [origin.strip().upper()] if origin else None
        return refresh_deal_calendar(
            supabase, cfg=cfg, slugs=slugs, origins=origins, force=force
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ——— Deals v3 community jobs ———


@router.post("/api/deals/jobs/seed-city-mapping")
async def job_seed_city_mapping(authorization: Optional[str] = Header(None)):
    """D0: upsert served_cities + airport_city_mapping from CITY_FR_BY_IATA."""
    require_cron(authorization)
    try:
        from deals.city_mapping import upsert_city_mapping

        return upsert_city_mapping(_svc())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/build-seed-catalog")
async def job_build_seed_catalog(authorization: Optional[str] = Header(None)):
    """D2: auto-generate top seed cities (no manual list)."""
    require_cron(authorization)
    try:
        from deals.seed_catalog import build_seed_catalog

        return build_seed_catalog(_svc())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/seed-scan")
async def job_seed_scan(
    authorization: Optional[str] = Header(None),
    dry_run: bool = Query(False),
):
    """D2: scan seed catalog into price_observations (budget/day)."""
    require_cron(authorization)
    try:
        from deals.seed_catalog import seed_scan

        return seed_scan(_svc(), dry_run=dry_run)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/refresh-baselines")
async def job_refresh_baselines(authorization: Optional[str] = Header(None)):
    """D3: recompute route_price_baselines (30d)."""
    require_cron(authorization)
    try:
        from deals.baselines import refresh_route_baselines

        return refresh_route_baselines(_svc())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/promote-deals")
async def job_promote_deals(authorization: Optional[str] = Header(None)):
    """D4: promote observations → deals_active (+ optional hotel)."""
    require_cron(authorization)
    try:
        from deals.promote import promote_deals

        return promote_deals(_svc())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/revalidate-deals")
async def job_revalidate_deals(authorization: Optional[str] = Header(None)):
    """D5: background flight revalidation for deals_active."""
    require_cron(authorization)
    try:
        from deals.revalidate_community import revalidate_deals

        return revalidate_deals(_svc())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/archive-trip-drafts")
async def job_archive_trip_drafts(authorization: Optional[str] = Header(None)):
    """Archive expired anonymous Mon voyage drafts."""
    require_cron(authorization)
    try:
        from deals.my_trips import archive_expired_drafts

        return archive_expired_drafts(_svc())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/cached-kill-switch")
async def job_cached_kill_switch(authorization: Optional[str] = Header(None)):
    """Lot C4: auto-disable cached deals if honesty KPIs fail (7d)."""
    require_cron(authorization)
    try:
        from deals.click_checks import run_cached_kill_switch

        return run_cached_kill_switch(_svc())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class FlightClickRequest(BaseModel):
    deal_key: str
    verification_level: str = "live"
    displayed_pp: Optional[float] = None
    checked_pp: Optional[float] = None
    outcome: str = "unknown"
    source: str = "deals"
    draft_token: Optional[str] = None
    partner: Optional[str] = None


class FlightClickFeedbackRequest(BaseModel):
    feedback: str  # same | higher | gone
    check_id: Optional[str] = None
    draft_token: Optional[str] = None
    deal_key: Optional[str] = None


@router.post("/api/deals/flight-click")
async def flight_click(body: FlightClickRequest):
    """Lot C2: record outbound flight click (+ optional price check)."""
    try:
        from deals.click_checks import record_flight_click

        return record_flight_click(
            _svc(),
            deal_key=body.deal_key,
            verification_level=body.verification_level,
            displayed_pp=body.displayed_pp,
            checked_pp=body.checked_pp,
            outcome=body.outcome,
            source=body.source,
            draft_token=body.draft_token,
            partner=body.partner,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/flight-click/feedback")
async def flight_click_feedback(body: FlightClickFeedbackRequest):
    """Lot C3: user tap after partner tab — same / higher / gone (cached)."""
    try:
        from deals.click_checks import record_user_feedback

        return record_user_feedback(
            _svc(),
            check_id=body.check_id,
            draft_token=body.draft_token,
            deal_key=body.deal_key,
            feedback=body.feedback,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class RevalidateFlightRequest(BaseModel):
    adults: int = Field(2, ge=1, le=6)


@router.post("/api/deals/{deal_key}/revalidate-flight")
async def revalidate_flight_endpoint(deal_key: str, body: RevalidateFlightRequest):
    """Lot D3: live deal price check with N passengers."""
    try:
        from deals.revalidate_flight import revalidate_flight_for_passengers

        return revalidate_flight_for_passengers(
            _svc(), deal_key, adults=body.adults
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/jobs/seed-baggage-policies")
async def job_seed_baggage(authorization: Optional[str] = Header(None)):
    require_cron(authorization)
    try:
        from deals.airport_display import upsert_airport_distances
        from deals.baggage import upsert_baggage_policies

        sb = _svc()
        return {
            "baggage": upsert_baggage_policies(sb),
            "distances": upsert_airport_distances(sb),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ComposeHotelRequest(BaseModel):
    checkin: str
    checkout: str
    iata: Optional[str] = None
    city: Optional[str] = None
    adults: int = Field(2, ge=1, le=6)
    fetch: bool = False


@router.post("/api/deals/compose-hotel")
async def compose_hotel_endpoint(body: ComposeHotelRequest):
    """D0/L13: city name first, hotel details when ready."""
    try:
        from deals.compose_hotel import compose_hotel

        return compose_hotel(
            _svc(),
            checkin=body.checkin,
            checkout=body.checkout,
            iata=body.iata,
            city=body.city,
            adults=body.adults,
            fetch_if_miss=body.fetch,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class MyTripDraftRequest(BaseModel):
    deal_key: Optional[str] = None
    origin_iata: Optional[str] = None
    departure_airport: Optional[str] = None
    destination: Optional[str] = None
    city: Optional[str] = None
    dates: Dict[str, Any] = Field(default_factory=dict)
    adults: int = Field(2, ge=1, le=6)
    flight: Optional[Dict[str, Any]] = None
    hotel: Optional[Dict[str, Any]] = None
    price_per_person: Optional[float] = None
    payload: Optional[Dict[str, Any]] = None


@router.post("/api/deals/my-trip")
@optional_auth
async def create_my_trip(body: MyTripDraftRequest, request: Request):
    """
    Create anonymous « Mon voyage » draft (booking-oriented).
    Auth optional — claim later to save / invite / pay.
    """
    try:
        from deals.my_trips import create_draft

        user_id = get_user_id_from_token(request)
        payload = body.payload or body.model_dump(exclude={"payload"})
        draft = create_draft(
            _svc(),
            payload=payload,
            user_id=user_id,
            deal_key=body.deal_key,
        )
        return draft
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/deals/my-trip/{draft_token}")
async def get_my_trip(draft_token: str):
    try:
        from deals.my_trips import get_draft

        row = get_draft(_svc(), draft_token, touch_view=True)
        if not row:
            raise HTTPException(status_code=404, detail="Voyage introuvable ou expiré")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/my-trip/{draft_token}/claim")
async def claim_my_trip(draft_token: str, request: Request):
    """Attach draft to logged-in user (save / invite / pay)."""
    user_id = _require_user(request)
    try:
        from deals.my_trips import claim_draft

        row = claim_draft(_svc(), draft_token, user_id)
        if not row:
            raise HTTPException(status_code=404, detail="Voyage introuvable")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class MyTripEmailRequest(BaseModel):
    email: str
    consent: bool = False


@router.post("/api/deals/my-trip/{draft_token}/email")
async def email_my_trip(draft_token: str, body: MyTripEmailRequest):
    """Lot F — send /trip/:token via Resend (consent required, no account)."""
    try:
        from deals.my_trips import send_draft_email

        result = send_draft_email(
            _svc(),
            draft_token,
            email=body.email,
            consent=bool(body.consent),
        )
        if not result.get("ok"):
            err = result.get("error") or "failed"
            code = 400
            if err == "not_found":
                code = 404
            elif err == "email_not_sent":
                code = 502
            elif err in (
                "email_rate_limited",
                "draft_rate_limited",
                "global_email_rate_limited",
            ):
                code = 429
            raise HTTPException(status_code=code, detail=err)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/my-trip/{draft_token}/flight-booked")
async def my_trip_flight_booked(draft_token: str):
    """Lot F — « J'ai réservé mon vol ✓ » unlocks hotel step."""
    try:
        from deals.my_trips import mark_flight_booked

        row = mark_flight_booked(_svc(), draft_token)
        if not row:
            raise HTTPException(status_code=404, detail="Voyage introuvable")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/deals/{deal_id}")
async def get_deal(deal_id: str):
    """Get a single deal by id or deal_key."""
    try:
        provider = get_deal_provider()
        deal = provider.get_deal(deal_id)
        if not deal:
            raise HTTPException(status_code=404, detail="Deal introuvable")
        return deal
    except HTTPException:
        raise
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
