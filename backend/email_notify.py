"""Transactional email via Resend HTTP API (optional — no-op without RESEND_API_KEY)."""
from __future__ import annotations

import os
from typing import Iterable, List, Optional

import httpx

RESEND_API_KEY = (os.getenv("RESEND_API_KEY") or "").strip()
RESEND_FROM = (os.getenv("RESEND_FROM") or "FlightWatcher <onboarding@resend.dev>").strip()
WEB_APP_URL = (os.getenv("WEB_APP_URL") or os.getenv("FRONTEND_URL") or "http://localhost:5173").rstrip(
    "/"
)


def _unique_emails(emails: Iterable[Optional[str]]) -> List[str]:
    seen = set()
    out: List[str] = []
    for raw in emails:
        if not raw:
            continue
        e = str(raw).strip().lower()
        if "@" not in e or e in seen:
            continue
        seen.add(e)
        out.append(e)
    return out


def send_email(to: List[str], subject: str, html: str) -> bool:
    recipients = _unique_emails(to)
    if not recipients:
        return False
    if not RESEND_API_KEY:
        print(f"📧 [email skipped — no RESEND_API_KEY] to={recipients} subject={subject!r}")
        return False
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": RESEND_FROM,
                "to": recipients,
                "subject": subject,
                "html": html,
            },
            timeout=20.0,
        )
        if resp.status_code >= 400:
            print(f"❌ Resend error {resp.status_code}: {resp.text}")
            return False
        print(f"✅ Email sent to {recipients}: {subject!r}")
        return True
    except Exception as e:
        print(f"❌ Email send failed: {e}")
        return False


def send_password_reset_email(*, email: str, reset_link: str) -> bool:
    subject = "Changer ton mot de passe — FlightWatcher"
    html = f"""
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
      <h2 style="margin:0 0 12px;color:#E85A28">Sécurité du compte</h2>
      <p>Tu as demandé à changer ton mot de passe FlightWatcher.</p>
      <p>Clique sur le bouton ci-dessous (valide quelques minutes) :</p>
      <p><a href="{reset_link}" style="display:inline-block;background:#FF6B35;color:#fff;
         text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">
         Choisir un nouveau mot de passe</a></p>
      <p style="font-size:13px;color:#64748b">Si tu n’es pas à l’origine de cette demande,
         ignore cet email — ton compte reste inchangé.</p>
      <p style="font-size:12px;color:#94a3b8">FlightWatcher</p>
    </div>
    """
    return send_email([email], subject, html)


def send_password_changed_email(*, email: str) -> bool:
    subject = "Mot de passe modifié — FlightWatcher"
    html = f"""
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
      <h2 style="margin:0 0 12px;color:#E85A28">Mot de passe mis à jour</h2>
      <p>Le mot de passe de ton compte FlightWatcher vient d’être modifié.</p>
      <p>Si tu es à l’origine de ce changement, aucune action n’est nécessaire.</p>
      <p style="font-size:13px;color:#64748b">Si tu n’as pas fait cette modification,
         connecte-toi dès que possible et change à nouveau ton mot de passe
         depuis <strong>Sécurité</strong> dans l’app.</p>
      <p style="font-size:12px;color:#94a3b8">FlightWatcher</p>
    </div>
    """
    return send_email([email], subject, html)


def notify_trip_under_budget(
    *,
    trip_id: str,
    trip_name: str,
    budget_max: float,
    cheapest: float,
    recipients: List[str],
) -> bool:
    link = f"{WEB_APP_URL}/?tab=planner&trip={trip_id}"
    subject = f"Vol trouvé sous {int(budget_max)}€/pers — {trip_name}"
    html = f"""
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
      <h2 style="margin:0 0 12px;color:#E85A28">Bonne nouvelle</h2>
      <p>Un vol pour <strong>{trip_name}</strong> est disponible à environ
         <strong>{cheapest:.0f}€</strong> par personne
         (budget max {budget_max:.0f}€/pers).</p>
      <p><a href="{link}" style="display:inline-block;background:#FF6B35;color:#fff;
         text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">
         Voir le voyage</a></p>
      <p style="font-size:12px;color:#64748b">FlightWatcher — surveillance automatique des prix</p>
    </div>
    """
    return send_email(recipients, subject, html)


def send_my_trip_link(
    *,
    email: str,
    city: str,
    draft_token: str,
    out_date: Optional[str] = None,
    ret_date: Optional[str] = None,
) -> bool:
    """Lot F — anonymous trip link only (no account). Explicit consent required by caller."""
    link = f"{WEB_APP_URL}/trip/{draft_token}"
    dates = ""
    if out_date and ret_date:
        dates = f"<p>Dates : <strong>{out_date}</strong> → <strong>{ret_date}</strong></p>"
    subject = f"Ton voyage {city or 'FlightWatcher'} — lien de suivi"
    html = f"""
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
      <h2 style="margin:0 0 12px;color:#E85A28">Mon voyage</h2>
      <p>Voici le lien pour retrouver ton voyage
         <strong>{city or 'week-end'}</strong> (sans créer de compte) :</p>
      {dates}
      <p><a href="{link}" style="display:inline-block;background:#FF6B35;color:#fff;
         text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">
         Ouvrir mon voyage</a></p>
      <p style="font-size:13px;color:#64748b">Ce lien est personnel. Ton email n’est utilisé
         que pour t’envoyer ce message.</p>
      <p style="font-size:12px;color:#94a3b8">FlightWatcher</p>
    </div>
    """
    return send_email([email], subject, html)


def notify_deal_price_drop(
    *,
    email: str,
    city: str,
    deal_key: str,
    old_pp: float,
    new_pp: float,
    drop_pct: float,
) -> bool:
    link = f"{WEB_APP_URL}/?tab=deals"
    subject = f"Prix en baisse — week-end {city} (−{drop_pct:.0f}%)"
    html = f"""
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
      <h2 style="margin:0 0 12px;color:#E85A28">Alerte prix deal</h2>
      <p>Le deal vol + hôtel <strong>{city}</strong> que tu as liké est passé de
         <strong>{old_pp:.0f}€</strong> à <strong>{new_pp:.0f}€</strong> / pers.
         (−{drop_pct:.0f}%).</p>
      <p><a href="{link}" style="display:inline-block;background:#FF6B35;color:#fff;
         text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">
         Voir les deals</a></p>
      <p style="font-size:12px;color:#94a3b8">Réf. {deal_key}</p>
      <p style="font-size:12px;color:#64748b">FlightWatcher — 1 alerte max / 24 h par deal</p>
    </div>
    """
    return send_email([email], subject, html)
