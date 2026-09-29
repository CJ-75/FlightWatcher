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


# After Google OAuth, Supabase redirects here with #access_token=… (implicit).
# This page forwards tokens into the native app via flightwatcher:// deep link.
# Same idea as the web /auth/callback, without needing Vite on the phone.
_MOBILE_AUTH_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FlightWatcher — Connexion</title>
  <style>
    :root { color-scheme: light; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: grid; place-items: center; min-height: 100vh; margin: 0;
      background: linear-gradient(160deg, #FFF9F5, #FFD4BC 55%, #FF6B35);
      color: #1a1a1a; padding: 24px; box-sizing: border-box;
    }
    main {
      background: #fff; border-radius: 20px; padding: 28px 24px;
      max-width: 360px; width: 100%; text-align: center;
      box-shadow: 0 12px 40px rgba(0,0,0,.12);
    }
    h1 { font-size: 1.35rem; margin: 0 0 8px; }
    p { margin: 0 0 20px; opacity: .65; line-height: 1.4; font-size: .95rem; }
    a.btn {
      display: inline-block; background: #FF6B35; color: #fff; text-decoration: none;
      font-weight: 700; padding: 14px 22px; border-radius: 14px;
    }
    .err { color: #b91c1c; font-size: .9rem; margin-top: 12px; }
  </style>
</head>
<body>
  <main>
    <h1 id="title">Connexion…</h1>
    <p id="msg">Retour vers l’application FlightWatcher.</p>
    <a class="btn" id="open" href="#" style="display:none">Ouvrir FlightWatcher</a>
    <p class="err" id="err" style="display:none"></p>
  </main>
  <script>
    (function () {
      var DEFAULT_APP = 'flightwatcher://auth/callback';
      var params = new URLSearchParams(window.location.search);
      var appRedirect = params.get('app_redirect') || DEFAULT_APP;
      appRedirect = appRedirect.split('#')[0].split('?')[0];

      var hash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
      var hashParams = new URLSearchParams(hash);
      var access = hashParams.get('access_token');
      var refresh = hashParams.get('refresh_token');
      var err = hashParams.get('error_description') || hashParams.get('error')
        || params.get('error_description') || params.get('error');

      var title = document.getElementById('title');
      var msg = document.getElementById('msg');
      var openBtn = document.getElementById('open');
      var errEl = document.getElementById('err');

      if (err) {
        title.textContent = 'Connexion impossible';
        msg.textContent = 'Réessaie depuis l’app.';
        errEl.style.display = 'block';
        errEl.textContent = err;
        return;
      }

      if (!access) {
        title.textContent = 'En attente des tokens…';
        msg.textContent = 'Si cette page reste affiché, ferme-la et réessaie depuis l’app.';
        return;
      }

      var deep =
        appRedirect +
        '#access_token=' + encodeURIComponent(access) +
        '&refresh_token=' + encodeURIComponent(refresh || '') +
        '&token_type=bearer';

      openBtn.href = deep;
      openBtn.style.display = 'inline-block';
      title.textContent = 'Connexion réussie';
      msg.textContent = 'Tu peux ouvrir l’app. Si rien ne se passe, appuie sur le bouton.';

      // Auto-return to the native app (same role as web callback → home)
      window.location.href = deep;
    })();
  </script>
</body>
</html>
"""


@router.get("/auth/mobile-callback", response_class=HTMLResponse)
def mobile_auth_callback():
    return HTMLResponse(content=_MOBILE_AUTH_HTML, status_code=200)
