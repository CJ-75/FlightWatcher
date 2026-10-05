"""Deals listing + user liked deals."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

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
    """Snapshot of the deal at like time."""
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
        "deal": deal,
        "created_at": row.get("created_at"),
    }


@router.get("/api/deals")
async def list_deals():
    """List weekend travel packs (mock or partner provider)."""
    try:
        provider = get_deal_provider()
        return provider.list_deals()
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
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
        result = (
            supabase.table("liked_deals")
            .insert({
                "user_id": user_id,
                "deal_id": deal_id,
                "deal_data": deal_data,
            })
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=500, detail="Erreur lors du like")
        return _row_to_liked(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur liked_deals: {str(e)}")


@router.delete("/api/liked-deals/{deal_id}")
@optional_auth
async def unlike_deal(deal_id: str, request: Request):
    """Remove a liked deal for the current user."""
    user_id = _require_user(request)
    try:
        supabase = _svc()
        supabase.table("liked_deals").delete().eq("user_id", user_id).eq(
            "deal_id", deal_id
        ).execute()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur liked_deals: {str(e)}")


@router.get("/api/deals/{deal_id}")
async def get_deal(deal_id: str):
    """Get a single deal by id."""
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
