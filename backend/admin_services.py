"""
Services métier pour le panneau d'administration
"""
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
from supabase_client import get_supabase_client, get_supabase_service_client

class AdminService:
    """Service pour les opérations administratives"""
    
    @staticmethod
    def get_users(page: int = 1, page_size: int = 50, filters: Optional[Dict] = None) -> Dict:
        """Récupère la liste paginée des utilisateurs"""
        supabase = get_supabase_service_client() or get_supabase_client()
        
        query = supabase.table("user_profiles").select("*", count="exact")
        
        # Appliquer les filtres si fournis
        if filters:
            if filters.get("email"):
                query = query.ilike("email", f"%{filters['email']}%")
            if filters.get("is_admin") is not None:
                query = query.eq("is_admin", filters["is_admin"])
        
        # Pagination
        offset = (page - 1) * page_size
        query = query.order("created_at", desc=True).range(offset, offset + page_size - 1)
        
        result = query.execute()
        
        return {
            "users": result.data,
            "total": result.count if hasattr(result, 'count') else len(result.data),
            "page": page,
            "page_size": page_size
        }
    
    @staticmethod
    def get_user_details(user_id: str) -> Optional[Dict]:
        """Récupère les détails d'un utilisateur avec ses statistiques"""
        supabase = get_supabase_service_client() or get_supabase_client()
        
        # Récupérer le profil
        profile_result = supabase.table("user_profiles")\
            .select("*")\
            .eq("id", user_id)\
            .execute()
        
        if not profile_result.data:
            return None
        
        profile = profile_result.data[0]
        
        # Compter les recherches
        searches_result = supabase.table("saved_searches")\
            .select("id", count="exact")\
            .eq("user_id", user_id)\
            .execute()
        
        searches_count = searches_result.count if hasattr(searches_result, 'count') else len(searches_result.data)
        
        # Compter les favoris
        favorites_result = supabase.table("favorites")\
            .select("id", count="exact")\
            .eq("user_id", user_id)\
            .execute()
        
        favorites_count = favorites_result.count if hasattr(favorites_result, 'count') else len(favorites_result.data)
        
        # Compter les événements de recherche
        search_events_result = supabase.table("search_events")\
            .select("id", count="exact")\
            .eq("user_id", user_id)\
            .execute()
        
        search_events_count = search_events_result.count if hasattr(search_events_result, 'count') else len(search_events_result.data)
        
        return {
            **profile,
            "stats": {
                "searches_count": searches_count,
                "favorites_count": favorites_count,
                "search_events_count": search_events_count
            }
        }
    
    @staticmethod
    def get_searches(page: int = 1, page_size: int = 50, filters: Optional[Dict] = None) -> Dict:
        """Récupère la liste paginée des recherches sauvegardées"""
        try:
            supabase = get_supabase_service_client() or get_supabase_client()
            
            query = supabase.table("saved_searches").select("*, user_profiles(email, full_name)", count="exact")
            
            # Appliquer les filtres
            if filters:
                if filters.get("user_id"):
                    query = query.eq("user_id", filters["user_id"])
                if filters.get("departure_airport"):
                    query = query.eq("departure_airport", filters["departure_airport"])
                if filters.get("auto_check_enabled") is not None:
                    query = query.eq("auto_check_enabled", filters["auto_check_enabled"])
                if filters.get("date_from"):
                    query = query.gte("created_at", filters["date_from"])
                if filters.get("date_to"):
                    query = query.lte("created_at", filters["date_to"])
            
            # Pagination
            offset = (page - 1) * page_size
            query = query.order("created_at", desc=True).range(offset, offset + page_size - 1)
            
            result = query.execute()
            
            return {
                "searches": result.data if result.data else [],
                "total": result.count if hasattr(result, 'count') else (len(result.data) if result.data else 0),
                "page": page,
                "page_size": page_size
            }
        except Exception as e:
            print(f"❌ Erreur récupération searches: {e}")
            import traceback
            traceback.print_exc()
            return {
                "searches": [],
                "total": 0,
                "page": page,
                "page_size": page_size
            }
    
    @staticmethod
    def get_search_stats(start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> Dict:
        """Récupère les statistiques des recherches"""
        try:
            supabase = get_supabase_service_client() or get_supabase_client()
            
            if not start_date:
                start_date = datetime.now() - timedelta(days=30)
            if not end_date:
                end_date = datetime.now()
            
            # Total recherches
            total_result = supabase.table("saved_searches")\
                .select("id", count="exact")\
                .execute()
            
            total_searches = total_result.count if hasattr(total_result, 'count') else (len(total_result.data) if total_result.data else 0)
            
            # Recherches avec auto-check
            auto_check_count = 0
            try:
                auto_check_result = supabase.table("saved_searches")\
                    .select("id", count="exact")\
                    .eq("auto_check_enabled", True)\
                    .execute()
                
                auto_check_count = auto_check_result.count if hasattr(auto_check_result, 'count') else (len(auto_check_result.data) if auto_check_result.data else 0)
            except Exception as e:
                print(f"⚠️  Erreur récupération auto_check stats: {e}")
            
            # Recherches utilisées récemment
            recent_count = 0
            try:
                recent_result = supabase.table("saved_searches")\
                    .select("id", count="exact")\
                    .gte("last_used", (datetime.now() - timedelta(days=7)).isoformat())\
                    .execute()
                
                recent_count = recent_result.count if hasattr(recent_result, 'count') else (len(recent_result.data) if recent_result.data else 0)
            except Exception as e:
                print(f"⚠️  Erreur récupération recent searches: {e}")
            
            # Recherches par jour (30 derniers jours)
            searches_by_day = []
            for i in range(30):
                date = datetime.now() - timedelta(days=i)
                date_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
                date_end = date.replace(hour=23, minute=59, second=59, microsecond=999999)
                
                try:
                    day_result = supabase.table("saved_searches")\
                        .select("id", count="exact")\
                        .gte("created_at", date_start.isoformat())\
                        .lte("created_at", date_end.isoformat())\
                        .execute()
                    
                    searches_by_day.append({
                        "date": date_start.isoformat(),
                        "count": day_result.count if hasattr(day_result, 'count') else (len(day_result.data) if day_result.data else 0)
                    })
                except Exception as e:
                    searches_by_day.append({
                        "date": date_start.isoformat(),
                        "count": 0
                    })
            
            searches_by_day.reverse()  # Plus ancien en premier
            
            # Recherches par aéroport
            searches_by_airport = []
            try:
                airport_result = supabase.table("saved_searches")\
                    .select("departure_airport")\
                    .execute()
                
                if airport_result.data:
                    airport_counts = {}
                    for search in airport_result.data:
                        airport = search.get("departure_airport", "Non défini")
                        airport_counts[airport] = airport_counts.get(airport, 0) + 1
                    
                    searches_by_airport = [{"airport": k, "count": v} for k, v in airport_counts.items()]
            except Exception as e:
                print(f"⚠️  Erreur récupération airport stats: {e}")
            
            return {
                "total_searches": total_searches,
                "auto_check_enabled": auto_check_count,
                "recent_searches": recent_count,
                "searches_by_day": searches_by_day,
                "searches_by_airport": searches_by_airport
            }
        except Exception as e:
            print(f"❌ Erreur récupération search_stats: {e}")
            import traceback
            traceback.print_exc()
            return {
                "total_searches": 0,
                "auto_check_enabled": 0,
                "recent_searches": 0,
                "searches_by_day": [],
                "searches_by_airport": []
            }
    
    @staticmethod
    def get_booking_sas_events(page: int = 1, page_size: int = 50, filters: Optional[Dict] = None) -> Dict:
        """Récupère la liste paginée des événements Booking SAS avec les emails des utilisateurs"""
        try:
            supabase = get_supabase_service_client() or get_supabase_client()
            
            # Faire un JOIN avec user_profiles pour récupérer l'email
            query = supabase.table("booking_sas_events").select("*, user_profiles(email)", count="exact")
            
            # Appliquer les filtres
            if filters:
                if filters.get("user_id"):
                    query = query.eq("user_id", filters["user_id"])
                if filters.get("partner_id"):
                    query = query.eq("partner_id", filters["partner_id"])
                if filters.get("destination_code"):
                    query = query.eq("destination_code", filters["destination_code"])
                if filters.get("date_from"):
                    query = query.gte("created_at", filters["date_from"])
                if filters.get("date_to"):
                    query = query.lte("created_at", filters["date_to"])
            
            # Pagination
            offset = (page - 1) * page_size
            query = query.order("created_at", desc=True).range(offset, offset + page_size - 1)
            
            result = query.execute()
            
            # Formater les données pour inclure l'email de manière plus accessible
            formatted_events = []
            if result.data:
                for event in result.data:
                    formatted_event = {**event}
                    # Extraire l'email depuis user_profiles si disponible
                    if event.get("user_profiles") and isinstance(event["user_profiles"], list) and len(event["user_profiles"]) > 0:
                        formatted_event["user_email"] = event["user_profiles"][0].get("email")
                    elif event.get("user_profiles") and isinstance(event["user_profiles"], dict):
                        formatted_event["user_email"] = event["user_profiles"].get("email")
                    else:
                        formatted_event["user_email"] = None
                    formatted_events.append(formatted_event)
            
            return {
                "events": formatted_events,
                "total": result.count if hasattr(result, 'count') else (len(result.data) if result.data else 0),
                "page": page,
                "page_size": page_size
            }
        except Exception as e:
            print(f"❌ Erreur récupération booking_sas_events: {e}")
            import traceback
            traceback.print_exc()
            return {
                "events": [],
                "total": 0,
                "page": page,
                "page_size": page_size
            }
    
    @staticmethod
    def get_booking_sas_stats(start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> Dict:
        """Récupère les statistiques des événements Booking SAS"""
        try:
            supabase = get_supabase_service_client() or get_supabase_client()
            
            if not start_date:
                start_date = datetime.now() - timedelta(days=30)
            if not end_date:
                end_date = datetime.now()
            
            start_iso = start_date.isoformat()
            end_iso = end_date.isoformat()
            
            # Total clics
            total_result = supabase.table("booking_sas_events")\
                .select("id", count="exact")\
                .gte("created_at", start_iso)\
                .lte("created_at", end_iso)\
                .execute()
            
            total_clicks = total_result.count if hasattr(total_result, 'count') else (len(total_result.data) if total_result.data else 0)
            
            # Clics par jour
            clicks_by_day = []
            for i in range(30):
                date = datetime.now() - timedelta(days=i)
                date_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
                date_end = date.replace(hour=23, minute=59, second=59, microsecond=999999)
                
                try:
                    day_result = supabase.table("booking_sas_events")\
                        .select("id", count="exact")\
                        .gte("created_at", date_start.isoformat())\
                        .lte("created_at", date_end.isoformat())\
                        .execute()
                    
                    clicks_by_day.append({
                        "date": date_start.isoformat(),
                        "count": day_result.count if hasattr(day_result, 'count') else (len(day_result.data) if day_result.data else 0)
                    })
                except Exception as e:
                    clicks_by_day.append({
                        "date": date_start.isoformat(),
                        "count": 0
                    })
            
            clicks_by_day.reverse()
            
            # Répartition par partenaire
            partner_counts = {}
            try:
                partner_result = supabase.table("booking_sas_events")\
                    .select("partner_id, partner_name")\
                    .gte("created_at", start_iso)\
                    .lte("created_at", end_iso)\
                    .execute()
                
                if partner_result.data:
                    for event in partner_result.data:
                        partner_id = event.get("partner_id", "unknown")
                        partner_name = event.get("partner_name", "Unknown")
                        partner_counts[partner_id] = partner_counts.get(partner_id, {"name": partner_name, "count": 0})
                        partner_counts[partner_id]["count"] += 1
            except Exception as e:
                print(f"⚠️  Erreur récupération partner stats: {e}")
            
            # Prix moyen
            avg_price = 0
            try:
                price_result = supabase.table("booking_sas_events")\
                    .select("total_price")\
                    .gte("created_at", start_iso)\
                    .lte("created_at", end_iso)\
                    .execute()
                
                if price_result.data:
                    prices = [float(e.get("total_price", 0)) for e in price_result.data if e.get("total_price")]
                    avg_price = sum(prices) / len(prices) if prices else 0
            except Exception as e:
                print(f"⚠️  Erreur récupération prix moyen: {e}")
            
            return {
                "total_clicks": total_clicks,
                "clicks_by_day": clicks_by_day,
                "partner_distribution": partner_counts,
                "avg_price": round(avg_price, 2),
                "unique_users": 0,  # À calculer si nécessaire
                "unique_sessions": 0,  # À calculer si nécessaire
                "conversion_rate": 0.0  # À calculer si nécessaire
            }
        except Exception as e:
            print(f"❌ Erreur récupération booking_sas_stats: {e}")
            import traceback
            traceback.print_exc()
            return {
                "total_clicks": 0,
                "clicks_by_day": [],
                "partner_distribution": {},
                "avg_price": 0,
                "unique_users": 0,
                "unique_sessions": 0,
                "conversion_rate": 0.0
            }

