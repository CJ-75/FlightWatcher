"""Public Pop SEO helpers — price island + Next revalidation trigger."""
from __future__ import annotations

import os
import time
import urllib.request
from typing import Any, Dict, Optional, Tuple  # noqa: F401 — Optional used in Query/hints

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

# origin|dest_city → (at, payload)
_PRICE_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_PRICE_TTL_S = float(os.getenv("POP_PRICE_CACHE_TTL_S") or 3600)

# city_slug → IATA list for deals wall
_CITY_IATA: Dict[str, str] = {
    "paris": "CDG,ORY,BVA",
    "lyon": "LYS",
    "marseille": "MRS",
    "nice": "NCE",
    "bordeaux": "BOD",
    "toulouse": "TLS",
    "nantes": "NTE",
    "lille": "LIL",
    "lisbon": "LIS",
    "lisbonne": "LIS",
    "porto": "OPO",
    "barcelone": "BCN",
    "barcelona": "BCN",
    "rome": "FCO,CIA",
    "milan": "MXP,BGY,LIN",
    "amsterdam": "AMS",
    "bruxelles": "BRU,CRL",
    "londres": "STN,LTN,LGW,LHR",
    "london": "STN,LTN,LGW,LHR",
}


def _norm_city(raw: str) -> str:
    return (
        str(raw or "")
        .strip()
        .lower()
        .replace(" ", "-")
        .replace("_", "-")
    )


@router.get("/api/pop/price")
def pop_weekend_price(
    origin: str = Query(..., min_length=3, description="IATA départ, ex. LYS ou CDG,ORY"),
    dest_city: str = Query(..., min_length=2, description="city_slug arrivée, ex. paris"),
):
    """
    Prix week-end depuis origin → ville Pop.
    Cache 1 h par couple (origin, dest_city) — partagé entre tous les Pops de la ville.
    """
    origin_u = ",".join(
        p.strip().upper() for p in str(origin).split(",") if p.strip()
    )
    city = _norm_city(dest_city)
    if not origin_u or not city:
        raise HTTPException(status_code=400, detail="origin_and_dest_required")

    cache_key = f"{origin_u}|{city}"
    now = time.time()
    hit = _PRICE_CACHE.get(cache_key)
    if hit and now - hit[0] < _PRICE_TTL_S:
        body = dict(hit[1])
        body["cached"] = True
        return body

    dest = _CITY_IATA.get(city) or city.upper()[:3]
    try:
        from deals.provider import get_deal_provider

        provider = get_deal_provider()
        raw = provider.list_deals(
            origin=origin_u,
            destination=dest,
            adults=2,
            duration="weekend",
            limit=12,
        )
    except Exception as e:
        return {
            "ok": False,
            "price_pp": None,
            "priced_at": None,
            "error": str(e)[:200],
            "origin": origin_u,
            "dest_city": city,
        }

    deals = []
    if isinstance(raw, dict):
        deals = raw.get("deals") or raw.get("items") or []
    elif isinstance(raw, list):
        deals = raw

    best: Optional[Dict[str, Any]] = None
    best_pp: Optional[float] = None
    for d in deals:
        if not isinstance(d, dict):
            continue
        pp = d.get("price_pp")
        if pp is None:
            pp = d.get("price_per_person")
        try:
            val = float(pp)
        except (TypeError, ValueError):
            continue
        if best_pp is None or val < best_pp:
            best_pp = val
            best = d

    priced_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if best_pp is None or best is None:
        payload = {
            "ok": True,
            "price_pp": None,
            "flight_pp": None,
            "hotel_pp": None,
            "priced_at": priced_at,
            "origin": origin_u,
            "dest_city": city,
            "cached": False,
        }
    else:
        flight_pp = best.get("flight_pp") or best.get("flight_price_pp")
        hotel_pp = best.get("hotel_pp") or best.get("public_hotel_price")
        try:
            flight_pp = float(flight_pp) if flight_pp is not None else None
        except (TypeError, ValueError):
            flight_pp = None
        try:
            hotel_pp = float(hotel_pp) if hotel_pp is not None else None
        except (TypeError, ValueError):
            hotel_pp = None
        payload = {
            "ok": True,
            "price_pp": round(best_pp),
            "flight_pp": round(flight_pp) if flight_pp is not None else None,
            "hotel_pp": round(hotel_pp) if hotel_pp is not None else None,
            "priced_at": priced_at,
            "origin": origin_u,
            "dest_city": city,
            "deal_id": best.get("id") or best.get("deal_id"),
            "cached": False,
        }

    _PRICE_CACHE[cache_key] = (now, payload)
    return payload


def ping_next_revalidate(
    city_slug: Optional[str] = None,
    slug: Optional[str] = None,
) -> Dict[str, Any]:
    """Fire-and-forget friendly: POST POP_REVALIDATE_URL (Next /api/revalidate)."""
    url = (os.getenv("POP_REVALIDATE_URL") or "").strip()
    if not url:
        return {"ok": True, "skipped": True, "reason": "POP_REVALIDATE_URL unset"}
    secret = (os.getenv("POP_REVALIDATE_SECRET") or "").strip()
    city = _norm_city(city_slug or "")
    s = (slug or "").strip()
    body = f'{{"city":"{city}","slug":"{s}"}}'.encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-revalidate-secret": secret,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return {"ok": True, "status": resp.status}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@router.post("/api/pop/revalidate")
def pop_revalidate(
    city_slug: Optional[str] = None,
    slug: Optional[str] = None,
    secret: Optional[str] = Query(None),
):
    """
    Ping Next.js revalidate after admin publish.
    Env: POP_REVALIDATE_URL + POP_REVALIDATE_SECRET
    """
    expected = (os.getenv("POP_REVALIDATE_SECRET") or "").strip()
    if expected and (secret or "") != expected:
        raise HTTPException(status_code=401, detail="unauthorized")
    return ping_next_revalidate(city_slug=city_slug, slug=slug)
