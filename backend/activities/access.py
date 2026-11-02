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


def _draft_source_planned_trip_id(supabase, draft_id: str) -> Optional[str]:
    if not supabase or not draft_id:
        return None
    try:
        res = (
            supabase.table("my_trip_drafts")
            .select("source_planned_trip_id")
            .eq("id", draft_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        raw = res.data[0].get("source_planned_trip_id")
        return str(raw) if raw else None
    except Exception:
        return None


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

    Preference: collaborative Planner when available.
    - both draft + planned → planned (if member)
    - draft linked via source_planned_trip_id → planned (if member)
    Otherwise keep the draft owner (solo / guest).
    """
    has_draft = bool(draft_token and str(draft_token).strip())
    has_planned = bool(planned_trip_id and str(planned_trip_id).strip())
    if not has_draft and not has_planned:
        raise HTTPException(status_code=400, detail="exactly_one_owner")

    # Explicit planned (alone or with draft) wins when the caller is a member.
    if has_planned:
        try:
            require_planned_trip_member(supabase, request, str(planned_trip_id))
            return None, str(planned_trip_id)
        except HTTPException:
            if not has_draft:
                raise

    if has_draft:
        draft_id = require_draft_token(supabase, draft_token)
        source = _draft_source_planned_trip_id(supabase, draft_id)
        if source:
            uid = user_id_from_request(request)
            if uid and user_can_access_planned_trip(supabase, source, uid):
                # Linked séjour → ideas belong on the Planner, not only réservations.
                return None, source
        return draft_id, None

    raise HTTPException(status_code=400, detail="exactly_one_owner")
