"""
Client Supabase pour FlightWatcher — instances réutilisées (évite create_client à chaque call).
"""
from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from supabase import Client, create_client

env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

if not env_path.exists():
    print(f"⚠️  Fichier .env introuvable dans {env_path.parent}")
    print("   Créez un fichier .env avec SUPABASE_URL et SUPABASE_ANON_KEY")
    print("   Exécutez 'python backend/check_env.py' pour créer un fichier exemple")

_lock = threading.Lock()
_anon_client: Optional[Client] = None
_service_client: Optional[Client] = None
_service_missing_logged = False


def get_supabase_client() -> Client:
    """Client anon réutilisé (thread-safe lazy init)."""
    global _anon_client
    if _anon_client is not None:
        return _anon_client
    with _lock:
        if _anon_client is not None:
            return _anon_client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_ANON_KEY")
        if not supabase_url or not supabase_key:
            raise ValueError(
                "Variables d'environnement SUPABASE_URL et SUPABASE_ANON_KEY requises. "
                "Créez un fichier .env dans le dossier backend avec ces valeurs."
            )
        _anon_client = create_client(supabase_url, supabase_key)
        return _anon_client


def get_supabase_service_client() -> Optional[Client]:
    """
    Client service_role réutilisé.
    IMPORTANT : cette clé ne doit JAMAIS être exposée au frontend.
    """
    global _service_client, _service_missing_logged
    if _service_client is not None:
        return _service_client
    with _lock:
        if _service_client is not None:
            return _service_client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url:
            raise ValueError("SUPABASE_URL est requis")
        if not supabase_service_key:
            if not _service_missing_logged:
                print(
                    "⚠️ SUPABASE_SERVICE_ROLE_KEY non configurée. "
                    "Les fonctionnalités price_history et cache seront désactivées."
                )
                _service_missing_logged = True
            return None
        _service_client = create_client(supabase_url, supabase_service_key)
        return _service_client
