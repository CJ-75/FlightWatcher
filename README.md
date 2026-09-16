# FlightWatcher

Scanner de vols Ryanair (aller-retour) — **web** + **mobile Expo** (iOS/Android), admin web-only.

## Architecture

```
FlightWatcher/
  backend/              # FastAPI (API unique)
  frontend/             # React + Vite (user + admin)
  mobile/               # Expo React Native (user)
  packages/shared/      # types, API client, auth factory, i18n, KVStore
  backend-node/         # DEPRECATED — ne pas utiliser
```

Clients → `@flightwatcher/shared` → FastAPI → Ryanair / Supabase.

## Prérequis

- Python 3.10+
- Node 20+
- Compte Supabase (optionnel pour auth / sync)

## Installation monorepo

```bash
# Racine
npm install

# Backend
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install -r ../ryanair-py/requirements.txt
cp .env.example .env   # renseigner SUPABASE_* et ALLOWED_ORIGINS
```

## Lancement

### Backend (obligatoire)

```bash
cd backend
python run.py
# http://localhost:8000
```

### Web

```bash
npm run dev:web
# http://localhost:5173
# Proxy Vite /api → :8000 — ou VITE_API_URL=http://localhost:8000
```

### Mobile (Expo)

```bash
cp mobile/.env.example mobile/.env
# Sur device physique: EXPO_PUBLIC_API_URL=http://<IP-LAN>:8000
npm run dev:mobile
# puis i / a pour iOS / Android
```

Deep link OAuth : `flightwatcher://auth/callback` (voir [backend/MOBILE_AUTH.md](backend/MOBILE_AUTH.md)).

## Auth mobile

- Bearer JWT Supabase sur les endpoints user (`Authorization: Bearer …`)
- Config publique : `GET /api/config`
- CORS : variable `ALLOWED_ORIGINS` (web + Expo)

## Endpoints principaux

| Méthode | Path | Rôle |
|---------|------|------|
| POST | `/api/scan` | Scan paramétré |
| POST | `/api/inspire` | Mode découverte |
| GET | `/api/airports` | Aéroports |
| GET | `/api/destinations` | Destinations |
| GET/POST/DELETE | `/api/supabase/searches` | Recherches |
| GET/POST/DELETE | `/api/supabase/favorites` | Favoris |
| GET | `/api/config` | Clés publiques Supabase |
| * | `/api/admin/*` | Admin (web) |

## Typecheck

```bash
npm run typecheck
# + mobile si installé :
npm run typecheck:all
```

## Admin

Panneau `/admin` (web uniquement). Config : `ADMIN_EMAILS`, `ADMIN_PASSWORD_HASH` — voir [ADMIN_PANEL.md](ADMIN_PANEL.md).

## Notes

- Ne pas utiliser `npx supabase db push` — migrations SQL manuelles.
- `backend-node` est deprecated ([backend-node/DEPRECATED.md](backend-node/DEPRECATED.md)).
