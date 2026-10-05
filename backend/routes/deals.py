from fastapi import APIRouter, HTTPException

from deals.provider import get_deal_provider

router = APIRouter()


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
