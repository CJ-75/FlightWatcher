"""
Client Supabase pour FlightWatcher
"""
import os
from pathlib import Path
from supabase import create_client, Client
from dotenv import load_dotenv
from typing import Optional

# Charger le fichier .env depuis le répertoire du script
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

# Afficher un message si le fichier .env n'existe pas
if not env_path.exists():
    print(f"⚠️  Fichier .env introuvable dans {env_path.parent}")
    print("   Créez un fichier .env avec SUPABASE_URL et SUPABASE_ANON_KEY")
    print("   Exécutez 'python backend/check_env.py' pour créer un fichier exemple")

def get_supabase_client() -> Client:
    """Crée et retourne un client Supabase avec la clé anon (pour opérations utilisateur)"""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        raise ValueError(
            "Variables d'environnement SUPABASE_URL et SUPABASE_ANON_KEY requises. "
            "Créez un fichier .env dans le dossier backend avec ces valeurs."
        )
    
    return create_client(supabase_url, supabase_key)

def get_supabase_service_client() -> Optional[Client]:
    """
    Crée et retourne un client Supabase avec la clé service_role.
    Utilisé uniquement pour les opérations backend qui nécessitent de bypasser RLS :
    - Insertion dans price_history
    - Insertion/mise à jour dans search_results_cache
    
    IMPORTANT : Cette clé ne doit JAMAIS être exposée au frontend.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url:
        raise ValueError("SUPABASE_URL est requis")
    
    if not supabase_service_key:
        print("⚠️ SUPABASE_SERVICE_ROLE_KEY non configurée. Les fonctionnalités price_history et cache seront désactivées.")
        return None
    
    return create_client(supabase_url, supabase_service_key)

