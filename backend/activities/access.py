"""Authorization helpers for trip_items / planned trips (service-role safe)."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException, Request


def draft_id_from_token(supabase, token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    from deals.my_trips import get_draft

    row = get_draft(supabase, token)
    return str(row["id"]) if row and row.get("id") else None


def require_draft_token(supabase, token: Optional[str]) -> str:
    draft_id = draft_id_from_token(supabase, token)
    if not draft_id:
        raise HTTPException(status_code=403, detail="draft_token_invalid")
    return draft_id


def user_id_from_request(request: Request) -> Optional[str]:
    try:
        from auth_middleware import get_user_id_from_token

        return get_user_id_from_token(request)
    except Exception:
        return None


def user_can_access_planned_trip(supabase, trip_id: str, user_id: str) -> bool:
    if not supabase or not trip_id or not user_id:
        return False
    try:
        trip = (
            supabase.table("planned_trips")
            .select("id,organizer_id")
            .eq("id", trip_id)
            .limit(1)
            .execute()
        )
        if not trip.data:
            return False
        row = trip.data[0]
        if row.get("organizer_id") == user_id:
            return True
        mem = (
            supabase.table("trip_members")
            .select("id")
            .eq("trip_id", trip_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return bool(mem.data)
    except Exception:
        return False


def require_planned_trip_member(supabase, request: Request, planned_trip_id: str) -> str:
    uid = user_id_from_request(request)
    if not uid:
        raise HTTPException(status_code=401, detail="auth_required")
    if not user_can_access_planned_trip(supabase, planned_trip_id, uid):
        raise HTTPException(status_code=403, detail="not_a_member")
    return uid


def get_trip_item(supabase, item_id: str) -> Optional[dict]:
    try:
        res = (
            supabase.table("trip_items")
            .select("id,draft_id,planned_trip_id,item_type,status,meta,place_id")
            .eq("id", item_id)
            .limit(1)
            .execute()
        )
        return (res.data or [None])[0]
    except Exception:
        return None


def assert_can_mutate_item(
    supabase,
    request: Request,
    item: dict,
    *,
    draft_token: Optional[str] = None,
) -> None:
    """Caller must own the draft (token) or be a planned_trip member."""
    draft_id = item.get("draft_id")
    planned_id = item.get("planned_trip_id")
    if draft_id:
        resolved = require_draft_token(supabase, draft_token)
        if resolved != str(draft_id):
            raise HTTPException(status_code=403, detail="draft_token_mismatch")
        return
    if planned_id:
        require_planned_trip_member(supabase, request, str(planned_id))
        return
    raise HTTPException(status_code=400, detail="orphan_item")


def resolve_owner_for_write(
    supabase,
    request: Request,
    *,
    draft_token: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
) -> tuple[Optional[str], Optional[str]]:
    """
    Returns (draft_id, planned_trip_id) after auth.
    Exactly one owner required.
    """
    if bool(draft_token) == bool(planned_trip_id):
        raise HTTPException(status_code=400, detail="exactly_one_owner")
    if draft_token:
        return require_draft_token(supabase, draft_token), None
    require_planned_trip_member(supabase, request, str(planned_trip_id))
    return None, str(planned_trip_id)
