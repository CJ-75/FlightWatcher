"""
Tracking de l'historique des prix pour FlightWatcher
Enregistre les prix dans price_history pour analytics futures
"""
from typing import List, Dict, Any
from backend.supabase_client import get_supabase_service_client
import logging

logger = logging.getLogger(__name__)

def record_price_history(trips: List[Dict[str, Any]]) -> None:
    """
    Enregistre les prix des vols dans price_history pour analytics
    
    Args:
        trips: Liste des voyages (dict) trouvés lors d'un scan
    
    Note: Cette fonction ne doit pas bloquer le scan si elle échoue
    """
    if not trips:
        return
    
    try:
        supabase = get_supabase_service_client()
        
        if not supabase:
            # Service role key non configurée, on skip silencieusement
            return
        
        # Préparer les données à insérer
        price_records = []
        
        for trip in trips:
            # trip est un dict avec les clés aller, retour, etc.
            aller = trip.get('aller', {})
            retour = trip.get('retour', {})
            
            # Enregistrer le vol aller
            departure_time_aller = aller.get('departureTime', '')
            departure_date_aller = departure_time_aller.split('T')[0] if 'T' in departure_time_aller else departure_time_aller.split(' ')[0]
            
            price_records.append({
                "departure_airport": aller.get('origin', ''),
                "destination_code": aller.get('destination', ''),
                "flight_date": departure_date_aller,
                "price": aller.get('price', 0),
                "currency": aller.get('currency', 'EUR'),
                "airline": "Ryanair",
                "source": "api_scan",
                "flight_number": aller.get('flightNumber', '')
            })
            
            # Enregistrer le vol retour
            departure_time_retour = retour.get('departureTime', '')
            departure_date_retour = departure_time_retour.split('T')[0] if 'T' in departure_time_retour else departure_time_retour.split(' ')[0]
            
            price_records.append({
                "departure_airport": retour.get('origin', ''),
                "destination_code": retour.get('destination', ''),
                "flight_date": departure_date_retour,
                "price": retour.get('price', 0),
                "currency": retour.get('currency', 'EUR'),
                "airline": "Ryanair",
                "source": "api_scan",
                "flight_number": retour.get('flightNumber', '')
            })
        
        # Insertion batch dans price_history
        if price_records:
            result = supabase.table("price_history").insert(price_records).execute()
            
            if result.data:
                logger.info(f"✅ {len(price_records)} prix enregistré(s) dans price_history")
            else:
                logger.warning("⚠️ Aucun prix enregistré dans price_history")
                
    except Exception as e:
        # Ne pas bloquer le scan si l'enregistrement échoue
        logger.error(f"❌ Erreur enregistrement price_history: {e}")
        # On continue silencieusement
