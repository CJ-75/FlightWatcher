import traceback
from datetime import datetime, timedelta

from fastapi import APIRouter, Request

from api_models import SearchEventRequest, BookingSasEventRequest
from supabase_deps import (
    SUPABASE_AVAILABLE,
    get_supabase_client,
    get_user_id_from_token,
    optional_auth,
)

router = APIRouter()


@router.post("/api/analytics/search-event")
@optional_auth
async def track_search_event(event: SearchEventRequest, request: Request):
    """Enregistre un événement de recherche pour analytics"""
    if not SUPABASE_AVAILABLE:
        print("⚠️  Supabase non disponible, événement de recherche non enregistré")
        return {"status": "skipped", "reason": "supabase_not_available"}

    try:
        user_id = get_user_id_from_token(request)
        supabase = get_supabase_client()

        client_ip = request.client.host if request.client else None
        user_agent = event.user_agent or request.headers.get("user-agent")

        session_id = event.session_id
        if not session_id:
            cookie_header = request.headers.get("cookie", "")
            if cookie_header:
                for cookie in cookie_header.split(";"):
                    if "flightwatcher_session_id" in cookie:
                        session_id = cookie.split("=")[1].strip()
                        break

        print(f"📊 Analytics search_event - user_id: {user_id}, session_id: {session_id}")

        data = {
            "user_id": user_id,
            "session_id": session_id,
            "departure_airport": event.departure_airport,
            "date_preset": event.date_preset,
            "budget": event.budget,
            "dates_depart": [d.model_dump() for d in event.dates_depart],
            "dates_retour": [d.model_dump() for d in event.dates_retour],
            "destinations_exclues": event.destinations_exclues or [],
            "limite_allers": event.limite_allers,
            "results_count": event.results_count or 0,
            "results": [
                r if isinstance(r, dict) else r.model_dump() if hasattr(r, 'model_dump') else r
                for r in (event.results or [])
            ],
            "search_duration_ms": event.search_duration_ms,
            "api_requests_count": event.api_requests_count,
            "source": event.source or "web",
            "user_agent": user_agent,
            "ip_address": client_ip,
        }

        result = supabase.table("search_events").insert(data).execute()

        print(f"✅ Événement search_event enregistré avec succès: {result.data[0]['id'] if result.data else 'N/A'}")

        return {"status": "success", "id": result.data[0]["id"] if result.data else None}
    except Exception as e:
        print(f"⚠️  Erreur enregistrement événement de recherche: {str(e)}")
        return {"status": "error", "message": str(e)}


@router.post("/api/analytics/booking-sas-event")
@optional_auth
async def track_booking_sas_event(event: BookingSasEventRequest, request: Request):
    """Enregistre un événement de clic sur le SAS de réservation pour analytics"""
    if not SUPABASE_AVAILABLE:
        print("⚠️  Supabase non disponible, événement SAS non enregistré")
        return {"status": "skipped", "reason": "supabase_not_available"}

    try:
        user_id = get_user_id_from_token(request)
        supabase = get_supabase_client()

        client_ip = request.client.host if request.client else None
        user_agent = event.user_agent or request.headers.get("user-agent")

        trip_id = f"{event.trip.destination_code}-{event.trip.aller.departureTime}-{event.trip.retour.departureTime}"

        session_id = event.session_id
        if not session_id:
            cookie_header = request.headers.get("cookie", "")
            if cookie_header:
                for cookie in cookie_header.split(";"):
                    if "flightwatcher_session_id" in cookie:
                        session_id = cookie.split("=")[1].strip()
                        break

        data = {
            "user_id": user_id,
            "session_id": session_id,
            "search_event_id": event.search_event_id,
            "trip_id": trip_id,
            "destination_code": event.trip.destination_code,
            "destination_name": event.trip.aller.destinationFull.split(',')[0].strip(),
            "departure_airport": event.trip.aller.origin,
            "total_price": float(event.trip.prix_total),
            "trip_data": event.trip.model_dump(),
            "partner_id": event.partner_id,
            "partner_name": event.partner_name,
            "redirect_url": event.redirect_url,
            "action_type": event.action_type or "redirect",
            "countdown_seconds": event.countdown_seconds,
            "source": event.source or "web",
            "user_agent": user_agent,
            "ip_address": client_ip,
        }

        print(f"📊 Analytics booking_sas_event - search_event_id: {event.search_event_id}, user_id: {user_id}, session_id: {session_id}")

        ten_seconds_ago = (datetime.now() - timedelta(seconds=10)).isoformat()

        duplicate_query = supabase.table("booking_sas_events")\
            .select("id")\
            .eq("trip_id", trip_id)\
            .eq("partner_id", event.partner_id)\
            .gte("created_at", ten_seconds_ago)\
            .limit(1)

        if session_id:
            duplicate_query = duplicate_query.eq("session_id", session_id)
        elif user_id:
            duplicate_query = duplicate_query.eq("user_id", user_id)

        duplicate_check = duplicate_query.execute()

        if duplicate_check.data and len(duplicate_check.data) > 0:
            print(f"⚠️  Événement booking_sas_event déjà enregistré récemment (doublon évité): {duplicate_check.data[0]['id']}")
            return {"status": "skipped", "reason": "duplicate", "id": duplicate_check.data[0]['id']}

        result = supabase.table("booking_sas_events").insert(data).execute()

        print(f"✅ Événement booking_sas_event enregistré avec succès: {result.data[0]['id'] if result.data else 'N/A'}")

        return {"status": "success", "id": result.data[0]["id"] if result.data else None}
    except Exception as e:
        print(f"⚠️  Erreur enregistrement événement SAS: {str(e)}")
        traceback.print_exc()
        return {"status": "error", "message": str(e)}
