"""
v4 Lot E — weekly origin deal alerts (email, no account).
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, Optional

logger = logging.getLogger("deals.origin_alerts")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _norm_email(email: str) -> str:
    return (email or "").strip().lower()


def _norm_origin(origin_iata: str) -> str:
    # Keep first IATA if multi (CDG,ORY,BVA → CDG for digest key; store full later)
    raw = (origin_iata or "").strip().upper().replace(" ", "")
    parts = [p for p in raw.split(",") if len(p) == 3 and p.isalpha()]
    return ",".join(parts) if parts else raw[:32]


def signup_origin_alert(
    supabase,
    *,
    email: str,
    origin_iata: str,
    origin_label: Optional[str] = None,
    locale: str = "fr",
) -> Dict[str, Any]:
    """
    Store alert subscription + send confirmation email (Resend).
    Idempotent on (email, origin_iata).
    """
    em = _norm_email(email)
    origin = _norm_origin(origin_iata)
    if not _EMAIL_RE.match(em):
        return {"ok": False, "error": "invalid_email"}
    if not origin:
        return {"ok": False, "error": "invalid_origin"}
    if not supabase:
        return {"ok": False, "error": "no_supabase"}

    label = (origin_label or "").strip() or origin.split(",")[0]
    row = {
        "email": em,
        "origin_iata": origin,
        "origin_label": label,
        "locale": (locale or "fr")[:5],
        "status": "active",
    }
    try:
        supabase.table("deal_origin_alerts").upsert(
            row,
            on_conflict="email,origin_iata",
        ).execute()
    except Exception as e:
        logger.warning("origin_alert upsert fail: %s", e)
        return {"ok": False, "error": "db_error"}

    sent = False
    try:
        from email_notify import send_email, WEB_APP_URL

        subject = f"Alerte deals depuis {label} — FlightWatcher"
        html = f"""
        <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
          <h2 style="margin:0 0 12px;color:#E85A28">C’est noté</h2>
          <p>Tu recevras chaque <strong>jeudi</strong> les meilleurs séjours vol + hôtel
             depuis <strong>{label}</strong>.</p>
          <p><a href="{WEB_APP_URL}" style="display:inline-block;background:#FF6B35;color:#fff;
             text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">
             Voir les deals</a></p>
          <p style="font-size:12px;color:#94a3b8">FlightWatcher — prix réels, vérifiés.
             Réponds « stop » pour te désinscrire (bientôt un lien dédié).</p>
        </div>
        """
        sent = send_email([em], subject, html)
        if sent:
            from datetime import datetime, timezone

            try:
                supabase.table("deal_origin_alerts").update(
                    {"confirmed_at": datetime.now(timezone.utc).isoformat()}
                ).eq("email", em).eq("origin_iata", origin).execute()
            except Exception:
                pass
    except Exception as e:
        logger.warning("origin_alert email fail: %s", e)

    return {
        "ok": True,
        "email": em,
        "origin_iata": origin,
        "origin_label": label,
        "confirmation_sent": sent,
    }
