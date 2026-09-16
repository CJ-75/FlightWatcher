"""
Centralized Supabase dependencies and optional admin routes.
Expects .env to be loaded by main.py before import.
"""
import os
import traceback

SUPABASE_AVAILABLE = False
ADMIN_ROUTES_AVAILABLE = False
get_supabase_client = None
get_supabase_service_client = None
get_user_id_from_token = lambda r: None
optional_auth = lambda f: f
record_price_history = lambda trips: None
admin_router = None

try:
    print("🔄 Tentative d'import des modules Supabase...")
    from supabase_client import get_supabase_client, get_supabase_service_client
    from auth_middleware import get_user_id_from_token, optional_auth
    from price_tracker import record_price_history
    print("✅ Modules Supabase importés avec succès")

    try:
        from admin_routes import router as admin_router
        ADMIN_ROUTES_AVAILABLE = True
        print("✅ Routes admin disponibles")
    except Exception as e:
        print(f"⚠️  Routes admin non disponibles: {e}")
        ADMIN_ROUTES_AVAILABLE = False
        admin_router = None

    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_ANON_KEY"):
        print("⚠️  Variables d'environnement Supabase manquantes")
        print("   Créez un fichier backend/.env avec SUPABASE_URL et SUPABASE_ANON_KEY")
        print("   Exécutez 'python backend/check_env.py' pour créer un fichier exemple")
        raise ValueError("Variables d'environnement Supabase manquantes")

    print("🔌 Test de connexion Supabase...")
    test_client = get_supabase_client()
    print("✅ Connexion Supabase réussie")

    SUPABASE_AVAILABLE = True
    print("✅ Supabase configuré et disponible")
except Exception as e:
    print(f"⚠️  Supabase non disponible: {e}")
    print("📋 Détails de l'erreur:")
    traceback.print_exc()
    print("   Les fonctionnalités Supabase seront désactivées.")
    print("   Pour activer Supabase, configurez SUPABASE_URL et SUPABASE_ANON_KEY dans backend/.env")
    SUPABASE_AVAILABLE = False
    get_supabase_client = None
    get_supabase_service_client = None
    get_user_id_from_token = lambda r: None
    optional_auth = lambda f: f
    record_price_history = lambda trips: None
    ADMIN_ROUTES_AVAILABLE = False
    admin_router = None
