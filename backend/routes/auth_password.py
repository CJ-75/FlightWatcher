"""Password change / reset emails via Supabase recovery link + Resend."""
from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request

from email_notify import WEB_APP_URL, send_password_reset_email
from supabase_deps import (
    SUPABASE_AVAILABLE,
    get_supabase_service_client,
    get_user_id_from_token,
    optional_auth,
)

router = APIRouter()


def _extract_action_link(payload: Any) -> Optional[str]:
    """Normalize supabase-py generate_link response shapes."""
    if payload is None:
        return None
    if isinstance(payload, str) and payload.startswith("http"):
        return payload
    # GenerateLinkResponse / dict
    props = None
    if hasattr(payload, "properties"):
        props = payload.properties
    elif isinstance(payload, dict):
        props = payload.get("properties") or payload
    if props is None and hasattr(payload, "model_dump"):
        dumped = payload.model_dump()
        props = dumped.get("properties") or dumped
    if props is None:
        return None
    if isinstance(props, dict):
        return props.get("action_link") or props.get("actionLink")
    return (
        getattr(props, "action_link", None)
        or getattr(props, "actionLink", None)
    )


def _user_email(svc, user_id: str) -> str:
    try:
        res = svc.auth.admin.get_user_by_id(user_id)
        user = getattr(res, "user", None) or (
            res.get("user") if isinstance(res, dict) else None
        )
        email = None
        if user is not None:
            email = getattr(user, "email", None) or (
                user.get("email") if isinstance(user, dict) else None
            )
        if not email:
            # fallback profiles
            prof = (
                svc.table("user_profiles")
                .select("email")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )
            if prof.data:
                email = prof.data[0].get("email")
        if not email or "@" not in str(email):
            raise HTTPException(
                status_code=400, detail="Aucune adresse email sur ce compte"
            )
        return str(email).strip().lower()
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ lookup email: {e}")
        raise HTTPException(status_code=500, detail="Impossible de lire l’email du compte")


@router.post("/api/auth/password-reset")
@optional_auth
async def request_password_reset(request: Request):
    """
    Authenticated: send a Resend email with a Supabase recovery link
    so the user can set / change their password.
    """
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")

    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")

    svc = get_supabase_service_client()
    if not svc:
        raise HTTPException(
            status_code=503, detail="SUPABASE_SERVICE_ROLE_KEY requis pour cette action"
        )

    email = _user_email(svc, user_id)
    redirect_to = f"{WEB_APP_URL}/auth/reset-password"

    try:
        link_res = svc.auth.admin.generate_link(
            {
                "type": "recovery",
                "email": email,
                "options": {"redirect_to": redirect_to},
            }
        )
    except TypeError:
        # Older client signatures
        link_res = svc.auth.admin.generate_link(
            {"type": "recovery", "email": email, "redirect_to": redirect_to}
        )
    except Exception as e:
        print(f"❌ generate_link: {e}")
        raise HTTPException(
            status_code=500, detail="Impossible de générer le lien de réinitialisation"
        )

    action_link = _extract_action_link(link_res)
    if not action_link:
        # some versions nest under .data
        action_link = _extract_action_link(getattr(link_res, "data", None))
    if not action_link and isinstance(link_res, dict):
        action_link = link_res.get("action_link") or _extract_action_link(
            link_res.get("data")
        )

    if not action_link:
        print(f"❌ generate_link unexpected shape: {link_res!r}")
        raise HTTPException(
            status_code=500, detail="Lien de réinitialisation introuvable"
        )

    sent = send_password_reset_email(email=email, reset_link=action_link)
    if not sent and not (os.getenv("RESEND_API_KEY") or "").strip():
        raise HTTPException(
            status_code=503,
            detail="RESEND_API_KEY non configuré — email non envoyé",
        )
    if not sent:
        raise HTTPException(status_code=502, detail="Échec d’envoi de l’email Resend")

    # Mask email for UI confirmation
    local, _, domain = email.partition("@")
    masked = (local[:2] + "•••@" + domain) if domain else "•••"
    return {"ok": True, "email_masked": masked}
