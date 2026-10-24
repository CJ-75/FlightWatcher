"""
D5 — background revalidation of deals_active (flight freshness).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from deals.liteapi_config import DealsConfig, load_deals_config
from deals.observations import record_price_observations

logger = logging.getLogger("deals.revalidate_community")


def revalidate_deals(
    supabase,
    *,
    cfg: Optional[DealsConfig] = None,
    budget: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Re-scan precise routes for active deals (cheapest path: Ryanair-oriented scanner).
    Expire if unavailable or price +10%.
    """
    cfg = cfg or load_deals_config()
    budget = budget or cfg.revalidate_budget_per_hour
    now = datetime.now(timezone.utc)

    try:
        res = (
            supabase.table("deals_active")
            .select("*")
            .eq("status", "active")
            .order("view_count", desc=True)
            .limit(budget)
            .execute()
        )
        deals = res.data or []
    except Exception as e:
        return {"ok": False, "error": str(e)}

    from api_models import DateAvecHoraire
    from providers.orchestrator import search_roundtrips

    checked = 0
    expired = 0
    updated = 0
    price_up = 0

    for deal in deals:
        if checked >= budget:
            break
        origin = deal.get("origin_iata")
        dest = deal.get("dest_iata")
        out_d = str(deal.get("out_date") or "")[:10]
        ret_d = str(deal.get("ret_date") or "")[:10]
        snap = deal.get("flight_snapshot") or {}
        old_price = float(snap.get("price_pp_eur") or 0)
        if not origin or not dest or not out_d or not ret_d:
            continue

        # Prioritize stale
        last = deal.get("last_verified_at")
        try:
            last_dt = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            age_h = (now - last_dt).total_seconds() / 3600.0
        except Exception:
            age_h = 999

        dtd = (datetime.fromisoformat(out_d) - now.replace(tzinfo=None)).days if False else None
        try:
            dtd = (datetime.fromisoformat(out_d).date() - now.date()).days
        except Exception:
            dtd = 30
        tau = cfg.fresh_tau_short_h if dtd <= 7 else cfg.fresh_tau_h
        if age_h < tau * 0.5 and deal.get("view_count", 0) == 0:
            continue

        checked += 1
        try:
            trips, _ = search_roundtrips(
                aeroport_depart=origin,
                dates_depart=[DateAvecHoraire(date=out_d)],
                dates_retour=[DateAvecHoraire(date=ret_d)],
                budget_max=int(max(old_price * 1.5, cfg.max_flight_pp)),
                limite_allers=20,
                destinations_incluses=[dest],
                record_prices=False,
                passengers=1,
                direct=False,
            )
            match = [
                t
                for t in trips
                if (getattr(t, "destination_code", None) or "").upper() == dest.upper()
            ]
            if not match:
                supabase.table("deals_active").update(
                    {
                        "status": "expired",
                        "updated_at": now.isoformat(),
                        "last_verified_at": now.isoformat(),
                    }
                ).eq("deal_key", deal["deal_key"]).execute()
                expired += 1
                continue

            best = min(match, key=lambda t: float(getattr(t, "prix_total", 9999)))
            new_price = float(best.prix_total)
            record_price_observations(
                [best], source="revalidation", sync=True
            )

            snap = dict(snap)
            snap["price_pp_eur"] = new_price
            snap["booking_url"] = getattr(best, "booking_url", None) or snap.get(
                "booking_url"
            )
            patch: Dict[str, Any] = {
                "flight_snapshot": snap,
                "last_verified_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "expires_at": (now + timedelta(hours=tau * 2)).isoformat(),
            }
            if old_price > 0 and new_price >= old_price * 1.10:
                price_up += 1
                # Keep but mark; promote cycle may drop it
                bl = deal.get("baseline_snapshot") or {}
                bl = dict(bl)
                bl["price_increased"] = True
                patch["baseline_snapshot"] = bl
            supabase.table("deals_active").update(patch).eq(
                "deal_key", deal["deal_key"]
            ).execute()
            updated += 1
        except Exception as e:
            logger.warning("revalidate %s: %s", deal.get("deal_key"), e)

    return {
        "ok": True,
        "checked": checked,
        "updated": updated,
        "expired": expired,
        "price_up": price_up,
        "budget": budget,
    }
