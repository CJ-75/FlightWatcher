"""Revalidate hotel offer + SSP margin calage (§5.4 / §5.5)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence

from deals.deal_assemble import get_deal_from_caches, parse_deal_key
from deals.hotel_scoring import extract_hotels_from_rates, iter_room_offers
from deals.liteapi_client import LiteApiClient, LiteApiError
from deals.liteapi_config import DealsConfig, load_deals_config
from deals.pricing import ceil_margin_pct, extract_rate_money, price_delta_action, price_per_person

logger = logging.getLogger("deals.revalidate")


def _best_offer_from_rates(payload: Any, hotel_id: str) -> Optional[Dict[str, Any]]:
    for hotel in extract_hotels_from_rates(payload):
        hid = str(hotel.get("hotelId") or hotel.get("hotel_id") or hotel.get("id") or "")
        if hid != str(hotel_id):
            continue
        offers = iter_room_offers(hotel)
        if not offers:
            return None
        # Prefer refundable breakfast, else cheapest public
        offers.sort(
            key=lambda o: (
                0 if o.get("refundable") else 1,
                float(o.get("public_hotel_price") or 999999),
            )
        )
        return offers[0]
    return None


def _fetch_single_hotel_rates(
    client: LiteApiClient,
    *,
    hotel_id: str,
    checkin: str,
    checkout: str,
    adults: int,
    margin: Optional[float] = None,
    timeout: float = 8.0,
) -> Any:
    body: Dict[str, Any] = {
        "hotelIds": [hotel_id],
        "checkin": checkin,
        "checkout": checkout,
        "occupancies": [{"adults": adults}],
        "maxRatesPerHotel": 5,
        "timeout": int(timeout),
    }
    if margin is not None:
        body["margin"] = float(margin)
    return client.hotels_rates(body, timeout=timeout)


def calage_margin_offer(
    client: LiteApiClient,
    *,
    hotel_id: str,
    checkin: str,
    checkout: str,
    adults: int,
    cfg: DealsConfig,
) -> Dict[str, Any]:
    """
    §5.4: rates → if SSP > retail, re-rates with margin so retail ≈ SSP.
    Returns offer dict + metadata.
    """
    payload = _fetch_single_hotel_rates(
        client,
        hotel_id=hotel_id,
        checkin=checkin,
        checkout=checkout,
        adults=adults,
        timeout=cfg.timeout_s,
    )
    offer = _best_offer_from_rates(payload, hotel_id)
    if not offer:
        return {"ok": False, "reason": "no_rates"}

    retail = offer.get("retail_total")
    ssp = offer.get("ssp_total")
    net = offer.get("net")
    public = float(offer.get("public_hotel_price") or 0)
    margin_pct_used: Optional[float] = None

    if (
        ssp is not None
        and retail is not None
        and net is not None
        and float(ssp) > float(retail)
    ):
        margin_pct = ceil_margin_pct(float(ssp), float(net), cfg.margin_max_pct)
        if margin_pct is not None:
            logger.info(
                "calage_margin hotel=%s ssp=%.2f retail=%.2f net=%.2f margin=%.1f",
                hotel_id,
                ssp,
                retail,
                net,
                margin_pct,
            )
            try:
                payload2 = _fetch_single_hotel_rates(
                    client,
                    hotel_id=hotel_id,
                    checkin=checkin,
                    checkout=checkout,
                    adults=adults,
                    margin=margin_pct,
                    timeout=cfg.timeout_s,
                )
                offer2 = _best_offer_from_rates(payload2, hotel_id)
                if offer2 and offer2.get("offer_id"):
                    r2 = float(offer2.get("retail_total") or 0)
                    # Accept if retail in [ssp, ssp * 1.01]
                    if float(ssp) <= r2 <= float(ssp) * 1.01 + 0.01:
                        offer = offer2
                        public = float(offer2.get("public_hotel_price") or r2)
                        margin_pct_used = margin_pct
                    else:
                        # Keep calaged offer anyway if closer to SSP
                        if abs(r2 - float(ssp)) < abs(float(retail) - float(ssp)):
                            offer = offer2
                            public = float(offer2.get("public_hotel_price") or r2)
                            margin_pct_used = margin_pct
                        logger.warning(
                            "calage_out_of_band hotel=%s retail=%.2f ssp=%.2f",
                            hotel_id,
                            r2,
                            ssp,
                        )
            except LiteApiError as e:
                logger.warning("calage_failed hotel=%s: %s — using first offer", hotel_id, e)

    return {
        "ok": True,
        "offer": offer,
        "public_hotel_price": public,
        "margin_pct_used": margin_pct_used,
        "ssp_total": offer.get("ssp_total"),
        "retail_total": offer.get("retail_total"),
        "excluded_fees": offer.get("excluded_fees") or 0,
        "ssp_source": offer.get("ssp_source"),
    }


def _deal_from_my_trip_draft(
    row: Dict[str, Any],
    *,
    hotel_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Synthetic deal shape for guest Mon voyage checkout (no community deal_key)."""
    if not row:
        return None
    payload = row.get("payload") or {}
    if not isinstance(payload, dict):
        payload = {}
    flight = payload.get("flight") or {}
    hotel = payload.get("hotel") or {}
    if not isinstance(hotel, dict):
        hotel = {}
    if hotel_id:
        hotel = {**hotel, "id": str(hotel_id)}
    dates = payload.get("dates") or {}
    out = row.get("out_date") or dates.get("outbound")
    inn = row.get("ret_date") or dates.get("inbound")
    if not out or not inn:
        return None
    hid = str(hotel.get("id") or hotel.get("hotel_id") or "").strip()
    if not hid:
        return None
    hotel = {**hotel, "id": hid}
    token = str(row.get("draft_token") or "")
    adults = int(row.get("adults") or payload.get("adults") or 2)
    flight_pp = float(
        (flight or {}).get("price_pp")
        or (payload.get("price_breakdown") or {}).get("flight_pp")
        or 0
    )
    hotel_total = hotel.get("public_hotel_price")
    if hotel_total is None:
        hotel_total = (payload.get("price_breakdown") or {}).get("hotel_public_total")
    pp = payload.get("price_per_person")
    if pp is None and hotel_total is not None:
        pp = round(price_per_person(flight_pp, float(hotel_total), adults), 2)
    return {
        "deal_key": f"mytrip-{token}" if token else "mytrip",
        "dates": {"outbound": str(out)[:10], "inbound": str(inn)[:10]},
        "adults": adults,
        "flight": flight if isinstance(flight, dict) else {},
        "hotel": hotel,
        "city": row.get("city_name") or payload.get("city"),
        "price_per_person": pp,
        "price_breakdown": payload.get("price_breakdown")
        or {
            "flight_pp": flight_pp,
            "hotel_public_total": float(hotel_total) if hotel_total is not None else None,
        },
    }


def revalidate_deal(
    supabase: Any,
    deal_key: str,
    *,
    hotel_id: Optional[str] = None,
    displayed_price_pp: Optional[float] = None,
    draft_token: Optional[str] = None,
    client: Optional[LiteApiClient] = None,
    cfg: Optional[DealsConfig] = None,
) -> Dict[str, Any]:
    """
    Live revalidation for checkout. May call LiteAPI (unlike GET /api/deals).
    Supports Mon voyage drafts via draft_token / mytrip-* deal_key when no community deal.
    """
    cfg = cfg or load_deals_config()
    owns = client is None
    client = client or LiteApiClient(cfg=cfg)
    if not cfg.api_key:
        raise LiteApiError("LiteAPI API key required for revalidate")

    try:
        deal: Optional[Dict[str, Any]] = None
        parsed = parse_deal_key(deal_key)
        if parsed:
            deal = get_deal_from_caches(supabase, deal_key)

        token = (draft_token or "").strip() or None
        if not token and str(deal_key or "").startswith("mytrip-"):
            token = str(deal_key)[len("mytrip-") :].strip() or None

        if not deal and token:
            from deals.my_trips import get_draft

            row = get_draft(supabase, token)
            deal = _deal_from_my_trip_draft(row or {}, hotel_id=hotel_id)

        if not deal:
            if not parsed and not token:
                return {"ok": False, "reason": "invalid_deal_key"}
            return {"ok": False, "reason": "deal_not_found"}

        checkin = deal["dates"]["outbound"]
        checkout = deal["dates"]["inbound"]
        adults = int(deal.get("adults") or (parsed or {}).get("adults") or 2)
        flight_pp = float(
            (deal.get("price_breakdown") or {}).get("flight_pp")
            or (deal.get("flight") or {}).get("price_pp")
            or 0
        )
        displayed = float(
            displayed_price_pp
            if displayed_price_pp is not None
            else deal.get("price_per_person")
            or 0
        )

        # Hotel candidates: selected → alts from deal
        candidates: List[Dict[str, Any]] = []
        if deal.get("hotel"):
            candidates.append(deal["hotel"])
        for h in deal.get("alt_hotels") or []:
            candidates.append(h)
        # Prefer requested hotel_id first
        if hotel_id:
            candidates = sorted(
                candidates,
                key=lambda h: 0 if str(h.get("id")) == str(hotel_id) else 1,
            )

        if not candidates:
            return {"ok": False, "reason": "no_hotel"}

        tried: List[str] = []
        last_reason = "unavailable"
        for cand in candidates[:3]:
            hid = str(cand.get("id") or "")
            if not hid or hid in tried:
                continue
            tried.append(hid)
            try:
                result = calage_margin_offer(
                    client,
                    hotel_id=hid,
                    checkin=checkin,
                    checkout=checkout,
                    adults=adults,
                    cfg=cfg,
                )
            except LiteApiError as e:
                last_reason = str(e)
                logger.warning("revalidate_hotel_fail hotel=%s: %s", hid, e)
                continue

            if not result.get("ok"):
                last_reason = result.get("reason") or "no_rates"
                continue

            public_hotel = float(result["public_hotel_price"])
            new_pp = round(price_per_person(flight_pp, public_hotel, adults), 2)
            action = price_delta_action(displayed, new_pp)
            is_last = cand is candidates[min(2, len(candidates) - 1)] or len(tried) >= 3

            # >10% delta → try next hotel in top 3
            if action == "fallback" and not is_last:
                logger.info(
                    "revalidate_fallback deal=%s from=%s delta pp %.2f→%.2f",
                    deal_key,
                    hid,
                    displayed,
                    new_pp,
                )
                continue

            offer = result["offer"]
            original_hotel_id = str((deal.get("hotel") or {}).get("id") or "")

            return {
                "ok": True,
                "action": action,
                "deal_key": deal_key,
                "hotel_id": hid,
                "hotel_name": cand.get("name") or offer.get("name"),
                "hotel_switched": original_hotel_id != hid,
                "offer_id": offer.get("offer_id"),
                "board": offer.get("board"),
                "refundable": bool(offer.get("refundable")),
                "cancel_deadline": offer.get("cancel_deadline"),
                "displayed_price_pp": displayed,
                "revalidated_price_pp": new_pp,
                "flight_pp": flight_pp,
                "public_hotel_price": public_hotel,
                "excluded_fees": result.get("excluded_fees") or 0,
                "ssp_total": result.get("ssp_total"),
                "retail_total": result.get("retail_total"),
                "margin_pct_used": result.get("margin_pct_used"),
                "ssp_source": result.get("ssp_source"),
                "checkin": checkin,
                "checkout": checkout,
                "adults": adults,
                "currency": cfg.currency,
                "payment_public_key": cfg.payment_public_key or None,
                "deal_snapshot": {
                    **deal,
                    "price_per_person": new_pp,
                    "hotel": {**(deal.get("hotel") or {}), **cand, "id": hid},
                    "price_breakdown": {
                        "flight_pp": flight_pp,
                        "hotel_public_total": public_hotel,
                        "excluded_fees": result.get("excluded_fees") or 0,
                    },
                },
            }

        return {
            "ok": False,
            "reason": "unavailable",
            "action": "fallback",
            "detail": last_reason,
            "tried_hotels": tried,
        }
    finally:
        if owns:
            client.close()
