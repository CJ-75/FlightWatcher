"""trip_items CRUD + draft→planned transfer — Lot A/E."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("activities.trip_items")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def transfer_trip_items_draft_to_planned(
    supabase,
    *,
    draft_id: str,
    planned_trip_id: str,
) -> Dict[str, Any]:
    """Reassign all trip_items from draft to planned trip (XOR owners)."""
    if not supabase or not draft_id or not planned_trip_id:
        return {"ok": False, "moved": 0, "error": "missing_ids"}
    try:
        res = (
            supabase.table("trip_items")
            .update(
                {
                    "draft_id": None,
                    "planned_trip_id": planned_trip_id,
                    "updated_at": _now_iso(),
                }
            )
            .eq("draft_id", draft_id)
            .execute()
        )
        n = len(res.data or [])
        return {"ok": True, "moved": n}
    except Exception as e:
        logger.warning("transfer_trip_items_draft_to_planned: %s", e)
        return {"ok": False, "moved": 0, "error": str(e)}


def list_trip_items(
    supabase,
    *,
    draft_id: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if not supabase:
        return []
    try:
        q = supabase.table("trip_items").select("*, places(*)")
        if draft_id:
            q = q.eq("draft_id", draft_id)
        elif planned_trip_id:
            q = q.eq("planned_trip_id", planned_trip_id)
        else:
            return []
        res = q.order("day_offset").order("sort_key").execute()
        return list(res.data or [])
    except Exception as e:
        logger.warning("list_trip_items: %s", e)
        return []


def add_activity_item(
    supabase,
    *,
    place_id: str,
    draft_id: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
    day_offset: int = 0,
    moment: Optional[str] = None,
    sort_key: str = "a0",
    user_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    if (draft_id is None) == (planned_trip_id is None):
        return None
    row = {
        "draft_id": draft_id,
        "planned_trip_id": planned_trip_id,
        "item_type": "activity",
        "place_id": place_id,
        "day_offset": int(day_offset or 0),
        "moment": moment,
        "sort_key": sort_key or "a0",
        "status": "idea",
        "availability_state": "ok",
        "added_by": user_id,
        "meta": meta or {},
        "updated_at": _now_iso(),
    }
    try:
        res = supabase.table("trip_items").insert(row).execute()
        return (res.data or [None])[0]
    except Exception as e:
        logger.warning("add_activity_item: %s", e)
        return None


def update_item_status(
    supabase,
    item_id: str,
    *,
    status: Optional[str] = None,
    availability_state: Optional[str] = None,
    sort_key: Optional[str] = None,
    day_offset: Optional[int] = None,
    moment: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    patch: Dict[str, Any] = {"updated_at": _now_iso()}
    if status:
        patch["status"] = status
    if availability_state:
        patch["availability_state"] = availability_state
    if sort_key is not None:
        patch["sort_key"] = sort_key
    if day_offset is not None:
        patch["day_offset"] = day_offset
    if moment is not None:
        patch["moment"] = moment
    try:
        res = (
            supabase.table("trip_items")
            .update(patch)
            .eq("id", item_id)
            .execute()
        )
        return (res.data or [None])[0]
    except Exception as e:
        logger.warning("update_item_status: %s", e)
        return None


def mark_items_needs_check_on_date_change(
    supabase,
    *,
    draft_id: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
) -> int:
    """Non-booked activities → availability_state=needs_check (keep status)."""
    items = list_trip_items(
        supabase, draft_id=draft_id, planned_trip_id=planned_trip_id
    )
    n = 0
    for it in items:
        if it.get("item_type") != "activity":
            continue
        if it.get("status") == "booked":
            continue
        if update_item_status(
            supabase, it["id"], availability_state="needs_check"
        ):
            n += 1
    return n
