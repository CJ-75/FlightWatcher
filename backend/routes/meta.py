import os

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

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


# Landing page for native OAuth (Expo Go). ASWebAuthenticationSession / Chrome
# Custom Tabs intercept this HTTP redirect and return the full URL (with tokens)
# to the app — custom schemes like exp:// / flightwatcher:// often return "cancel".
_MOBILE_AUTH_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FlightWatcher</title>
  <style>
    body { font-family: system-ui, sans-serif; display: grid; place-items: center;
           min-height: 100vh; margin: 0; background: #FFF9F5; color: #1a1a1a; }
    p { opacity: .7; }
  </style>
</head>
<body>
  <main>
    <h1>Connexion réussie</h1>
    <p>Tu peux revenir à l’app FlightWatcher.</p>
  </main>
</body>
</html>
"""


@router.get("/auth/mobile-callback", response_class=HTMLResponse)
def mobile_auth_callback():
    return HTMLResponse(content=_MOBILE_AUTH_HTML, status_code=200)
