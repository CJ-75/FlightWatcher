"""
API Backend pour le scanner de vols Ryanair
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Charger le fichier .env AVANT les imports Supabase
env_path = Path(__file__).parent / '.env'
print(f"📁 Chargement du fichier .env depuis: {env_path}")
if env_path.exists():
    print(f"✅ Fichier .env trouvé")
    load_dotenv(env_path, override=True)
else:
    print(f"⚠️  Fichier .env introuvable: {env_path}")

supabase_url_check = os.getenv("SUPABASE_URL")
supabase_key_check = os.getenv("SUPABASE_ANON_KEY")
print(f"🔍 Vérification variables après chargement:")
print(f"   SUPABASE_URL: {'✅ Définie' if supabase_url_check else '❌ Manquante'}")
print(f"   SUPABASE_ANON_KEY: {'✅ Définie' if supabase_key_check else '❌ Manquante'}")

from supabase_deps import ADMIN_ROUTES_AVAILABLE, admin_router
from routes import include_all_routers

app = FastAPI(title="Ryanair Flight Scanner API")

# CORS — ALLOWED_ORIGINS (comma-separated), defaults include Vite + Expo web
_default_origins = "http://localhost:5173,http://localhost:3000,http://localhost:8081,http://127.0.0.1:5173"
_allowed = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if ADMIN_ROUTES_AVAILABLE and admin_router:
    app.include_router(admin_router)
    print("✅ Routes admin incluses dans l'application")

include_all_routers(app)
