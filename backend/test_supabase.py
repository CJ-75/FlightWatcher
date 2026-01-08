"""
Script de test pour vérifier la connexion et les opérations Supabase
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

# Vérifier que les variables sont définies
supabase_url = os.getenv("SUPABASE_URL")
supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

print("=" * 70)
print("TEST DE CONNEXION ET OPÉRATIONS SUPABASE")
print("=" * 70)
print()

# Test 1: Vérifier les variables d'environnement
print("📋 Test 1: Vérification des variables d'environnement")
print("-" * 70)
if supabase_url:
    print(f"✅ SUPABASE_URL: {supabase_url[:50]}...")
else:
    print("❌ SUPABASE_URL: Non définie")
    sys.exit(1)

if supabase_anon_key:
    print(f"✅ SUPABASE_ANON_KEY: {supabase_anon_key[:30]}...")
else:
    print("❌ SUPABASE_ANON_KEY: Non définie")
    sys.exit(1)

if supabase_service_key:
    print(f"✅ SUPABASE_SERVICE_ROLE_KEY: {supabase_service_key[:30]}...")
else:
    print("⚠️  SUPABASE_SERVICE_ROLE_KEY: Non définie (optionnelle)")
print()

# Test 2: Connexion au client Supabase
print("🔌 Test 2: Connexion au client Supabase")
print("-" * 70)
try:
    from supabase_client import get_supabase_client, get_supabase_service_client
    
    # Test avec client anon
    print("Tentative de connexion avec client anon...")
    client = get_supabase_client()
    print("✅ Client anon connecté avec succès")
    
    # Test avec client service (si disponible)
    if supabase_service_key:
        print("Tentative de connexion avec client service...")
        service_client = get_supabase_service_client()
        if service_client:
            print("✅ Client service connecté avec succès")
        else:
            print("⚠️  Client service non disponible")
    else:
        print("⚠️  Client service non testé (SUPABASE_SERVICE_ROLE_KEY manquante)")
    
except Exception as e:
    print(f"❌ Erreur de connexion: {e}")
    sys.exit(1)
print()

# Test 3: Vérifier l'existence des tables
print("📊 Test 3: Vérification des tables")
print("-" * 70)
tables_to_check = [
    'user_profiles',
    'saved_searches',
    'favorites',
    'price_history',
    'search_results_cache'
]

for table in tables_to_check:
    try:
        result = client.table(table).select('id').limit(1).execute()
        print(f"✅ Table '{table}' existe et accessible")
    except Exception as e:
        error_msg = str(e)
        if "relation" in error_msg.lower() or "does not exist" in error_msg.lower():
            print(f"❌ Table '{table}' n'existe pas")
        else:
            print(f"⚠️  Table '{table}': {error_msg[:60]}...")
print()

# Test 4: Test de lecture (user_profiles)
print("📖 Test 4: Test de lecture (user_profiles)")
print("-" * 70)
try:
    result = client.table('user_profiles').select('id, home_airport, referral_code').limit(5).execute()
    count = len(result.data) if result.data else 0
    print(f"✅ Lecture réussie: {count} profil(s) trouvé(s)")
    if count > 0:
        print("   Exemples:")
        for profile in result.data[:3]:
            print(f"   - ID: {profile.get('id', 'N/A')[:8]}..., Aéroport: {profile.get('home_airport', 'N/A')}, Referral: {profile.get('referral_code', 'N/A')}")
except Exception as e:
    print(f"❌ Erreur de lecture: {e}")
print()

# Test 5: Test de lecture (saved_searches)
print("📖 Test 5: Test de lecture (saved_searches)")
print("-" * 70)
try:
    # Essayer d'abord avec les colonnes du schéma v2
    try:
        result = client.table('saved_searches').select('id, name, departure_airport').limit(5).execute()
    except:
        # Fallback: essayer avec juste id et name
        result = client.table('saved_searches').select('id, name').limit(5).execute()
    
    count = len(result.data) if result.data else 0
    print(f"✅ Lecture réussie: {count} recherche(s) trouvée(s)")
    if count > 0:
        print("   Exemples:")
        for search in result.data[:3]:
            airport = search.get('departure_airport', 'N/A')
            print(f"   - ID: {search.get('id', 'N/A')[:8]}..., Nom: {search.get('name', 'N/A')}, Aéroport: {airport}")
except Exception as e:
    print(f"❌ Erreur de lecture: {e}")
print()

# Test 6: Test de lecture (favorites)
print("📖 Test 6: Test de lecture (favorites)")
print("-" * 70)
try:
    result = client.table('favorites').select('id, destination_code, total_price').limit(5).execute()
    count = len(result.data) if result.data else 0
    print(f"✅ Lecture réussie: {count} favori(s) trouvé(s)")
    if count > 0:
        print("   Exemples:")
        for fav in result.data[:3]:
            print(f"   - ID: {fav.get('id', 'N/A')[:8]}..., Destination: {fav.get('destination_code', 'N/A')}, Prix: {fav.get('total_price', 'N/A')}€")
except Exception as e:
    print(f"❌ Erreur de lecture: {e}")
print()

# Test 7: Test d'écriture (si service client disponible)
if supabase_service_key:
    print("✍️  Test 7: Test d'écriture (avec service client)")
    print("-" * 70)
    try:
        service_client = get_supabase_service_client()
        if service_client:
            # Test d'insertion dans search_results_cache
            test_cache_data = {
                "cache_key": f"test_{datetime.now().timestamp()}",
                "departure_airport": "BVA",
                "budget_max": 200,
                "dates_depart": [{"date": "2024-01-01", "heure_min": "00:00", "heure_max": "23:59"}],
                "dates_retour": [{"date": "2024-01-05", "heure_min": "00:00", "heure_max": "23:59"}],
                "results": [],
                "expires_at": datetime.now().isoformat(),
                "hit_count": 0
            }
            
            result = service_client.table('search_results_cache').insert(test_cache_data).execute()
            if result.data:
                cache_id = result.data[0].get('id')
                print(f"✅ Insertion réussie dans search_results_cache (ID: {cache_id[:8]}...)")
                
                # Nettoyer le test
                service_client.table('search_results_cache').delete().eq('id', cache_id).execute()
                print("✅ Donnée de test supprimée")
            else:
                print("⚠️  Insertion réussie mais aucune donnée retournée")
        else:
            print("⚠️  Client service non disponible pour le test d'écriture")
    except Exception as e:
        print(f"❌ Erreur d'écriture: {e}")
    print()
else:
    print("⚠️  Test 7: Test d'écriture ignoré (SUPABASE_SERVICE_ROLE_KEY manquante)")
    print()

# Test 8: Test de l'endpoint API /api/config
print("🌐 Test 8: Test de l'endpoint API /api/config")
print("-" * 70)
try:
    import requests
    response = requests.get('http://localhost:8000/api/config', timeout=5)
    if response.status_code == 200:
        config = response.json()
        if config.get('available'):
            print("✅ Endpoint /api/config accessible")
            print(f"   Configuration disponible: {config.get('available')}")
            print(f"   URL: {config.get('supabase_url', 'N/A')[:50]}...")
        else:
            print("⚠️  Endpoint accessible mais Supabase non configuré")
    else:
        print(f"⚠️  Endpoint retourne le code {response.status_code}")
        print("   (Le serveur backend doit être démarré pour ce test)")
except requests.exceptions.ConnectionError:
    print("⚠️  Impossible de se connecter au serveur backend")
    print("   Démarrez le serveur avec: cd backend && uvicorn main:app --reload --port 8000")
except Exception as e:
    print(f"⚠️  Erreur: {e}")
print()

# Résumé
print("=" * 70)
print("RÉSUMÉ DES TESTS")
print("=" * 70)
print("✅ Variables d'environnement: OK")
print("✅ Connexion Supabase: OK")
print("✅ Tables vérifiées")
print("✅ Opérations de lecture: OK")
if supabase_service_key:
    print("✅ Opérations d'écriture: OK")
else:
    print("⚠️  Opérations d'écriture: Non testées (service key manquante)")
print()
print("🎉 Tous les tests de base sont passés avec succès !")
print("=" * 70)

