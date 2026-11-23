"""
Push V1 send helpers — quiet hours, prefs, presence, daily cap pops, group batch.
"""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo

logger = logging.getLogger("push.v1")

PARIS = ZoneInfo("Europe/Paris")

KIND_GROUP_JOINED = "group_member_joined"
KIND_GROUP_INVITE = "group_invite"
KIND_GROUP_INVITE_NUDGE = "group_invite_nudge"
KIND_GROUP_DATES = "group_dates_set"
KIND_POP_PLAN = "pop_plan_nudge"
KIND_POP_EVE = "pop_starts_tomorrow"

_POP_KINDS = {KIND_POP_PLAN, KIND_POP_EVE}
_GROUP_KINDS = {
    KIND_GROUP_JOINED,
    KIND_GROUP_INVITE,
    KIND_GROUP_INVITE_NUDGE,
    KIND_GROUP_DATES,
}


def push_v1_only() -> bool:
    raw = (os.getenv("PUSH_V1_ONLY") or "1").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _now_paris() -> datetime:
    return datetime.now(PARIS)


def in_quiet_hours(*, when: Optional[datetime] = None) -> bool:
    """21:00–09:00 Europe/Paris (exclusive of 09:00)."""
    local = (when or _now_utc()).astimezone(PARIS)
    return local.hour >= 21 or local.hour < 9


def next_morning_paris(*, after: Optional[datetime] = None) -> datetime:
    local = (after or _now_utc()).astimezone(PARIS)
    day = local.date()
    if local.hour >= 21:
        day = day + timedelta(days=1)
    morning = datetime(day.year, day.month, day.day, 9, 5, tzinfo=PARIS)
    return morning.astimezone(timezone.utc)


def _fmt_date_fr(raw: Any) -> str:
    s = str(raw or "")[:10]
    if len(s) < 10:
        return s or "?"
    try:
        d = date.fromisoformat(s)
    except ValueError:
        return s
    months = (
        "janv",
        "févr",
        "mars",
        "avr",
        "mai",
        "juin",
        "juil",
        "août",
        "sept",
        "oct",
        "nov",
        "déc",
    )
    return f"{d.day} {months[d.month - 1]}"


def _trip_city(trip: dict) -> str:
    meta = trip.get("meta") if isinstance(trip.get("meta"), dict) else {}
    for key in ("city", "destination_name", "source_city_slug"):
        v = meta.get(key) if meta else None
        if v:
            return str(v).replace("-", " ").title()
    arr = trip.get("arrival_airport") or ""
    name = trip.get("name") or ""
    if name and " " in name:
        return name.split("·")[0].strip() or name
    return str(arr or name or "voyage")


def _trip_dates_label(trip: dict) -> Tuple[str, str]:
    deps = trip.get("dates_depart") or []
    rets = trip.get("dates_retour") or []
    out = ""
    ret = ""
    if isinstance(deps, list) and deps:
        out = _fmt_date_fr(
            deps[0].get("date") if isinstance(deps[0], dict) else deps[0]
        )
    if isinstance(rets, list) and rets:
        ret = _fmt_date_fr(
            rets[0].get("date") if isinstance(rets[0], dict) else rets[0]
        )
    if not out and trip.get("out_date"):
        out = _fmt_date_fr(trip.get("out_date"))
    if not ret and trip.get("ret_date"):
        ret = _fmt_date_fr(trip.get("ret_date"))
    return out or "?", ret or "?"


def _first_name(display: Optional[str], email: Optional[str] = None) -> str:
    raw = (display or "").strip()
    if raw:
        return raw.split()[0]
    if email and "@" in email:
        return email.split("@")[0].capitalize()
    return "Quelqu'un"


def _join_names_fr(names: Sequence[str]) -> str:
    clean = [n for n in names if n]
    if not clean:
        return "Quelqu'un"
    if len(clean) == 1:
        return clean[0]
    if len(clean) == 2:
        return f"{clean[0]} et {clean[1]}"
    return f"{', '.join(clean[:-1])} et {clean[-1]}"


def _tokens_for_users(
    supabase: Any,
    user_ids: Sequence[str],
    *,
    pref: str,
) -> List[Dict[str, Any]]:
    """pref: 'notif_group' | 'notif_pops'."""
    ids = [str(u) for u in user_ids if u]
    if not ids or not supabase:
        return []
    try:
        res = (
            supabase.table("push_tokens")
            .select("token,user_id,notif_group,notif_pops,active")
            .eq("active", True)
            .in_("user_id", ids)
            .limit(200)
            .execute()
        )
    except Exception as e:
        logger.debug("tokens lookup: %s", e)
        return []
    out = []
    for row in res.data or []:
        if pref == "notif_group" and row.get("notif_group") is False:
            continue
        if pref == "notif_pops" and row.get("notif_pops") is False:
            continue
        if row.get("token"):
            out.append(row)
    return out


def _user_ids_for_email(supabase: Any, email: str) -> List[str]:
    em = (email or "").strip().lower()
    if not em or not supabase:
        return []
    try:
        res = (
            supabase.table("user_profiles")
            .select("id")
            .eq("email", em)
            .limit(5)
            .execute()
        )
        return [str(r["id"]) for r in (res.data or []) if r.get("id")]
    except Exception:
        return []


def _recently_present(
    supabase: Any,
    *,
    user_id: str,
    entity_type: str,
    entity_id: str,
    within: timedelta = timedelta(hours=1),
) -> bool:
    if not supabase or not user_id or not entity_id:
        return False
    since = (_now_utc() - within).isoformat()
    try:
        res = (
            supabase.table("push_presence")
            .select("last_open_at")
            .eq("user_id", user_id)
            .eq("entity_type", entity_type)
            .eq("entity_id", str(entity_id))
            .gte("last_open_at", since)
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        logger.debug("presence: %s", e)
        return False


def _pop_sent_today(supabase: Any, user_id: str) -> Optional[str]:
    """Return kind if a pop push (#5/#6) already sent today Paris."""
    if not supabase or not user_id:
        return None
    local = _now_paris()
    start = datetime(local.year, local.month, local.day, 0, 0, tzinfo=PARIS)
    start_utc = start.astimezone(timezone.utc).isoformat()
    try:
        res = (
            supabase.table("push_send_log")
            .select("kind")
            .eq("user_id", user_id)
            .in_("kind", list(_POP_KINDS))
            .gte("sent_at", start_utc)
            .limit(5)
            .execute()
        )
        for row in res.data or []:
            k = row.get("kind")
            if k in _POP_KINDS:
                return str(k)
    except Exception as e:
        logger.debug("pop day cap: %s", e)
    return None


def _already_sent(
    supabase: Any,
    *,
    kind: str,
    entity_id: str,
    user_id: Optional[str] = None,
) -> bool:
    if not supabase:
        return False
    try:
        q = (
            supabase.table("push_send_log")
            .select("id")
            .eq("kind", kind)
            .eq("entity_id", str(entity_id))
            .limit(1)
        )
        if user_id:
            q = q.eq("user_id", user_id)
        res = q.execute()
        return bool(res.data)
    except Exception:
        return False


def _log_send(
    supabase: Any,
    *,
    user_id: Optional[str],
    kind: str,
    entity_id: str,
    title: str,
    body: str,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    if not supabase:
        return
    try:
        supabase.table("push_send_log").insert(
            {
                "user_id": user_id,
                "kind": kind,
                "entity_id": str(entity_id),
                "title": title[:200],
                "body": body[:400],
                "meta": meta or {},
            }
        ).execute()
    except Exception as e:
        logger.warning("push_send_log: %s", e)


def _deliver(
    supabase: Any,
    *,
    user_id: str,
    tokens: List[str],
    kind: str,
    entity_id: str,
    title: str,
    body: str,
    data: Dict[str, Any],
    entity_type: str,
    defer_quiet: bool = True,
) -> Dict[str, Any]:
    from deals.push_notify import send_expo_push

    summary: Dict[str, Any] = {"ok": True, "sent": 0, "skipped": None}
    if not tokens:
        summary["skipped"] = "no_tokens"
        return summary
    if _recently_present(
        supabase, user_id=user_id, entity_type=entity_type, entity_id=entity_id
    ):
        summary["skipped"] = "recent_presence"
        return summary

    if kind in _POP_KINDS:
        already = _pop_sent_today(supabase, user_id)
        if already == KIND_POP_EVE and kind == KIND_POP_PLAN:
            summary["skipped"] = "pop_eve_wins"
            return summary
        if already and already != kind:
            summary["skipped"] = f"daily_cap:{already}"
            return summary
        if already == kind:
            summary["skipped"] = "already_today"
            return summary

    if defer_quiet and in_quiet_hours() and kind != KIND_POP_EVE:
        # Soft defer: log as pending via meta; cron flush morning can retry.
        # For V1 we skip send now and record intent for morning job.
        summary["skipped"] = "quiet_hours"
        summary["retry_after"] = next_morning_paris().isoformat()
        try:
            supabase.table("push_send_log").insert(
                {
                    "user_id": user_id,
                    "kind": f"{kind}_deferred",
                    "entity_id": str(entity_id),
                    "title": title[:200],
                    "body": body[:400],
                    "meta": {
                        "data": data,
                        "retry_after": summary["retry_after"],
                        "tokens": tokens[:5],
                    },
                }
            ).execute()
        except Exception:
            pass
        return summary

    res = send_expo_push(
        tokens,
        title=title,
        body=body,
        data={**data, "type": kind},
        allow_legacy=True,
    )
    if res.get("sent"):
        _log_send(
            supabase,
            user_id=user_id,
            kind=kind,
            entity_id=entity_id,
            title=title,
            body=body,
            meta=data,
        )
    summary["sent"] = int(res.get("sent") or 0)
    summary["ok"] = bool(res.get("ok", True))
    return summary


def record_presence(
    supabase: Any,
    *,
    user_id: str,
    entity_type: str,
    entity_id: str,
) -> None:
    if not supabase or not user_id or entity_type not in ("trip", "pop") or not entity_id:
        return
    now = _now_utc().isoformat()
    try:
        supabase.table("push_presence").upsert(
            {
                "user_id": user_id,
                "entity_type": entity_type,
                "entity_id": str(entity_id),
                "last_open_at": now,
            },
            on_conflict="user_id,entity_type,entity_id",
        ).execute()
    except Exception as e:
        logger.debug("record_presence: %s", e)


# ——— #1 batch join ———


def enqueue_member_joined(
    supabase: Any,
    *,
    trip: dict,
    organizer_id: str,
    joiner_name: str,
) -> None:
    if not supabase or not organizer_id:
        return
    trip_id = str(trip.get("id") or "")
    name = _first_name(joiner_name)
    flush_after = (_now_utc() + timedelta(hours=1)).isoformat()
    try:
        existing = (
            supabase.table("push_group_join_batch")
            .select("*")
            .eq("trip_id", trip_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            row = existing.data[0]
            names = list(row.get("joiner_names") or [])
            if name not in names:
                names.append(name)
            supabase.table("push_group_join_batch").update(
                {"joiner_names": names}
            ).eq("trip_id", trip_id).execute()
        else:
            supabase.table("push_group_join_batch").insert(
                {
                    "trip_id": trip_id,
                    "organizer_id": organizer_id,
                    "joiner_names": [name],
                    "flush_after": flush_after,
                }
            ).execute()
    except Exception as e:
        logger.warning("enqueue join batch: %s", e)
        # Fallback immediate single push
        _send_joined_now(supabase, trip=trip, organizer_id=organizer_id, names=[name])


def _send_joined_now(
    supabase: Any,
    *,
    trip: dict,
    organizer_id: str,
    names: List[str],
) -> Dict[str, Any]:
    city = _trip_city(trip)
    out, ret = _trip_dates_label(trip)
    n = max(1, len(names))
    # Count members for « vous êtes N »
    member_count = n
    try:
        mem = (
            supabase.table("trip_members")
            .select("id")
            .eq("trip_id", trip["id"])
            .execute()
        )
        member_count = max(n, len(mem.data or []))
    except Exception:
        pass
    who = _join_names_fr(names)
    title = (
        f"{who} sont partants 🎉"
        if len(names) > 1
        else f"{who} est partante 🎉"
    )
    body = f"{city}, {out} → {ret} : vous êtes {member_count}."
    tokens = _tokens_for_users(supabase, [organizer_id], pref="notif_group")
    toks = [t["token"] for t in tokens]
    return _deliver(
        supabase,
        user_id=organizer_id,
        tokens=toks,
        kind=KIND_GROUP_JOINED,
        entity_id=str(trip["id"]),
        title=title,
        body=body,
        data={
            "trip_id": str(trip["id"]),
            "screen": "TripDetail",
        },
        entity_type="trip",
    )


def run_flush_join_batches(supabase: Any) -> Dict[str, Any]:
    summary = {"ok": True, "flushed": 0, "errors": 0}
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    now = _now_utc().isoformat()
    try:
        res = (
            supabase.table("push_group_join_batch")
            .select("*")
            .lte("flush_after", now)
            .limit(50)
            .execute()
        )
    except Exception as e:
        return {"ok": False, "error": str(e)}
    for row in res.data or []:
        trip_id = row.get("trip_id")
        org = row.get("organizer_id")
        names = list(row.get("joiner_names") or [])
        try:
            trip_res = (
                supabase.table("planned_trips")
                .select("*")
                .eq("id", trip_id)
                .limit(1)
                .execute()
            )
            trip = (trip_res.data or [None])[0]
            if trip and org and names:
                _send_joined_now(
                    supabase, trip=trip, organizer_id=str(org), names=names
                )
                summary["flushed"] += 1
            supabase.table("push_group_join_batch").delete().eq(
                "trip_id", trip_id
            ).execute()
        except Exception as e:
            logger.warning("flush batch %s: %s", trip_id, e)
            summary["errors"] += 1
    return summary


# ——— #2 invite ———


def notify_invite(
    supabase: Any,
    *,
    trip: dict,
    organizer_name: str,
    invitee_email: str,
    invite_token: str,
    member_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Push if invitee has app token; else email."""
    from email_notify import WEB_APP_URL, send_email

    city = _trip_city(trip)
    orga = _first_name(organizer_name)
    title = f"{orga} t'invite à {city}"
    body = "Le programme est prêt, il manque ta réponse."
    user_ids = _user_ids_for_email(supabase, invitee_email)
    tokens = _tokens_for_users(supabase, user_ids, pref="notif_group")
    deep = f"waypop://planner/invite/{invite_token}"
    data = {
        "trip_id": str(trip.get("id")),
        "invite_token": invite_token,
        "screen": "PlannerInvite",
        "url": deep,
    }

    if tokens and user_ids:
        uid = str(user_ids[0])
        res = _deliver(
            supabase,
            user_id=uid,
            tokens=[t["token"] for t in tokens],
            kind=KIND_GROUP_INVITE,
            entity_id=str(member_id or invite_token),
            title=title,
            body=body,
            data=data,
            entity_type="trip",
        )
        if res.get("sent"):
            return {"ok": True, "channel": "push", **res}

    # Email fallback
    link = f"{WEB_APP_URL}/planner/invite/{invite_token}"
    html = f"""
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
      <h2 style="margin:0 0 12px;color:#E85A28">{title}</h2>
      <p>{body}</p>
      <p><a href="{link}" style="display:inline-block;background:#FF6B35;color:#fff;
         text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">
         Je suis partant</a></p>
      <p style="font-size:12px;color:#94a3b8">WayPop</p>
    </div>
    """
    sent = send_email([invitee_email], title, html)
    return {"ok": sent, "channel": "email"}


# ——— #3 48h nudge ———


def run_invite_nudges_48h(supabase: Any) -> Dict[str, Any]:
    summary = {"ok": True, "sent": 0, "skipped": 0, "errors": 0}
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    cutoff = (_now_utc() - timedelta(hours=48)).isoformat()
    try:
        res = (
            supabase.table("trip_members")
            .select("id,trip_id,email,user_id,display_name,invited_at,invite_nudge_sent_at,status")
            .eq("status", "guest")
            .is_("invite_nudge_sent_at", "null")
            .lte("invited_at", cutoff)
            .limit(80)
            .execute()
        )
    except Exception as e:
        # Column may be missing before migration
        logger.warning("invite nudge query: %s", e)
        return {"ok": False, "error": str(e)}

    for mem in res.data or []:
        trip_id = mem.get("trip_id")
        email = (mem.get("email") or "").strip().lower()
        try:
            trip_res = (
                supabase.table("planned_trips")
                .select("*")
                .eq("id", trip_id)
                .limit(1)
                .execute()
            )
            trip = (trip_res.data or [None])[0]
            if not trip:
                summary["skipped"] += 1
                continue
            city = _trip_city(trip)
            # Names already partants (joined)
            joined = (
                supabase.table("trip_members")
                .select("display_name,email,status")
                .eq("trip_id", trip_id)
                .eq("status", "joined")
                .limit(10)
                .execute()
            )
            names = [
                _first_name(m.get("display_name"), m.get("email"))
                for m in (joined.data or [])
            ]
            if trip.get("organizer_id"):
                try:
                    org = (
                        supabase.table("user_profiles")
                        .select("email,display_name,first_name")
                        .eq("id", trip["organizer_id"])
                        .limit(1)
                        .execute()
                    )
                    if org.data:
                        o = org.data[0]
                        names.insert(
                            0,
                            _first_name(
                                o.get("first_name") or o.get("display_name"),
                                o.get("email"),
                            ),
                        )
                except Exception:
                    pass
            # unique preserve order
            seen = set()
            uniq = []
            for n in names:
                if n not in seen:
                    seen.add(n)
                    uniq.append(n)
            who = _join_names_fr(uniq[:4])
            title = "Le groupe attend ta réponse"
            body = f"{city} : {who} sont partants."
            user_ids = _user_ids_for_email(supabase, email) if email else []
            if mem.get("user_id"):
                user_ids = [str(mem["user_id"])]
            tokens = _tokens_for_users(supabase, user_ids, pref="notif_group")
            invite_token = trip.get("invite_token") or ""
            if tokens and user_ids:
                r = _deliver(
                    supabase,
                    user_id=str(user_ids[0]),
                    tokens=[t["token"] for t in tokens],
                    kind=KIND_GROUP_INVITE_NUDGE,
                    entity_id=str(mem["id"]),
                    title=title,
                    body=body,
                    data={
                        "trip_id": str(trip_id),
                        "invite_token": invite_token,
                        "screen": "PlannerInvite",
                    },
                    entity_type="trip",
                )
                if r.get("sent"):
                    summary["sent"] += 1
                else:
                    summary["skipped"] += 1
            else:
                summary["skipped"] += 1
            supabase.table("trip_members").update(
                {"invite_nudge_sent_at": _now_utc().isoformat()}
            ).eq("id", mem["id"]).execute()
        except Exception as e:
            logger.warning("nudge %s: %s", mem.get("id"), e)
            summary["errors"] += 1
    return summary


# ——— #4 dates ———


def notify_dates_set(
    supabase: Any,
    *,
    trip: dict,
    organizer_id: str,
    organizer_name: str,
) -> Dict[str, Any]:
    city = _trip_city(trip)
    out, ret = _trip_dates_label(trip)
    orga = _first_name(organizer_name)
    title = f"Dates fixées : {out} → {ret}"
    body = f"{orga} a calé le week-end à {city}."
    try:
        mems = (
            supabase.table("trip_members")
            .select("user_id")
            .eq("trip_id", trip["id"])
            .execute()
        )
        uids = {
            str(m["user_id"])
            for m in (mems.data or [])
            if m.get("user_id")
        }
    except Exception:
        uids = set()
    if organizer_id:
        uids.add(str(organizer_id))
    # Don't notify organizer? Spec says « tout le groupe » — include all with tokens
    sent = 0
    for uid in uids:
        tokens = _tokens_for_users(supabase, [uid], pref="notif_group")
        if not tokens:
            continue
        r = _deliver(
            supabase,
            user_id=uid,
            tokens=[t["token"] for t in tokens],
            kind=KIND_GROUP_DATES,
            entity_id=f"{trip['id']}:{out}:{ret}",
            title=title,
            body=body,
            data={"trip_id": str(trip["id"]), "screen": "TripDetail"},
            entity_type="trip",
        )
        sent += int(r.get("sent") or 0)
    return {"ok": True, "sent": sent}


# ——— #5 pop plan nudge ———


def _next_saturday_or_sunday(*, prefer_sunday: bool = False) -> date:
    today = _now_paris().date()
    # 0=Mon … 5=Sat 6=Sun
    if prefer_sunday:
        days = (6 - today.weekday()) % 7
        if days == 0:
            days = 7
        return today + timedelta(days=days)
    days = (5 - today.weekday()) % 7
    if days == 0:
        days = 7
    return today + timedelta(days=days)


def run_pop_plan_nudges(supabase: Any) -> Dict[str, Any]:
    """Wed/Thu only: liked itinerary ≥3d ago, not yet on a planner trip."""
    summary = {"ok": True, "sent": 0, "skipped": 0}
    local = _now_paris()
    # Wednesday=2, Thursday=3
    if local.weekday() not in (2, 3):
        return {**summary, "skipped_reason": "not_wed_thu"}
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    cutoff = (_now_utc() - timedelta(days=3)).isoformat()
    try:
        likes = (
            supabase.table("liked_itineraries")
            .select("id,user_id,itinerary_id,itinerary_data,created_at")
            .lte("created_at", cutoff)
            .order("created_at", desc=False)
            .limit(100)
            .execute()
        )
    except Exception as e:
        return {"ok": False, "error": str(e)}

    for like in likes.data or []:
        uid = str(like.get("user_id") or "")
        iid = str(like.get("itinerary_id") or "")
        if not uid or not iid:
            continue
        if _already_sent(
            supabase, kind=KIND_POP_PLAN, entity_id=iid, user_id=uid
        ):
            summary["skipped"] += 1
            continue
        # Already in planner?
        try:
            trips = (
                supabase.table("planned_trips")
                .select("id,meta")
                .eq("organizer_id", uid)
                .neq("status", "archived")
                .limit(40)
                .execute()
            )
            linked = False
            for t in trips.data or []:
                meta = t.get("meta") if isinstance(t.get("meta"), dict) else {}
                if str(meta.get("source_itinerary_id") or "") == iid:
                    linked = True
                    break
            if linked:
                summary["skipped"] += 1
                continue
        except Exception:
            pass

        data = like.get("itinerary_data") if isinstance(like.get("itinerary_data"), dict) else {}
        title_pop = (
            data.get("title")
            or data.get("name")
            or data.get("city")
            or "ton Pop"
        )
        prefer_sun = bool(
            data.get("prefer_sunday")
            or (data.get("best_day") or "").lower() in ("sunday", "dimanche")
        )
        day = _next_saturday_or_sunday(prefer_sunday=prefer_sun)
        day_label = "dimanche" if day.weekday() == 6 else "samedi"
        title = f"On le planifie {day_label} ?"
        body = f"Tu as gardé {title_pop}."
        tokens = _tokens_for_users(supabase, [uid], pref="notif_pops")
        if not tokens:
            summary["skipped"] += 1
            continue
        r = _deliver(
            supabase,
            user_id=uid,
            tokens=[t["token"] for t in tokens],
            kind=KIND_POP_PLAN,
            entity_id=iid,
            title=title,
            body=body,
            data={
                "itinerary_id": iid,
                "proposed_date": day.isoformat(),
                "screen": "AddToPlanner",
            },
            entity_type="pop",
        )
        if r.get("sent"):
            summary["sent"] += 1
        else:
            summary["skipped"] += 1
    return summary


# ——— #6 eve before ———


def run_pop_eve(supabase: Any) -> Dict[str, Any]:
    """~19h Paris: trips departing tomorrow → first stop push."""
    summary = {"ok": True, "sent": 0, "skipped": 0}
    local = _now_paris()
    if local.hour < 18 or local.hour > 20:
        return {**summary, "skipped_reason": "outside_19h_window"}
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    tomorrow = (local.date() + timedelta(days=1)).isoformat()
    try:
        trips = (
            supabase.table("planned_trips")
            .select("id,name,out_date,organizer_id,meta,dates_depart")
            .eq("out_date", tomorrow)
            .neq("status", "archived")
            .limit(80)
            .execute()
        )
    except Exception as e:
        # Fallback dates_depart JSON harder — try out_date only
        return {"ok": False, "error": str(e)}

    for trip in trips.data or []:
        tid = str(trip["id"])
        if _already_sent(supabase, kind=KIND_POP_EVE, entity_id=tid):
            summary["skipped"] += 1
            continue
        stop_label, stop_time = _first_stop(supabase, tid)
        title = "Ton Pop commence demain"
        body = f"Premier stop à {stop_time} : {stop_label}."
        uids = set()
        if trip.get("organizer_id"):
            uids.add(str(trip["organizer_id"]))
        try:
            mems = (
                supabase.table("trip_members")
                .select("user_id")
                .eq("trip_id", tid)
                .execute()
            )
            for m in mems.data or []:
                if m.get("user_id"):
                    uids.add(str(m["user_id"]))
        except Exception:
            pass
        for uid in uids:
            tokens = _tokens_for_users(supabase, [uid], pref="notif_pops")
            if not tokens:
                continue
            r = _deliver(
                supabase,
                user_id=uid,
                tokens=[t["token"] for t in tokens],
                kind=KIND_POP_EVE,
                entity_id=tid,
                title=title,
                body=body,
                data={
                    "trip_id": tid,
                    "screen": "TripProgramme",
                    "day": 1,
                    "action": "launch",
                },
                entity_type="trip",
                defer_quiet=False,
            )
            if r.get("sent"):
                summary["sent"] += 1
            else:
                summary["skipped"] += 1
    return summary


def _first_stop(supabase: Any, trip_id: str) -> Tuple[str, str]:
    try:
        items = (
            supabase.table("trip_items")
            .select("meta,places(name),item_type,status")
            .eq("planned_trip_id", trip_id)
            .in_("item_type", ["activity", "restaurant", "place"])
            .order("sort_order")
            .limit(5)
            .execute()
        )
        for it in items.data or []:
            pl = it.get("places") if isinstance(it.get("places"), dict) else {}
            name = (pl or {}).get("name")
            meta = it.get("meta") if isinstance(it.get("meta"), dict) else {}
            if not name:
                name = meta.get("title") or meta.get("name")
            if name:
                t = meta.get("start_time") or meta.get("time") or "10 h"
                t = str(t).replace(":00", " h").replace(":", " h ")
                if "h" not in t.lower():
                    t = f"{t} h"
                return str(name), t
    except Exception as e:
        logger.debug("first_stop: %s", e)
    return "le premier stop", "10 h"
