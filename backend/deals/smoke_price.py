"""
v3.3 Lot E — smoke test: card price ≈ my-trip ≈ hotel quote (sandbox).

  cd backend && python -m deals.smoke_price

Exit 0 on pass / intentional skip; non-zero on real price drift.
"""
from __future__ import annotations

import os
import sys
from typing import Any, Dict, Optional


def _tol_pct() -> float:
    try:
        return max(0.0, float(os.getenv("DEALS_PRICE_SMOKE_TOLERANCE_PCT", "5")))
    except (TypeError, ValueError):
        return 5.0


def compare_prices(
    card_pp: float,
    trip_pp: float,
    *,
    prebook_pp: Optional[float] = None,
    tol_pct: Optional[float] = None,
) -> Dict[str, Any]:
    tol = _tol_pct() if tol_pct is None else float(tol_pct)

    def _delta(a: float, b: float) -> float:
        if a == 0 and b == 0:
            return 0.0
        base = max(abs(a), abs(b), 1e-6)
        return abs(a - b) / base * 100.0

    d_trip = _delta(card_pp, trip_pp)
    ok = d_trip <= tol
    out: Dict[str, Any] = {
        "card_pp": card_pp,
        "trip_pp": trip_pp,
        "delta_card_trip_pct": round(d_trip, 3),
        "tol_pct": tol,
        "ok": ok,
    }
    if prebook_pp is not None:
        d_pb = _delta(trip_pp, float(prebook_pp))
        out["prebook_pp"] = float(prebook_pp)
        out["delta_trip_prebook_pct"] = round(d_pb, 3)
        out["ok"] = ok and d_pb <= tol
    return out


def run_smoke(supabase: Any = None) -> Dict[str, Any]:
    """
    Best-effort live smoke. Skips cleanly without keys / deals.
    """
    if os.getenv("DEALS_PRICE_SMOKE_SKIP", "").strip() in ("1", "true", "yes"):
        return {"ok": True, "skipped": True, "reason": "DEALS_PRICE_SMOKE_SKIP"}

    try:
        from deals.liteapi_config import load_deals_config
        from supabase_deps import get_supabase_client, get_supabase_service_client

        cfg = load_deals_config()
        sb = supabase or get_supabase_service_client() or get_supabase_client()
        if not sb:
            return {"ok": True, "skipped": True, "reason": "no_supabase"}
        if not cfg.api_key:
            return {"ok": True, "skipped": True, "reason": "no_liteapi_key"}

        res = (
            sb.table("deals_active")
            .select("*")
            .eq("status", "active")
            .eq("verification_level", "live")
            .limit(20)
            .execute()
        )
        rows = list(res.data or [])
        pick = None
        for row in rows:
            hotels = row.get("hotel_top3") or []
            if not isinstance(hotels, list) or not hotels:
                continue
            h0 = hotels[0] if isinstance(hotels[0], dict) else None
            if not h0:
                continue
            pub = h0.get("public_hotel_price") or h0.get("public_price")
            if pub:
                pick = row
                break
        if not pick:
            return {"ok": True, "skipped": True, "reason": "no_bookable_deal"}

        from deals.community_list import row_to_travel_deal
        from deals.draft_pricing import trust_create_payload

        deal = row_to_travel_deal(pick, adults=2, baselines_fresh=True)
        card_pp = float(deal.get("price_per_person") or 0)
        hotel = (pick.get("hotel_top3") or [None])[0]
        payload = {
            "deal_key": pick.get("deal_key"),
            "adults": 2,
            "dates": {
                "outbound": str(pick.get("out_date") or "")[:10],
                "inbound": str(pick.get("ret_date") or "")[:10],
            },
            "hotel": hotel,
            "flight": deal.get("flight") or {},
            # Intentionally wrong client price — server must ignore
            "price_per_person": card_pp * 3,
        }
        priced = trust_create_payload(sb, payload)
        trip_pp = float((priced or {}).get("price_per_person") or 0)
        result = compare_prices(card_pp, trip_pp)
        result["deal_key"] = pick.get("deal_key")
        result["price_trust"] = (priced or {}).get("price_trust")
        result["skipped"] = False
        if os.getenv("DEALS_PRICE_SMOKE_PREBOOK", "").strip() in ("1", "true"):
            result["prebook_note"] = "prebook path not auto-called (set harness)"
        return result
    except Exception as e:
        return {"ok": False, "error": str(e)}


def main() -> int:
    out = run_smoke()
    print(out)
    if out.get("skipped"):
        return 0
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
