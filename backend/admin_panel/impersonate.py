"""Admin « Log as » — magic link Supabase pour ouvrir la session utilisateur."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException

from admin_panel.security import start_impersonation


def _extract_action_link(payload: Any) -> Optional[str]:
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
    return getattr(props, "action_link", None) or getattr(props, "actionLink", None)


def _svc():
    from supabase_client import get_supabase_service_client, get_supabase_client

    return get_supabase_service_client() or get_supabase_client()


def create_log_as_session(
    *,
    admin_id: str,
    target_user_id: str,
) -> Dict[str, Any]:
    target_user_id = (target_user_id or "").strip()
    if not target_user_id:
        raise HTTPException(status_code=400, detail="target_user_id requis")

    sb = _svc()
    if not sb:
        raise HTTPException(status_code=503, detail="Supabase non configuré")

    email = None
    nom = ""
    try:
        row = (
            sb.table("user_profiles")
            .select("id,email,full_name,display_name")
            .eq("id", target_user_id)
            .limit(1)
            .execute()
        )
        data = (row.data or [None])[0]
        if data:
            email = (data.get("email") or "").strip() or None
            nom = data.get("full_name") or data.get("display_name") or ""
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profil introuvable: {e}") from e

    if not email:
        # Fallback Auth admin API
        try:
            auth_user = sb.auth.admin.get_user_by_id(target_user_id)
            user = getattr(auth_user, "user", None) or (
                auth_user.get("user") if isinstance(auth_user, dict) else None
            )
            email = getattr(user, "email", None) or (
                user.get("email") if isinstance(user, dict) else None
            )
        except Exception:
            pass

    if not email:
        raise HTTPException(
            status_code=404,
            detail="Utilisateur introuvable ou sans email",
        )

    from email_notify import WEB_APP_URL

    redirect_to = f"{WEB_APP_URL}/sejours"

    try:
        link_res = sb.auth.admin.generate_link(
            {
                "type": "magiclink",
                "email": email,
                "options": {"redirect_to": redirect_to},
            }
        )
    except TypeError:
        try:
            link_res = sb.auth.admin.generate_link(
                {"type": "magiclink", "email": email, "redirect_to": redirect_to}
            )
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"generate_link impossible: {e}"
            ) from e
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"generate_link impossible: {e}"
        ) from e

    action_link = _extract_action_link(link_res)
    if not action_link:
        action_link = _extract_action_link(getattr(link_res, "data", None))
    if not action_link and isinstance(link_res, dict):
        action_link = link_res.get("action_link") or _extract_action_link(
            link_res.get("data")
        )

    if not action_link:
        raise HTTPException(
            status_code=500,
            detail="Lien de connexion utilisateur introuvable",
        )

    session = start_impersonation(admin_id, target_user_id)
    return {
        "ok": True,
        "target_user_id": target_user_id,
        "target_user_email": email,
        "target_user_name": nom,
        "action_link": action_link,
        "redirect_to": redirect_to,
        "expires_at": session.get("expires_at"),
        "ttl_sec": session.get("ttl_sec"),
    }
