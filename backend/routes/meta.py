import html
import json
import os
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

router = APIRouter()


def _pass_code_to_app(app_redirect: str, code: str) -> str:
    """Hand OAuth code to Expo; mobile client holds the PKCE verifier."""
    base = app_redirect.split("#")[0]
    joiner = "&" if ("?" in base) else "?"
    return f"{base}{joiner}code={quote(code, safe='')}"


def _handoff_page(deep_link: str, mode: str) -> HTMLResponse:
    """
    Do NOT use HTTP 302 to exp:// — Cloudflare / SFSafariView often block
    non-https Location headers. JS navigation + explicit button works.
    """
    deep_js = json.dumps(deep_link)
    deep_attr = html.escape(deep_link, quote=True)
    body = f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FlightWatcher</title>
  <style>
    body {{ font-family: system-ui, sans-serif; display:flex; min-height:100vh; align-items:center;
           justify-content:center; margin:0; background:#FFF5F0; color:#1a1a1a; text-align:center; padding:1.25rem; }}
    a {{ display:inline-block; margin-top:1rem; padding:0.9rem 1.5rem; border-radius:12px;
         background:#FF6B35; color:#fff; font-weight:600; text-decoration:none; font-size:1.05rem; }}
    .muted {{ color:#666; margin-top:0.75rem; font-size:0.9rem; }}
  </style>
</head>
<body>
  <div>
    <h1>Connexion réussie</h1>
    <p class="muted">Retour vers FlightWatcher… ({html.escape(mode)})</p>
    <a id="open" href="{deep_attr}">Ouvrir FlightWatcher</a>
  </div>
  <script>
    var url = {deep_js};
    function go() {{
      window.location.href = url;
    }}
    go();
    setTimeout(go, 300);
    setTimeout(go, 900);
    setTimeout(go, 1800);
  </script>
</body>
</html>"""
    return HTMLResponse(content=body)


def _error_page(title: str, detail: str) -> HTMLResponse:
    body = f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>FlightWatcher</title>
<style>
body{{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;
margin:0;background:#FFF5F0;color:#1a1a1a;text-align:center;padding:1rem}}
.err{{color:#b91c1c;margin-top:1rem;word-break:break-word}}
</style></head><body><div>
<h1>{html.escape(title)}</h1>
<p class="err">{html.escape(detail)}</p>
</div></body></html>"""
    return HTMLResponse(content=body)


_HASH_FALLBACK_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FlightWatcher — connexion</title>
  <style>
    body { font-family: system-ui, sans-serif; display:flex; min-height:100vh; align-items:center;
           justify-content:center; margin:0; background:#FFF5F0; color:#1a1a1a; text-align:center; padding:1rem; }
    a { display:inline-block; margin-top:1rem; padding:0.9rem 1.5rem; border-radius:12px;
        background:#FF6B35; color:#fff; font-weight:600; text-decoration:none; }
    .err { color:#b91c1c; margin-top:1rem; word-break:break-word; }
  </style>
</head>
<body>
  <div>
    <h1 id="status">Connexion en cours…</h1>
    <p id="hint"></p>
    <a id="open" style="display:none" href="#">Ouvrir FlightWatcher</a>
    <p id="err" class="err"></p>
  </div>
  <script>
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
      statusEl.textContent = 'Connexion réussie';
      hintEl.textContent = 'Appuie sur le bouton si l’app ne s’ouvre pas.';
      openEl.href = url;
      openEl.style.display = 'inline-block';
      location.href = url;
      setTimeout(function () { location.href = url; }, 400);
      setTimeout(function () { location.href = url; }, 1200);
    }

    if (!appRedirect) {
      statusEl.textContent = 'Erreur';
      errEl.textContent = 'app_redirect manquant';
    } else if (params.get('error') || hash.get('error')) {
      statusEl.textContent = 'Connexion refusée';
      errEl.textContent = params.get('error_description') || hash.get('error_description')
        || params.get('error') || hash.get('error');
    } else if (hash.get('access_token') && hash.get('refresh_token')) {
      go(buildDeepLink(appRedirect, hash.get('access_token'), hash.get('refresh_token')));
    } else if (params.get('code')) {
      // Should have been handled server-side — rebuild handoff
      const base = appRedirect.split('#')[0];
      const joiner = base.indexOf('?') >= 0 ? '&' : '?';
      go(base + joiner + 'code=' + encodeURIComponent(params.get('code')));
    } else {
      statusEl.textContent = 'Erreur';
      errEl.textContent = 'Aucun code/token dans l’URL';
      hintEl.textContent = location.href.slice(0, 240);
    }
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
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
    return {
        "supabase_url": supabase_url if supabase_url else None,
        "supabase_anon_key": supabase_anon_key if supabase_anon_key else None,
        "available": bool(supabase_url and supabase_anon_key),
    }


@router.get("/auth/mobile-callback")
async def mobile_auth_callback(request: Request):
    q = request.query_params
    code = q.get("code")
    app_redirect = q.get("app_redirect")
    err = q.get("error")
    err_desc = q.get("error_description")

    print(
        f"[auth/mobile-callback] hit code={bool(code)} app_redirect={bool(app_redirect)} "
        f"error={err} url={str(request.url)[:240]}"
    )

    if err:
        return _error_page("Connexion refusée", err_desc or err)

    if code and app_redirect:
        deep = _pass_code_to_app(app_redirect, code)
        print(f"[auth/mobile-callback] HTML handoff → {deep[:160]}")
        return _handoff_page(deep, "code")

    return HTMLResponse(content=_HASH_FALLBACK_HTML)
