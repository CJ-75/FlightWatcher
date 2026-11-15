# Étape A — API Render Frankfurt

## Région Supabase

Projet actuel : `iowibrvboqcgknfznfvt.supabase.co`.  
**À confirmer dans le dashboard** (Settings → General → Region). Souvent `eu-west-1` (Ireland) ou `eu-central-1` (Frankfurt). Render **Frankfurt** reste le bon choix EU ; latence OK vers Ireland.

## Service Render

| Champ | Valeur |
|--------|--------|
| Type | **Web Service** — plan **Starter+** (pas Free / no sleep) |
| Region | **Frankfurt** |
| Root | *(vide)* ou monorepo root |
| Build | `pip install -r backend/requirements.txt` |
| Start | `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health | `GET /api/health` (liveness, &lt; 300 ms, pas de DB) |
| Ready | `GET /api/health/db` (Supabase) |

Env : `SUPABASE_*`, `ALLOWED_ORIGINS=https://waypop.co,https://www.waypop.co,http://localhost:5173,http://localhost:3001`, `POP_PAGE_V2`, `LANDING_V2`, deals/Viator…

## DNS

| Type | Host | Value |
|------|------|--------|
| CNAME | `api` | `xxx.onrender.com` (cible Render) |

## Vercel SPA

- `VITE_API_URL` vide en prod (same-origin) **ou** `https://api.waypop.co` si front et API séparés.
- Rewrites : `/api/*` → `https://api.waypop.co/api/*` (voir `VERCEL_POP_ROUTING.md`).

## Critère d’acceptation

20× `GET https://api.waypop.co/api/health` &lt; 300 ms, 0× 5xx.  
20× `GET /api/parcours?limit=10` &lt; 800 ms, 0× 5xx.
