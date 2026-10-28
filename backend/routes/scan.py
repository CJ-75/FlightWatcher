import asyncio
import hashlib
import json
import queue
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from api_models import (
    DateAvecHoraire,
    ScanRequest,
    ScanResponse,
    TripResponse,
    AutoCheckResponse,
    InspireRequest,
    InspireResponse,
)
from flight_scanner import (
    scanner_vols_api,
    get_dates_from_preset,
    enrich_trip_results,
    enrich_trip_results_fast,
)
from scan_log import slog, slog_banner, slog_dates, slog_provider_results
from supabase_deps import SUPABASE_AVAILABLE, get_supabase_service_client, optional_auth

router = APIRouter()

# Dedicated pool so inspire/scan never stall the asyncio loop (hotels/other routes stay responsive)
_SCAN_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="fw-scan")


def _print_provider_breakdown(origin: str, merged_n: int) -> None:
    """Always print Ryanair / Travelpayouts counts in the uvicorn terminal."""
    try:
        from providers.orchestrator import get_last_provider_counts

        last = get_last_provider_counts()
        if last.get("counts") is not None:
            slog_provider_results(
                last.get("counts") or {},
                merged_n=int(last.get("merged_n") or merged_n),
                origin=str(last.get("origin") or origin or "?"),
                elapsed_s=float(last.get("elapsed_s") or 0),
                pending_names=last.get("pending") or None,
            )
            return
    except Exception as e:
        slog(f"provider counts: {e}")
    slog_provider_results(
        {},
        merged_n=merged_n,
        origin=(origin or "?").upper(),
    )


def generate_cache_key(request: ScanRequest) -> str:
    """Génère une clé de cache unique pour une requête"""
    cache_data = {
        "departure_airport": request.aeroport_depart or "BVA",
        "budget_max": request.budget_max or 200,
        "passengers": max(1, min(6, int(request.passengers or 1))),
        "dates_depart": [d.model_dump() for d in request.dates_depart],
        "dates_retour": [d.model_dump() for d in request.dates_retour],
        "destinations_exclues": sorted(request.destinations_exclues or []),
        "destinations_incluses": sorted(request.destinations_incluses) if request.destinations_incluses else None,
        "direct": bool(request.direct),
    }
    cache_str = json.dumps(cache_data, sort_keys=True)
    return hashlib.md5(cache_str.encode()).hexdigest()


@router.post("/api/scan", response_model=ScanResponse)
@optional_auth
async def scan_flights(request: ScanRequest, http_request: Request = None):
    """Scan les vols avec paramètres personnalisés et cache"""
    slog_banner("🔍 POST /api/scan — requête reçue")
    slog(f"  origine     : {request.aeroport_depart or 'BVA'}")
    slog(f"  budget      : {request.budget_max or 200} €/pers")
    slog(f"  voyageurs   : {request.passengers or 1}")
    slog(f"  directs     : {bool(request.direct)}")
    slog(f"  limite_allers: {request.limite_allers or 50}")
    slog_dates("départs", request.dates_depart)
    slog_dates("retours", request.dates_retour)
    if request.destinations_incluses:
        slog(f"  inclus      : {request.destinations_incluses}")
    if request.destinations_exclues:
        slog(f"  exclus      : {request.destinations_exclues}")
    try:
        cache_key = generate_cache_key(request)
        cached_result = None

        if SUPABASE_AVAILABLE:
            try:
                supabase_service = get_supabase_service_client()
                if supabase_service:
                    cache_result = supabase_service.table("search_results_cache")\
                        .select("results, expires_at, hit_count")\
                        .eq("cache_key", cache_key)\
                        .gt("expires_at", datetime.now().isoformat())\
                        .execute()

                    if cache_result.data and len(cache_result.data) > 0:
                        cached = cache_result.data[0]
                        supabase_service.table("search_results_cache")\
                            .update({
                                "hit_count": (cached.get("hit_count", 0) or 0) + 1,
                                "last_hit_at": datetime.now().isoformat(),
                            })\
                            .eq("cache_key", cache_key)\
                            .execute()

                        cached_result = cached["results"]
                        slog(
                            f"✅ Cache HIT (#{(cached.get('hit_count', 0) or 0) + 1}) "
                            f"— {len(cached_result)} voyage(s), 0 requête provider"
                        )
            except Exception as e:
                slog(f"⚠️ Erreur vérification cache: {e}")

        if cached_result:
            slog(f"🏁 Scan terminé (cache): {len(cached_result)} voyage(s)")
            return ScanResponse(
                resultats=[TripResponse(**r) for r in cached_result],
                nombre_requetes=0,
                message=f"Scan terminé (cache): {len(cached_result)} voyage(s) trouvé(s)",
            )

        slog("⏳ Scan live (Ryanair + Travelpayouts)…")

        def _run_scan():
            from search_priority import search_active

            with search_active():
                return scanner_vols_api(
                    aeroport_depart=request.aeroport_depart or "BVA",
                    dates_depart=request.dates_depart,
                    dates_retour=request.dates_retour,
                    budget_max=request.budget_max or 200,
                    limite_allers=request.limite_allers or 50,
                    destinations_exclues=request.destinations_exclues or [],
                    destinations_incluses=request.destinations_incluses,
                    record_prices=True,
                    passengers=request.passengers or 1,
                    direct=bool(request.direct),
                )

        loop = asyncio.get_running_loop()
        resultats, num_requetes = await loop.run_in_executor(_SCAN_POOL, _run_scan)
        _print_provider_breakdown(request.aeroport_depart or "BVA", len(resultats or []))

        # Cache write off the critical path — vols d’abord
        if SUPABASE_AVAILABLE and resultats:
            def _write_cache() -> None:
                try:
                    supabase_service = get_supabase_service_client()
                    if not supabase_service:
                        return
                    expires_at = (datetime.now().timestamp() + 3600) * 1000
                    expires_at_iso = datetime.fromtimestamp(expires_at / 1000).isoformat()
                    cache_data = {
                        "cache_key": cache_key,
                        "departure_airport": request.aeroport_depart or "BVA",
                        "budget_max": request.budget_max or 200,
                        "dates_depart": [d.model_dump() for d in request.dates_depart],
                        "dates_retour": [d.model_dump() for d in request.dates_retour],
                        "results": [r.model_dump() for r in resultats],
                        "expires_at": expires_at_iso,
                        "hit_count": 0,
                    }
                    supabase_service.table("search_results_cache").upsert(
                        cache_data, on_conflict="cache_key"
                    ).execute()
                    slog(f"✅ Résultats mis en cache (clé: {cache_key[:8]}...)")
                except Exception as e:
                    slog(f"⚠️ Erreur mise en cache: {e}")

            loop.run_in_executor(_SCAN_POOL, _write_cache)

        slog(
            f"🏁 Scan terminé: {len(resultats)} voyage(s), "
            f"{num_requetes} requête(s) provider"
        )
        return ScanResponse(
            resultats=resultats,
            nombre_requetes=num_requetes,
            message=f"Scan terminé: {len(resultats)} voyage(s) trouvé(s)",
        )
    except Exception as e:
        slog(f"❌ Scan erreur: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/inspire", response_model=InspireResponse)
@optional_auth
async def inspire_trip(request: InspireRequest, http_request: Request = None):
    """Endpoint simplifié pour mode découverte avec enrichissement"""
    slog_banner("POST /api/inspire")
    slog(f"  origine     : {request.departure}")
    slog(f"  preset      : {request.date_preset}")
    slog(f"  budget      : {request.budget} €/pers")
    slog(f"  voyageurs   : {request.passengers or 1}")
    slog(f"  directs     : {bool(request.direct)}")
    # Vols/Search = world destinations (uncapped). Séjours/Deals use their own caps.
    inspire_limite = 0
    slog(f"  limite_allers: unlimited (Search)")
    if request.destinations_exclues:
        slog(f"  exclus      : {request.destinations_exclues}")
    try:
        if request.flexible_dates:
            dates_depart_raw = request.flexible_dates.get('dates_depart', [])
            dates_retour_raw = request.flexible_dates.get('dates_retour', [])

            dates_depart = []
            for d in dates_depart_raw:
                if isinstance(d, dict):
                    dates_depart.append(DateAvecHoraire(**d))
                else:
                    dates_depart.append(d)

            dates_retour = []
            for d in dates_retour_raw:
                if isinstance(d, dict):
                    dates_retour.append(DateAvecHoraire(**d))
                else:
                    dates_retour.append(d)
            slog("  dates       : flexible_dates (payload client)")
        else:
            dates_depart, dates_retour = get_dates_from_preset(request.date_preset)
            slog(f"  dates       : générées depuis preset « {request.date_preset} »")

        slog_dates("départs", dates_depart)
        slog_dates("retours", dates_retour)

        if not dates_depart or not dates_retour:
            raise HTTPException(status_code=400, detail="Impossible de générer les dates pour ce preset")

        slog("⏳ Scan live (Ryanair + Travelpayouts)…")

        def _inspire_scan_and_enrich():
            from search_priority import search_active

            # Vols first — no hotel / LiteAPI on this path; hotel workers yield
            with search_active():
                trips, nq = scanner_vols_api(
                    aeroport_depart=request.departure,
                    dates_depart=dates_depart,
                    dates_retour=dates_retour,
                    budget_max=request.budget,
                    limite_allers=inspire_limite,
                    destinations_exclues=request.destinations_exclues or [],
                    destinations_incluses=None,
                    record_prices=True,
                    passengers=request.passengers or 1,
                    direct=bool(request.direct),
                )
                enriched = enrich_trip_results(trips, request.departure)
                enriched.sort(key=lambda t: t.prix_total)
                return enriched, nq

        loop = asyncio.get_running_loop()
        enriched_results, num_requetes = await loop.run_in_executor(
            _SCAN_POOL, _inspire_scan_and_enrich
        )

        _print_provider_breakdown(request.departure or "?", len(enriched_results or []))

        slog(
            f"Inspire done: {len(enriched_results)} destination(s), "
            f"{num_requetes} provider request(s)"
        )
        if enriched_results:
            top = enriched_results[:5]
            for t in top:
                slog(
                    f"  - {t.destination_code or '?'} "
                    f"{getattr(t, 'prix_total', '?')}EUR "
                    f"[{getattr(t, 'provider', '?')}]"
                )
        return InspireResponse(
            resultats=enriched_results,
            nombre_requetes=num_requetes,
            message=(
                f"{len(enriched_results)} destination(s) trouvée(s) "
                f"pour {request.budget}€/pers"
                f"{f' × {request.passengers or 1}' if (request.passengers or 1) > 1 else ''}"
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        slog(f"❌ Inspire erreur: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _parse_inspire_dates(request: InspireRequest):
    if request.flexible_dates:
        dates_depart_raw = request.flexible_dates.get("dates_depart", [])
        dates_retour_raw = request.flexible_dates.get("dates_retour", [])
        dates_depart = []
        for d in dates_depart_raw:
            if isinstance(d, dict):
                dates_depart.append(DateAvecHoraire(**d))
            else:
                dates_depart.append(d)
        dates_retour = []
        for d in dates_retour_raw:
            if isinstance(d, dict):
                dates_retour.append(DateAvecHoraire(**d))
            else:
                dates_retour.append(d)
    else:
        dates_depart, dates_retour = get_dates_from_preset(request.date_preset)
    return dates_depart, dates_retour


@router.post("/api/inspire/stream")
@optional_auth
async def inspire_trip_stream(request: InspireRequest, http_request: Request = None):
    """
    Progressive inspire (NDJSON): serve whichever provider finishes first
    (Ryanair, Travelpayouts, …), then append others in chunks of 3.
    """
    from providers.orchestrator import search_roundtrips_stream
    from search_priority import search_active

    slog_banner("POST /api/inspire/stream")
    # Vols/Search = world destinations (uncapped). Séjours/Deals stay separate.
    inspire_limite = 0
    slog(f"  origine={request.departure} budget={request.budget} limite=unlimited")

    try:
        dates_depart, dates_retour = _parse_inspire_dates(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not dates_depart or not dates_retour:
        raise HTTPException(status_code=400, detail="Impossible de générer les dates pour ce preset")

    chunk_size = 3
    event_q: queue.Queue = queue.Queue()

    def _worker() -> None:
        total_nq = 0
        painted = 0
        try:
            with search_active():
                for ev in search_roundtrips_stream(
                    aeroport_depart=request.departure,
                    dates_depart=dates_depart,
                    dates_retour=dates_retour,
                    budget_max=request.budget,
                    limite_allers=inspire_limite,
                    destinations_exclues=request.destinations_exclues or [],
                    destinations_incluses=None,
                    record_prices=True,
                    passengers=request.passengers or 1,
                    direct=bool(request.direct),
                ):
                    if ev.get("done"):
                        total_nq = int(ev.get("nq") or total_nq)
                        break
                    total_nq += int(ev.get("nq") or 0)
                    trips = ev.get("trips") or []
                    if not trips:
                        continue
                    origin = str(ev.get("origin") or request.departure)
                    # Fast enrich — no avg-price RPC (keeps stream non-blocking)
                    enriched = enrich_trip_results_fast(trips, origin)
                    enriched.sort(key=lambda t: t.prix_total)
                    provider = str(ev.get("provider") or "?")
                    for i in range(0, len(enriched), chunk_size):
                        chunk = enriched[i : i + chunk_size]
                        painted += len(chunk)
                        event_q.put(
                            {
                                "type": "batch",
                                "provider": provider,
                                "origin": origin,
                                "resultats": [
                                    t.model_dump() if hasattr(t, "model_dump") else t.dict()
                                    for t in chunk
                                ],
                                "done": False,
                            }
                        )
            event_q.put(
                {
                    "type": "done",
                    "nombre_requetes": total_nq,
                    "total": painted,
                    "message": (
                        f"{painted} destination(s) trouvée(s) "
                        f"pour {request.budget}€/pers"
                    ),
                    "done": True,
                }
            )
        except Exception as e:
            slog(f"❌ Inspire stream erreur: {e}")
            event_q.put({"type": "error", "message": str(e), "done": True})
        finally:
            event_q.put(None)

    _SCAN_POOL.submit(_worker)

    async def _ndjson():
        loop = asyncio.get_running_loop()
        while True:
            item = await loop.run_in_executor(None, event_q.get)
            if item is None:
                break
            yield json.dumps(item, ensure_ascii=False) + "\n"

    return StreamingResponse(
        _ndjson(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/api/auto-check")
async def auto_check_flights(request: Request):
    """Vérifie automatiquement les vols et identifie les nouveaux résultats"""
    try:
        body = await request.json()
        search_id = body.get("search_id")
        previous_results_data = body.get("previous_results", [])

        scan_request = ScanRequest(
            aeroport_depart=body.get("aeroport_depart", "BVA"),
            dates_depart=[DateAvecHoraire(**d) if isinstance(d, dict) else d for d in body.get("dates_depart", [])],
            dates_retour=[DateAvecHoraire(**d) if isinstance(d, dict) else d for d in body.get("dates_retour", [])],
            budget_max=body.get("budget_max", 200),
            limite_allers=body.get("limite_allers", 50),
            destinations_exclues=body.get("destinations_exclues", []),
            destinations_incluses=body.get("destinations_incluses"),
            passengers=body.get("passengers", 1),
            direct=bool(body.get("direct", False)),
        )

        resultats, num_requetes = scanner_vols_api(
            aeroport_depart=scan_request.aeroport_depart or "BVA",
            dates_depart=scan_request.dates_depart,
            dates_retour=scan_request.dates_retour,
            budget_max=scan_request.budget_max or 200,
            limite_allers=scan_request.limite_allers or 50,
            destinations_exclues=scan_request.destinations_exclues or [],
            destinations_incluses=scan_request.destinations_incluses,
            passengers=scan_request.passengers or 1,
            direct=bool(scan_request.direct),
        )

        previous_results = []
        if previous_results_data:
            for prev_data in previous_results_data:
                if isinstance(prev_data, dict):
                    previous_results.append(TripResponse(**prev_data))
                else:
                    previous_results.append(prev_data)

        nouveaux_resultats = []
        if previous_results:
            previous_ids = set()
            for prev_trip in previous_results:
                trip_id = (
                    prev_trip.destination_code,
                    prev_trip.aller.departureTime,
                    prev_trip.retour.departureTime,
                )
                previous_ids.add(trip_id)

            for trip in resultats:
                trip_id = (
                    trip.destination_code,
                    trip.aller.departureTime,
                    trip.retour.departureTime,
                )
                if trip_id not in previous_ids:
                    nouveaux_resultats.append(trip)
        else:
            nouveaux_resultats = resultats

        return AutoCheckResponse(
            search_id=search_id,
            current_results=resultats,
            new_results=nouveaux_resultats,
            nombre_requetes=num_requetes,
            message=f"{len(nouveaux_resultats)} nouveau(x) résultat(s) trouvé(s) sur {len(resultats)} total",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
