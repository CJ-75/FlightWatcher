import os

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def read_root():
    return {"message": "Ryanair Flight Scanner API", "status": "ok"}


@router.get("/api/health")
def health_check():
    return {"status": "ok", "service": "ryanair-scanner"}


@router.get("/api/config")
def get_config():
    """Retourne la configuration publique nécessaire au frontend"""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")

    return {
        "supabase_url": supabase_url if supabase_url else None,
        "supabase_anon_key": supabase_anon_key if supabase_anon_key else None,
        "available": bool(supabase_url and supabase_anon_key),
    }
