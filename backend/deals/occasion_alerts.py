"""
v4 Occasions Lot F — seasonal digests (email + push).
Cap: ≤1 / week / recipient / occasion / origin ; only if ≥3 deals.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from deals.occasions_config import OCCASIONS, occasion_by_slug

logger = logging.getLogger("deals.occasion_alerts")

_COOLDOWN = timedelta(days=7)
_MIN_DEALS = 3


def _pushable_slugs() -> List[str]:
    return [
        str(o["slug"])
        for o in OCCASIONS
        if o.get("push") and (o.get("verified", True) or o.get("slug") == "il-fera-beau")
    ]


def _recently_sent(
    supabase: Any,
    *,
    channel: str,
    recipient: str,
    occasion_slug: str,
    origin_iata: str,
) -> bool:
    if not supabase:
        return False
    since = (datetime.now(timezone.utc) - _COOLDOWN).isoformat()
    try:
        res = (
            supabase.table("deal_occasion_alert_sends")
            .select("id")
            .eq("channel", channel)
            .eq("recipient", recipient.lower())
            .eq("occasion_slug", occasion_slug)
            .eq("origin_iata", origin_iata)
            .gte("sent_at", since)
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        logger.debug("occasion send lookup: %s", e)
        return False


def _record_send(
    supabase: Any,
    *,
    channel: str,
    recipient: str,
    occasion_slug: str,
    origin_iata: str,
    deal_count: int,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    if not supabase:
        return
    try:
        supabase.table("deal_occasion_alert_sends").insert(
            {
                "channel": channel,
                "recipient": recipient.lower(),
                "occasion_slug": occasion_slug,
                "origin_iata": origin_iata,
                "deal_count": deal_count,
                "meta": meta or {},
            }
        ).execute()
    except Exception as e:
        logger.warning("occasion send record: %s", e)


def run_occasion_digests(
    supabase: Any,
    *,
    dry_run: bool = False,
    force: bool = False,
    slugs: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    For each pushable occasion with ≥3 deals (per origin subscriber):
    send email to deal_origin_alerts + Expo push to push_tokens.
    """
    summary: Dict[str, Any] = {
        "ok": True,
        "occasions": [],
        "email_sent": 0,
        "push_sent": 0,
        "skipped_cooldown": 0,
        "skipped_volume": 0,
        "errors": 0,
        "dry_run": dry_run,
    }
    if not supabase:
        summary["ok"] = False
        summary["error"] = "no_supabase"
        return summary

    from deals.community_list import list_community_deals
    from deals.push_notify import list_active_push_tokens, send_expo_push
    from email_notify import WEB_APP_URL, send_email

    target_slugs = slugs or _pushable_slugs()
    # Filter weather occasion unless enabled
    filtered: List[str] = []
    for slug in target_slugs:
        occ = occasion_by_slug(slug)
        if not occ or not occ.get("push"):
            continue
        if slug == "il-fera-beau":
            try:
                from deals.weather_service import weather_enabled

                if not weather_enabled():
                    continue
            except Exception:
                continue
        elif not occ.get("verified", True):
            continue
        filtered.append(slug)

    try:
        sub_res = (
            supabase.table("deal_origin_alerts")
            .select("*")
            .eq("status", "active")
            .limit(500)
            .execute()
        )
        subs = list(sub_res.data or [])
    except Exception as e:
        summary["ok"] = False
        summary["error"] = str(e)
        return summary

    deals_cache: Dict[str, List[Dict[str, Any]]] = {}

    def deals_for(origin: str, slug: str) -> List[Dict[str, Any]]:
        key = f"{origin}|{slug}"
        if key not in deals_cache:
            try:
                deals_cache[key] = list_community_deals(
                    supabase,
                    origin=origin or None,
                    occasion=slug,
                    adults=2,
                    limit=24,
                )
            except Exception as e:
                logger.warning("occasion deals %s: %s", key, e)
                deals_cache[key] = []
        return deals_cache[key]

    for slug in filtered:
        occ = occasion_by_slug(slug) or {}
        label = occ.get("label") or slug
        explain = occ.get("explain") or ""
        occ_stats = {
            "slug": slug,
            "email": 0,
            "push": 0,
            "skip_vol": 0,
            "skip_cd": 0,
        }

        # —— Email via origin alert subscribers ——
        for sub in subs:
            em = (sub.get("email") or "").strip().lower()
            origin = (sub.get("origin_iata") or "").strip()
            origin_label = sub.get("origin_label") or (origin.split(",")[0] if origin else "")
            if not em:
                continue
            deals = deals_for(origin, slug)
            if len(deals) < _MIN_DEALS:
                occ_stats["skip_vol"] += 1
                summary["skipped_volume"] += 1
                continue
            if not force and _recently_sent(
                supabase,
                channel="email",
                recipient=em,
                occasion_slug=slug,
                origin_iata=origin,
            ):
                occ_stats["skip_cd"] += 1
                summary["skipped_cooldown"] += 1
                continue

            deep = f"{WEB_APP_URL}/?occasion={slug}"
            if origin:
                deep += f"&origin={origin.split(',')[0]}"
            cities = ", ".join(
                sorted({str(d.get("city") or "") for d in deals[:5] if d.get("city")})
            )
            subject = f"{label} — deals depuis {origin_label or 'ta ville'}"
            html = f"""
            <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
              <h2 style="margin:0 0 8px;color:#E85A28">{label}</h2>
              <p style="margin:0 0 8px;color:#64748b;font-size:14px">{explain}</p>
              <p style="margin:0 0 12px">On a trouvé <strong>{len(deals)} séjours</strong>
                 {('vers ' + cities) if cities else ''}.</p>
              <p><a href="{deep}" style="display:inline-block;background:#FF6B35;color:#fff;
                 text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">
                 Voir les deals</a></p>
              <p style="font-size:12px;color:#94a3b8">FlightWatcher — 1 alerte / semaine max.</p>
            </div>
            """
            if dry_run:
                summary["email_sent"] += 1
                occ_stats["email"] += 1
                continue
            try:
                ok = send_email([em], subject, html)
                if ok:
                    summary["email_sent"] += 1
                    occ_stats["email"] += 1
                    _record_send(
                        supabase,
                        channel="email",
                        recipient=em,
                        occasion_slug=slug,
                        origin_iata=origin,
                        deal_count=len(deals),
                    )
                else:
                    summary["errors"] += 1
            except Exception as e:
                logger.warning("occasion email %s: %s", em, e)
                summary["errors"] += 1

        # —— Push (Expo tokens) ——
        # Aggregate by origin: one wall fetch, fan-out tokens
        origins_seen = {((s.get("origin_iata") or "").strip()) for s in subs} | {""}
        for origin in origins_seen:
            deals = deals_for(origin, slug)
            if len(deals) < _MIN_DEALS:
                continue
            tokens_rows = list_active_push_tokens(
                supabase, origin_iata=origin or None, limit=200
            )
            for tr in tokens_rows:
                tok = (tr.get("token") or "").strip()
                if not tok:
                    continue
                if not force and _recently_sent(
                    supabase,
                    channel="push",
                    recipient=tok,
                    occasion_slug=slug,
                    origin_iata=origin,
                ):
                    summary["skipped_cooldown"] += 1
                    continue
                deep_path = f"/?occasion={slug}"
                title = str(label)
                body = f"{len(deals)} séjours — {explain}"[:140]
                if dry_run:
                    summary["push_sent"] += 1
                    occ_stats["push"] += 1
                    continue
                try:
                    res = send_expo_push(
                        [tok],
                        title=title,
                        body=body,
                        data={"occasion": slug, "url": deep_path},
                    )
                    if res.get("sent"):
                        summary["push_sent"] += int(res["sent"])
                        occ_stats["push"] += int(res["sent"])
                        _record_send(
                            supabase,
                            channel="push",
                            recipient=tok,
                            occasion_slug=slug,
                            origin_iata=origin,
                            deal_count=len(deals),
                        )
                    elif res.get("errors"):
                        summary["errors"] += 1
                except Exception as e:
                    logger.warning("occasion push: %s", e)
                    summary["errors"] += 1

        summary["occasions"].append(occ_stats)

    logger.info(
        "occasion_digests email=%s push=%s cooldown=%s volume=%s errors=%s",
        summary["email_sent"],
        summary["push_sent"],
        summary["skipped_cooldown"],
        summary["skipped_volume"],
        summary["errors"],
    )
    return summary
