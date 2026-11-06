import logging
import secrets
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from supabase_deps import (
    SUPABASE_AVAILABLE,
    get_supabase_client,
    get_supabase_service_client,
    get_user_id_from_token,
    optional_auth,
)

logger = logging.getLogger("routes.user")
router = APIRouter()


class DeleteAccountBody(BaseModel):
    confirm: str = Field(
        default="",
        description="Must be SUPPRIMER to confirm irreversible account deletion",
    )


@router.get("/api/auth/me")
@optional_auth
async def get_current_user(request: Request):
    """Récupère les informations de l'utilisateur connecté"""
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")

    user_id = get_user_id_from_token(request)
    if not user_id:
        return {"authenticated": False}

    try:
        supabase = get_supabase_client()

        profile_result = supabase.table("user_profiles")\
            .select("*")\
            .eq("id", user_id)\
            .execute()

        profile = profile_result.data[0] if profile_result.data else None

        return {
            "authenticated": True,
            "user_id": user_id,
            "profile": profile,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/api/user/profile")
@optional_auth
async def update_user_profile(request: Request):
    """Met à jour le profil utilisateur"""
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")

    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")

    try:
        body = await request.json()
        supabase = get_supabase_client()

        if not body.get("referral_code"):
            body["referral_code"] = secrets.token_urlsafe(8).upper()[:8]

        result = supabase.table("user_profiles")\
            .upsert({
                "id": user_id,
                **body,
                "last_active": datetime.now().isoformat(),
            })\
            .execute()

        return {"success": True, "profile": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


def _best_effort_detach_then_delete_user(svc, user_id: str) -> None:
    """Hard-delete auth user + profile/likes only.

    Keep operational rows (bookings, drafts, planned trips + their dates):
    detach user FKs, then delete auth.users (SET NULL where migrated).
    """
    now = datetime.now().isoformat()

    # Detach — do not delete stay/booking history.
    detach_updates = (
        ("hotel_bookings", {"user_id": None, "updated_at": now}),
        ("my_trip_drafts", {"user_id": None, "updated_at": now}),
        ("planned_trips", {"organizer_id": None, "updated_at": now}),
    )
    for table, patch in detach_updates:
        try:
            col = "organizer_id" if table == "planned_trips" else "user_id"
            svc.table(table).update(patch).eq(col, user_id).execute()
        except Exception as e:
            logger.debug("delete_account detach %s: %s", table, e)

    # Personal prefs / profile — safe to remove with the account.
    delete_rows = (
        ("user_profiles", "id"),
        ("liked_deals", "user_id"),
        ("liked_activities", "user_id"),
        ("liked_airports", "user_id"),
        ("saved_searches", "user_id"),
        ("price_alerts", "user_id"),
        ("saved_favorites", "user_id"),
        ("planned_trip_members", "user_id"),
    )
    for table, col in delete_rows:
        try:
            svc.table(table).delete().eq(col, user_id).execute()
        except Exception as e:
            logger.debug("delete_account cleanup %s: %s", table, e)


def _delete_account_for_user(user_id: str, confirm: str) -> dict:
    if (confirm or "").strip().upper() not in ("SUPPRIMER", "DELETE", "YES"):
        raise HTTPException(
            status_code=400,
            detail='Confirme avec confirm: "SUPPRIMER"',
        )
    svc = get_supabase_service_client()
    if not svc:
        raise HTTPException(status_code=503, detail="Service auth indisponible")
    _best_effort_detach_then_delete_user(svc, user_id)
    try:
        svc.auth.admin.delete_user(user_id)
    except Exception as e:
        logger.exception("delete_account auth: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Impossible de supprimer le compte — réessaie ou contacte le support",
        )
    return {"ok": True, "deleted": True, "data_preserved": True}


@router.post("/api/user/account/delete")
@optional_auth
async def delete_account(request: Request, body: DeleteAccountBody):
    """Irreversible account deletion (App Store / Play guideline)."""
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    return _delete_account_for_user(user_id, body.confirm)
