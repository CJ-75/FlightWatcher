"""Hotel upsell for Search / Planner — cache sync + async on-demand."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from supabase_deps import (
    SUPABASE_AVAILABLE,
    get_supabase_client,
    get_supabase_service_client,
    get_user_id_from_token,
    optional_auth,
)

router = APIRouter()


def _svc():
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    client = get_supabase_service_client() or get_supabase_client()
    if not client:
        raise HTTPException(status_code=503, detail="Client Supabase indisponible")
    return client


def _bucket(request: Request) -> str:
    uid = get_user_id_from_token(request)
    if uid:
        return f"user:{uid}"
    # coarse anon bucket by forwarded IP
    fwd = request.headers.get("x-forwarded-for") or ""
    ip = (fwd.split(",")[0] or request.client.host if request.client else "anon").strip()
    return f"ip:{ip or 'anon'}"


class UpsellItem(BaseModel):
    iata: str = Field(..., min_length=3, max_length=3)
    checkin: str
    checkout: str
    participants: int = Field(2, ge=1, le=6)
    flight_pp: Optional[float] = Field(None, ge=0)


class UpsellLookupRequest(BaseModel):
    items: List[UpsellItem] = Field(default_factory=list)


class UpsellFetchRequest(BaseModel):
    iata: str = Field(..., min_length=3, max_length=3)
    checkin: str
    checkout: str
    participants: int = Field(2, ge=1, le=6)
    flight_pp: Optional[float] = Field(None, ge=0)


@router.post("/api/deals/hotel-upsell/lookup")
async def upsell_lookup(body: UpsellLookupRequest):
    """
    Batch cache-only lookup. Never calls LiteAPI.
    status per item: ready | miss | pending | unavailable
    """
    try:
        from deals.upsell import batch_lookup

        supabase = _svc()
        items = [i.model_dump() for i in (body.items or [])]
        return {"results": batch_lookup(supabase, items)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/hotel-upsell/fetch")
@optional_auth
async def upsell_fetch(body: UpsellFetchRequest, request: Request):
    """
    Start on-demand LiteAPI rates job (3 h cache). Rate-limited per user/IP.
    Non-blocking for flight UI — poll GET .../jobs/{id} or re-lookup.
    """
    try:
        from deals.upsell import start_upsell_fetch

        supabase = _svc()
        result = start_upsell_fetch(
            supabase,
            iata=body.iata.upper(),
            checkin=body.checkin,
            checkout=body.checkout,
            participants=body.participants,
            rate_bucket=_bucket(request),
            flight_pp=body.flight_pp,
        )
        if result.get("status") == "rate_limited":
            raise HTTPException(status_code=429, detail="Trop de demandes hôtel — réessaie plus tard")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/deals/hotel-upsell/jobs/{job_id}")
async def upsell_job(job_id: str):
    from deals.upsell import get_upsell_job

    job = get_upsell_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job introuvable")
    return job
