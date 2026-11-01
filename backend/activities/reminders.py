"""J-7 activity reminders — email + Expo push (Lot F)."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("activities.reminders")


def _svc():
    try:
        from supabase_deps import get_supabase_client, get_supabase_service_client

        return get_supabase_service_client() or get_supabase_client()
    except Exception:
        return None


def run_activity_j7_reminders(supabase: Any = None) -> Dict[str, Any]:
    """
    Find planned trips departing in ~7 days with activity trip_items
    in idea/validated (not booked/skipped) → email + push.
    """
    sb = supabase or _svc()
    summary: Dict[str, Any] = {
        "ok": True,
        "candidates": 0,
        "emails": 0,
        "pushes": 0,
        "skipped": 0,
    }
    if not sb:
        summary["ok"] = False
        summary["error"] = "no_supabase"
        return summary

    target = (date.today() + timedelta(days=7)).isoformat()
    try:
        trips = (
            sb.table("planned_trips")
            .select("id,name,out_date,owner_user_id")
            .eq("out_date", target)
            .limit(100)
            .execute()
        )
        trip_rows = list(trips.data or [])
    except Exception as e:
        logger.warning("j7 trips query: %s", e)
        summary["ok"] = False
        summary["error"] = str(e)
        return summary

    from deals.push_notify import list_active_push_tokens, send_expo_push
    from email_notify import WEB_APP_URL, send_email

    for trip in trip_rows:
        tid = trip.get("id")
        if not tid:
            continue
        try:
            items = (
                sb.table("trip_items")
                .select("id,status,item_type")
                .eq("planned_trip_id", tid)
                .eq("item_type", "activity")
                .in_("status", ["idea", "validated"])
                .limit(20)
                .execute()
            )
            pending = list(items.data or [])
        except Exception:
            pending = []
        if not pending:
            summary["skipped"] += 1
            continue
        summary["candidates"] += 1
        name = trip.get("name") or "ton voyage"
        subject = f"J-7 · activités pour {name}"
        html = (
            f"<p>Dans 7 jours : <strong>{name}</strong>.</p>"
            f"<p>Tu as {len(pending)} activité(s) à finaliser.</p>"
            f"<p><a href=\"{WEB_APP_URL}/planner\">Ouvrir le Planner</a></p>"
        )
        uid = trip.get("owner_user_id")
        # Best-effort: email via known member if available
        email: Optional[str] = None
        try:
            mem = (
                sb.table("trip_members")
                .select("email,user_id")
                .eq("planned_trip_id", tid)
                .limit(5)
                .execute()
            )
            for m in mem.data or []:
                if m.get("email"):
                    email = str(m["email"])
                    break
        except Exception:
            pass
        if email:
            if send_email([email], subject, html):
                summary["emails"] += 1

        tokens_rows = list_active_push_tokens(sb, limit=50)
        if uid:
            tokens_rows = [
                r for r in tokens_rows if not r.get("user_id") or r.get("user_id") == uid
            ] or tokens_rows
        tokens = [str(r["token"]) for r in tokens_rows if r.get("token")]
        if tokens:
            push = send_expo_push(
                tokens[:20],
                title="Activités J-7",
                body=f"{len(pending)} activité(s) à confirmer pour {name}",
                data={"planned_trip_id": tid, "type": "activity_j7"},
            )
            summary["pushes"] += int(push.get("sent") or 0)

        try:
            from activities.events import record_event

            record_event(
                sb,
                domain="activity",
                event="j7_reminder",
                surface="scheduler",
                platform=None,
                planned_trip_id=tid,
                meta={"pending": len(pending)},
            )
        except Exception:
            pass

    summary["ran_at"] = datetime.now(timezone.utc).isoformat()
    return summary
