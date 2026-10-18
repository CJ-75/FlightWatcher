"""Password change in-app + optional recovery email via Resend."""
from __future__ import annotations

import os
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from email_notify import (
    WEB_APP_URL,
    send_password_changed_email,
    send_password_reset_email,
)
from supabase_deps import (
    SUPABASE_AVAILABLE,
    get_supabase_client,
    get_supabase_service_client,
    get_user_id_from_token,
    optional_auth,
)

router = APIRouter()


class ChangePasswordBody(BaseModel):
    current_password: str = ""
    new_password: str = Field(min_length=8, max_length=128)


def _extract_action_link(payload: Any) -> Optional[str]:
    """Normalize supabase-py generate_link response shapes."""
    if payload is None:
        return None
    if isinstance(payload, str) and payload.startswith("http"):
        return payload
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


def _admin_user(svc, user_id: str):
    res = svc.auth.admin.get_user_by_id(user_id)
    return getattr(res, "user", None) or (
        res.get("user") if isinstance(res, dict) else None
    )


def _user_email_from_user(user: Any, svc, user_id: str) -> str:
    email = None
    if user is not None:
        email = getattr(user, "email", None) or (
            user.get("email") if isinstance(user, dict) else None
        )
    if not email:
        try:
            prof = (
                svc.table("user_profiles")
                .select("email")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )
            if prof.data:
                email = prof.data[0].get("email")
        except Exception:
            pass
    if not email or "@" not in str(email):
        raise HTTPException(
            status_code=400, detail="Aucune adresse email sur ce compte"
        )
    return str(email).strip().lower()


def _user_email(svc, user_id: str) -> str:
    try:
        user = _admin_user(svc, user_id)
        return _user_email_from_user(user, svc, user_id)
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ lookup email: {e}")
        raise HTTPException(status_code=500, detail="Impossible de lire l’email du compte")


def _identity_providers(user: Any) -> List[str]:
    identities = None
    if user is not None:
        identities = getattr(user, "identities", None)
        if identities is None and isinstance(user, dict):
            identities = user.get("identities")
    providers: List[str] = []
    for ident in identities or []:
        if isinstance(ident, dict):
            p = ident.get("provider")
        else:
            p = getattr(ident, "provider", None)
        if p:
            providers.append(str(p).lower())
    return providers


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    return (local[:2] + "•••@" + domain) if domain else "•••"


def _verify_current_password(email: str, current_password: str) -> None:
    client = get_supabase_client()
    if not client:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    try:
        res = client.auth.sign_in_with_password(
            {"email": email, "password": current_password}
        )
    except Exception as e:
        print(f"❌ verify password: {e}")
        raise HTTPException(
            status_code=400, detail="Mot de passe actuel incorrect"
        )
    session = getattr(res, "session", None)
    if session is None and isinstance(res, dict):
        session = res.get("session")
    user = getattr(res, "user", None)
    if user is None and isinstance(res, dict):
        user = res.get("user")
    if not session and not user:
        raise HTTPException(
            status_code=400, detail="Mot de passe actuel incorrect"
        )


def _update_password(svc, user_id: str, new_password: str) -> None:
    try:
        svc.auth.admin.update_user_by_id(user_id, {"password": new_password})
    except Exception as e:
        print(f"❌ update password: {e}")
        raise HTTPException(
            status_code=500, detail="Impossible de mettre à jour le mot de passe"
        )


@router.post("/api/auth/change-password")
@optional_auth
async def change_password(body: ChangePasswordBody, request: Request):
    """
    Change password in-app (current + new), then send a Resend confirmation email.
    OAuth-only accounts (no email/password yet) may omit current_password.
    """
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")

    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")

    new_password = (body.new_password or "").strip()
    if len(new_password) < 8:
        raise HTTPException(
            status_code=400, detail="Mot de passe trop court (8 caractères min.)"
        )

    svc = get_supabase_service_client()
    if not svc:
        raise HTTPException(
            status_code=503, detail="SUPABASE_SERVICE_ROLE_KEY requis pour cette action"
        )

    try:
        user = _admin_user(svc, user_id)
        email = _user_email_from_user(user, svc, user_id)
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ change-password lookup: {e}")
        raise HTTPException(status_code=500, detail="Impossible de lire le compte")

    providers = _identity_providers(user)
    has_password_login = "email" in providers
    current = (body.current_password or "").strip()

    if has_password_login or current:
        if not current:
            raise HTTPException(
                status_code=400, detail="Mot de passe actuel requis"
            )
        _verify_current_password(email, current)

    _update_password(svc, user_id, new_password)

    sent = send_password_changed_email(email=email)
    if not sent and not (os.getenv("RESEND_API_KEY") or "").strip():
        # Password already changed — don't fail the request hard
        print("⚠️ Password changed but RESEND_API_KEY missing — no confirmation email")
    elif not sent:
        print("⚠️ Password changed but confirmation email failed")

    return {"ok": True, "email_masked": _mask_email(email), "email_sent": bool(sent)}


@router.post("/api/auth/password-changed-notify")
@optional_auth
async def notify_password_changed(request: Request):
    """Send confirmation email after a client-side password update (e.g. recovery link)."""
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
    sent = send_password_changed_email(email=email)
    if not sent and not (os.getenv("RESEND_API_KEY") or "").strip():
        raise HTTPException(
            status_code=503,
            detail="RESEND_API_KEY non configuré — email non envoyé",
        )
    if not sent:
        raise HTTPException(status_code=502, detail="Échec d’envoi de l’email Resend")
    return {"ok": True, "email_masked": _mask_email(email)}


@router.post("/api/auth/password-reset")
@optional_auth
async def request_password_reset(request: Request):
    """
    Authenticated: send a Resend email with a Supabase recovery link
    (forgot-password / fallback). Prefer /api/auth/change-password in-app.
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

    return {"ok": True, "email_masked": _mask_email(email)}
