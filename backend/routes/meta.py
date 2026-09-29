import os

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

router = APIRouter()

# Serves tokens → native deep link after Google OAuth (avoids Vite/localhost Site URL).
_MOBILE_CALLBACK_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FlightWatcher — connexion</title>
  <style>
    body { font-family: system-ui, sans-serif; display:flex; min-height:100vh; align-items:center;
           justify-content:center; margin:0; background:#FFF5F0; color:#1a1a1a; text-align:center; }
    a { display:inline-block; margin-top:1rem; padding:0.85rem 1.4rem; border-radius:12px;
        background:#FF6B35; color:#fff; font-weight:600; text-decoration:none; }
    .err { color:#b91c1c; margin-top:1rem; }
  </style>
</head>
<body>
  <div>
    <h1 id="status">Connexion en cours…</h1>
    <p id="hint"></p>
    <a id="open" style="display:none" href="#">Ouvrir FlightWatcher</a>
    <p id="err" class="err"></p>
  </div>
  <script type="module">
    const params = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const appRedirect = params.get('app_redirect');
    const statusEl = document.getElementById('status');
    const hintEl = document.getElementById('hint');
    const openEl = document.getElementById('open');
    const errEl = document.getElementById('err');

    function buildDeepLink(base, access, refresh) {
      const b = String(base).split('#')[0].split('?')[0];
      const h = new URLSearchParams({
        access_token: access,
        refresh_token: refresh,
        token_type: 'bearer',
      }).toString();
      return b + '#' + h;
    }

    function go(url) {
      statusEl.textContent = 'Retour à l’application…';
      openEl.href = url;
      openEl.style.display = 'inline-block';
      location.href = url;
    }

    async function main() {
      if (!appRedirect) {
        errEl.textContent = 'app_redirect manquant';
        statusEl.textContent = 'Erreur';
        return;
      }
      if (params.get('error') || hash.get('error')) {
        errEl.textContent = params.get('error_description') || hash.get('error_description')
          || params.get('error') || hash.get('error');
        statusEl.textContent = 'Connexion refusée';
        return;
      }

      const access = hash.get('access_token');
      const refresh = hash.get('refresh_token');
      if (access && refresh) {
        go(buildDeepLink(appRedirect, access, refresh));
        return;
      }

      const code = params.get('code');
      if (!code) {
        errEl.textContent = 'Aucun token ni code OAuth dans l’URL';
        statusEl.textContent = 'Erreur';
        return;
      }

      const cfgRes = await fetch('/api/config');
      const cfg = await cfgRes.json();
      if (!cfg.available || !cfg.supabase_url || !cfg.supabase_anon_key) {
        errEl.textContent = 'Supabase non configuré sur l’API';
        statusEl.textContent = 'Erreur';
        return;
      }

      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
      const supabase = createClient(cfg.supabase_url, cfg.supabase_anon_key, {
        auth: { detectSessionInUrl: false, persistSession: false, flowType: 'pkce' },
      });
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.session) {
        errEl.textContent = error?.message || 'Échange du code impossible';
        statusEl.textContent = 'Erreur';
        hintEl.textContent = 'Réessaie depuis l’app (flow implicit recommandé).';
        return;
      }
      go(buildDeepLink(appRedirect, data.session.access_token, data.session.refresh_token));
    }

    main().catch((e) => {
      statusEl.textContent = 'Erreur';
      errEl.textContent = String(e?.message || e);
    });
  </script>
</body>
</html>
"""


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


@router.get("/auth/mobile-callback", response_class=HTMLResponse)
def mobile_auth_callback(_request: Request):
    """
    OAuth return URL for Expo (LAN-reachable). Supabase Site URL is often
    localhost — phone cannot use that. Allow-list this path in Supabase Redirect URLs:
      http://<LAN-IP>:8000/auth/mobile-callback
      http://<LAN-IP>:8000/**
    """
    return HTMLResponse(content=_MOBILE_CALLBACK_HTML)
