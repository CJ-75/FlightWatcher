"""
v4 Lot E — weekly origin deal alerts (email, no account).
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("deals.origin_alerts")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_DIGEST_COOLDOWN = timedelta(days=6)


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


def _deal_lines_html(deals: List[Dict[str, Any]], *, limit: int = 5) -> str:
    rows = []
    for d in deals[:limit]:
        city = d.get("city") or "Destination"
        price = int(round(float(d.get("price_per_person") or 0)))
        hook = d.get("hook") or d.get("title") or ""
        nights = d.get("nights")
        meta = f"{nights} nuit{'s' if nights and nights > 1 else ''}" if nights else ""
        rows.append(
            f"<li style='margin:0 0 10px'><strong>{city}</strong> — {price} € / pers."
            f"{(' · ' + meta) if meta else ''}"
            f"{('<br/><span style=\"color:#64748b;font-size:13px\">' + hook + '</span>') if hook else ''}"
            f"</li>"
        )
    return "<ul style='padding-left:18px;margin:12px 0'>" + "".join(rows) + "</ul>"


def run_origin_alert_digests(
    supabase,
    *,
    dry_run: bool = False,
    force: bool = False,
) -> Dict[str, Any]:
    """
    Send Thursday-style digests: top deals per origin for each active signup.
    Cooldown 6 days unless force=True. Safe to cron daily (skips if recently sent).
    """
    summary: Dict[str, Any] = {
        "subscribers": 0,
        "sent": 0,
        "skipped_cooldown": 0,
        "skipped_empty": 0,
        "errors": 0,
        "dry_run": dry_run,
    }
    if not supabase:
        summary["error"] = "no_supabase"
        return summary

    try:
        res = (
            supabase.table("deal_origin_alerts")
            .select("*")
            .eq("status", "active")
            .limit(500)
            .execute()
        )
        subs = res.data or []
    except Exception as e:
        logger.warning("origin_alerts list fail: %s", e)
        summary["error"] = str(e)
        return summary

    summary["subscribers"] = len(subs)
    if not subs:
        return summary

    from deals.community_list import list_community_deals
    from email_notify import WEB_APP_URL, send_email

    now = datetime.now(timezone.utc)
    # Cache deals by origin string
    deals_by_origin: Dict[str, List[Dict[str, Any]]] = {}

    for sub in subs:
        em = sub.get("email")
        origin = sub.get("origin_iata") or ""
        label = sub.get("origin_label") or origin.split(",")[0]
        if not em or not origin:
            continue

        if not force and sub.get("last_sent_at"):
            try:
                last = datetime.fromisoformat(
                    str(sub["last_sent_at"]).replace("Z", "+00:00")
                )
                if now - last < _DIGEST_COOLDOWN:
                    summary["skipped_cooldown"] += 1
                    continue
            except (TypeError, ValueError):
                pass

        if origin not in deals_by_origin:
            try:
                deals_by_origin[origin] = list_community_deals(
                    supabase, origin=origin, adults=2, limit=12
                )
            except Exception as e:
                logger.warning("digest list deals %s: %s", origin, e)
                deals_by_origin[origin] = []

        deals = [
            d
            for d in deals_by_origin[origin]
            if (d.get("nights") or 0) <= 3 and (d.get("price_per_person") or 0) > 0
        ][:5]
        if not deals:
            summary["skipped_empty"] += 1
            continue

        subject = f"Tes deals depuis {label} — FlightWatcher"
        html = f"""
        <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
          <h2 style="margin:0 0 8px;color:#E85A28">Bonnes affaires depuis {label}</h2>
          <p style="margin:0 0 8px;color:#64748b;font-size:14px">
            Prix réels vol + hôtel, vérifiés. Voici le top de la semaine :
          </p>
          {_deal_lines_html(deals)}
          <p><a href="{WEB_APP_URL}" style="display:inline-block;background:#FF6B35;color:#fff;
             text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">
             Voir tous les deals</a></p>
          <p style="font-size:12px;color:#94a3b8">FlightWatcher — alerte hebdo depuis {label}.</p>
        </div>
        """
        if dry_run:
            summary["sent"] += 1
            continue
        try:
            ok = send_email([em], subject, html)
            if ok:
                summary["sent"] += 1
                try:
                    supabase.table("deal_origin_alerts").update(
                        {"last_sent_at": now.isoformat()}
                    ).eq("id", sub["id"]).execute()
                except Exception:
                    supabase.table("deal_origin_alerts").update(
                        {"last_sent_at": now.isoformat()}
                    ).eq("email", em).eq("origin_iata", origin).execute()
            else:
                summary["errors"] += 1
        except Exception as e:
            logger.warning("digest send fail %s: %s", em, e)
            summary["errors"] += 1

    logger.info(
        "origin_alert_digests sent=%s cooldown=%s empty=%s errors=%s",
        summary["sent"],
        summary["skipped_cooldown"],
        summary["skipped_empty"],
        summary["errors"],
    )
    return summary
