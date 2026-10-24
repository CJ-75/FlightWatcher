"""
API Backend pour le scanner de vols Ryanair
"""
import os
from contextlib import asynccontextmanager
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
from deals.liteapi_config import LiteApiConfigError, assert_deals_config_ok, load_deals_config

# Deals / LiteAPI guards (no-op when DEALS_PROVIDER=mock)
try:
    _deals_cfg = assert_deals_config_ok(load_deals_config())
    print(f"✅ Deals provider: {_deals_cfg.provider}" + (
        f" (LiteAPI {_deals_cfg.liteapi_env})" if _deals_cfg.is_liteapi else ""
    ))
    print(
        f"   deals_source={_deals_cfg.deals_source} "
        f"scheduler={_deals_cfg.scheduler_enabled} "
        f"legacy_fallback={_deals_cfg.legacy_fallback_enabled}"
    )
except LiteApiConfigError as e:
    print(f"❌ Configuration Deals/LiteAPI invalide: {e}")
    raise


def _warn_community_bootstrap() -> None:
    """Lot A: clear boot warning if community tables empty / missing."""
    if not _deals_cfg.is_community:
        return
    try:
        from deals.bootstrap_community import (
            check_community_tables,
            community_tables_empty,
        )
        from supabase_deps import get_supabase_client, get_supabase_service_client

        sb = get_supabase_service_client() or get_supabase_client()
        if not sb:
            return
        check = check_community_tables(sb)
        if not check.get("ok"):
            print(
                "⚠️  Deals community: tables manquantes "
                f"{check.get('missing')}. Applique: "
                + ", ".join(check.get("migrations") or [])
            )
            print("   Puis: cd backend && python -m deals.bootstrap_community")
            return
        if community_tables_empty(sb):
            print(
                "⚠️  Deals community: catalogue vide. "
                "Lance: cd backend && python -m deals.bootstrap_community"
            )
    except Exception as e:
        print(f"⚠️  Deals community boot check: {e}")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    _warn_community_bootstrap()
    try:
        from scan_log import log_path, slog

        slog(f"Scan provider log file: {log_path()}")
    except Exception:
        pass
    try:
        from deals.scheduler import start_deals_scheduler

        if start_deals_scheduler():
            print("✅ Deals scheduler in-process démarré (DEALS_SCHEDULER_ENABLED)")
    except Exception as e:
        print(f"⚠️  Deals scheduler: {e}")
    yield
    try:
        from deals.scheduler import stop_deals_scheduler

        stop_deals_scheduler()
    except Exception:
        pass


app = FastAPI(title="Ryanair Flight Scanner API", lifespan=_lifespan)

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
