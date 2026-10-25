"""
v3.3 Lot B — refresh hotel rates for real deals_active dates (not only week-ends).

Creates FREE deal_windows for each (checkin, checkout), then reuses
hotel_rates.refresh_one_combo (flight gate skipped for FREE kind).
"""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from deals.hotel_rates import is_due, refresh_one_combo
from deals.liteapi_client import LiteApiClient, LiteApiError
from deals.liteapi_config import DealsConfig, load_deals_config
from deals.upsell import find_destination_by_iata
from deals.windows import upsert_windows

logger = logging.getLogger("deals.refresh_deal_rates")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def free_window(checkin: date, checkout: date) -> Dict[str, Any]:
    nights = max(1, (checkout - checkin).days)
    return {
        "id": f"FREE-{checkin.isoformat()}-{checkout.isoformat()}",
        "kind": "FREE",
        "checkin": checkin.isoformat(),
        "checkout": checkout.isoformat(),
        "nights": nights,
    }


def _parse_ymd(s: Any) -> Optional[date]:
    try:
        return date.fromisoformat(str(s)[:10])
    except (TypeError, ValueError):
        return None


def _priority_origins() -> Set[str]:
    raw = os.getenv("SEED_PRIORITY_ORIGINS", "BVA,MRS,NTE,BOD,TLS,LYS") or ""
    return {x.strip().upper() for x in raw.split(",") if x.strip()}


def _collect_combos(
    supabase: Any,
    *,
    adults: Sequence[int],
) -> List[Dict[str, Any]]:
    try:
        res = (
            supabase.table("deals_active")
            .select(
                "origin_iata,dest_iata,out_date,ret_date,verification_level,status"
            )
            .eq("status", "active")
            .limit(2000)
            .execute()
        )
    except Exception as e:
        logger.warning("deals_active read failed: %s", e)
        return []

    pri = _priority_origins()
    seen: Set[Tuple[str, str, str, int]] = set()
    combos: List[Dict[str, Any]] = []
    dest_cache: Dict[str, Optional[Dict[str, Any]]] = {}

    for row in res.data or []:
        cin = _parse_ymd(row.get("out_date"))
        cout = _parse_ymd(row.get("ret_date"))
        if not cin or not cout or cout <= cin:
            continue
        iata = str(row.get("dest_iata") or "").upper()
        if len(iata) != 3:
            continue
        if iata not in dest_cache:
            dest_cache[iata] = find_destination_by_iata(supabase, iata)
        dest = dest_cache[iata]
        if not dest:
            continue
        origin = str(row.get("origin_iata") or "").upper()
        vlevel = str(row.get("verification_level") or "cached")
        for a in adults:
            key = (str(dest["id"]), cin.isoformat(), cout.isoformat(), int(a))
            if key in seen:
                continue
            seen.add(key)
            rank = 0
            if origin in pri:
                rank -= 100
            if vlevel == "live":
                rank -= 10
            combos.append(
                {
                    "dest": dest,
                    "checkin": cin,
                    "checkout": cout,
                    "adults": int(a),
                    "origin": origin,
                    "verification_level": vlevel,
                    "rank": rank,
                }
            )

    combos.sort(
        key=lambda c: (
            c["rank"],
            c["checkin"].isoformat(),
            c["dest"].get("slug") or "",
        )
    )
    return combos


def refresh_deal_rates(
    supabase: Any,
    *,
    client: Optional[LiteApiClient] = None,
    cfg: Optional[DealsConfig] = None,
    force: bool = False,
    max_calls: Optional[int] = None,
) -> Dict[str, Any]:
    cfg = cfg or load_deals_config()
    max_calls = (
        max_calls
        if max_calls is not None
        else max(1, _env_int("DEALS_RATES_REFRESH_MAX_CALLS", 120))
    )
    owns = client is None
    client = client or LiteApiClient(cfg=cfg)
    if not cfg.api_key:
        if owns:
            try:
                client.close()
            except Exception:
                pass
        raise LiteApiError("LiteAPI API key required for refresh_deal_rates")

    adults = list(cfg.occupancies) or [2]
    combos = _collect_combos(supabase, adults=adults)
    by_id = {
        free_window(c["checkin"], c["checkout"])["id"]: free_window(
            c["checkin"], c["checkout"]
        )
        for c in combos
    }
    if by_id:
        upsert_windows(supabase, list(by_id.values()))

    results: List[Dict[str, Any]] = []
    api_calls = 0
    skipped_budget = 0

    try:
        for item in combos:
            dest = item["dest"]
            w = free_window(item["checkin"], item["checkout"])
            adults_n = item["adults"]
            key = f"{dest.get('slug')}|{w['id']}|a{adults_n}"

            if not force and not is_due(
                supabase,
                destination_id=dest["id"],
                window_id=w["id"],
                adults=adults_n,
            ):
                results.append({"key": key, "status": "skipped_fresh"})
                continue

            if api_calls >= max_calls:
                skipped_budget += 1
                results.append({"key": key, "status": "skipped_budget"})
                continue

            out = refresh_one_combo(
                supabase,
                client,
                dest=dest,
                window=w,
                adults=adults_n,
                cfg=cfg,
                force=force,
                require_flight=False,
            )
            results.append(out)
            if out.get("status") not in ("skipped_fresh", "skipped_budget"):
                api_calls += 1
    finally:
        if owns:
            try:
                client.close()
            except Exception:
                pass

    summary = {
        "ok": True,
        "combos": len(combos),
        "windows": len(by_id),
        "ok_count": sum(1 for r in results if r.get("status") == "ok"),
        "no_rates": sum(1 for r in results if r.get("status") == "no_rates"),
        "skipped_fresh": sum(
            1 for r in results if r.get("status") == "skipped_fresh"
        ),
        "skipped_budget": sum(
            1 for r in results if r.get("status") == "skipped_budget"
        )
        + skipped_budget,
        "errors": sum(1 for r in results if r.get("status") == "error"),
        "api_calls": api_calls,
        "max_calls": max_calls,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    logger.info(
        "refresh_deal_rates done combos=%s ok=%s budget_skip=%s calls=%s",
        summary["combos"],
        summary["ok_count"],
        summary["skipped_budget"],
        summary["api_calls"],
    )
    return summary
