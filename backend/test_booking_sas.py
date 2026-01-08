"""
Script de test pour vérifier l'écriture dans booking_sas_events
"""
import os
import sys
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Configurer l'encodage UTF-8 pour Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Charger les variables d'environnement
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

print("=" * 70)
print("TEST D'ÉCRITURE DANS booking_sas_events")
print("=" * 70)
print()

# Vérifier les variables d'environnement
supabase_url = os.getenv("SUPABASE_URL")
supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")

if not supabase_url or not supabase_anon_key:
    print("❌ Variables d'environnement Supabase manquantes")
    print("   Vérifiez que SUPABASE_URL et SUPABASE_ANON_KEY sont définies dans backend/.env")
    sys.exit(1)

print(f"✅ SUPABASE_URL: {supabase_url[:50]}...")
print(f"✅ SUPABASE_ANON_KEY: {supabase_anon_key[:30]}...")
print()

# Connexion au client Supabase
try:
    from supabase_client import get_supabase_client
    client = get_supabase_client()
    print("✅ Client Supabase connecté")
except Exception as e:
    print(f"❌ Erreur de connexion: {e}")
    sys.exit(1)

print()

# Test d'écriture dans booking_sas_events
print("✍️  Test d'écriture dans booking_sas_events")
print("-" * 70)

# Données de test
test_data = {
    "user_id": None,  # Utilisateur anonyme
    "session_id": "test-session-12345",
    "trip_id": "TEST-BVA-2024-01-01-2024-01-05",
    "destination_code": "BCN",
    "destination_name": "Barcelone",
    "departure_airport": "BVA",
    "total_price": 99.99,
    "trip_data": {
        "destination_code": "BCN",
        "prix_total": 99.99,
        "aller": {
            "flightNumber": "FR1234",
            "origin": "BVA",
            "destination": "BCN",
            "departureTime": "2024-01-01T10:00:00Z",
            "price": 49.99
        },
        "retour": {
            "flightNumber": "FR5678",
            "origin": "BCN",
            "destination": "BVA",
            "departureTime": "2024-01-05T14:00:00Z",
            "price": 50.00
        }
    },
    "partner_id": "ryanair",
    "partner_name": "Ryanair",
    "redirect_url": "https://www.ryanair.com/test",
    "action_type": "manual_click",
    "countdown_seconds": 5,
    "source": "web",
    "user_agent": "Mozilla/5.0 (Test Browser)",
    "ip_address": "127.0.0.1"
}

try:
    print("Tentative d'insertion...")
    print(f"  - session_id: {test_data['session_id']}")
    print(f"  - destination: {test_data['destination_code']}")
    print(f"  - partner: {test_data['partner_id']}")
    print(f"  - price: {test_data['total_price']}€")
    
    result = client.table("booking_sas_events").insert(test_data).execute()
    
    if result.data and len(result.data) > 0:
        inserted_id = result.data[0].get('id')
        print(f"\n✅ Insertion réussie !")
        print(f"   ID inséré: {inserted_id}")
        print(f"   Créé à: {result.data[0].get('created_at', 'N/A')}")
        
        # Vérifier la lecture
        print("\n📖 Vérification de la lecture...")
        read_result = client.table("booking_sas_events").select("*").eq("id", inserted_id).execute()
        
        if read_result.data and len(read_result.data) > 0:
            print("✅ Lecture réussie !")
            read_data = read_result.data[0]
            print(f"   session_id: {read_data.get('session_id')}")
            print(f"   destination_code: {read_data.get('destination_code')}")
            print(f"   partner_id: {read_data.get('partner_id')}")
            print(f"   total_price: {read_data.get('total_price')}€")
            
            # Nettoyer le test (optionnel)
            print("\n🧹 Nettoyage de la donnée de test...")
            delete_result = client.table("booking_sas_events").delete().eq("id", inserted_id).execute()
            print("✅ Donnée de test supprimée")
        else:
            print("⚠️  Lecture échouée (mais insertion réussie)")
    else:
        print("❌ Insertion échouée : aucune donnée retournée")
        print(f"   Réponse: {result}")
        
except Exception as e:
    print(f"\n❌ Erreur lors de l'écriture: {e}")
    import traceback
    print("\nDétails de l'erreur:")
    traceback.print_exc()
    sys.exit(1)

print()
print("=" * 70)
print("✅ TEST TERMINÉ AVEC SUCCÈS")
print("=" * 70)

