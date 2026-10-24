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


@router.get("/api/deals")
async def list_deals(
    origin: Optional[str] = Query(None, description="IATA départ"),
    adults: Optional[int] = Query(None, ge=1, le=6),
    window: Optional[str] = Query(None, description="FRI_SUN | SAT_MON"),
    max_pp: Optional[float] = Query(None, ge=0, description="Budget max € / pers."),
):
    """List weekend vol+hôtel deals. Cache-only when DEALS_PROVIDER=liteapi (L5)."""
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
