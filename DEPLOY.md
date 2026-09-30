# Déploiement FlightWatcher — Vercel (Services)

Web + API sur **un seul projet Vercel** (Services beta).

```
Navigateur  →  Vercel
                 ├─ /api/* , /auth/mobile-callback  →  service backend (FastAPI)
                 └─ /*                              →  service frontend (Vite)
                        ↓
                   Supabase + Ryanair
```

L’app mobile (EAS) reste hors de ce guide — pointer `EXPO_PUBLIC_API_URL` vers ton domaine Vercel. Voir `backend/MOBILE_AUTH.md`.

> **Limite** : les scans longs tournent en Vercel Function (`maxDuration` 300 s, plan Pro). Sur Hobby (~60 s) un gros `/api/scan` peut timeout. Alternative : API sur Render → [section Render](#alternative-render--api--vercel-front-only).

---

## 1. Projet Vercel (Services)

1. [vercel.com](https://vercel.com) → **Add New Project** → repo GitHub  
2. Root Directory = `.` (racine du repo)  
3. Le `vercel.json` racine définit déjà `services` + rewrites — pas besoin de Root = `frontend` seul.

### Services

| Nom | Rôle | Public |
|-----|------|--------|
| `backend` | FastAPI (`main:app`) | `/api/*`, `/auth/mobile-callback` |
| `frontend` | Vite SPA | `/*` |

Pas de **bindings** : le navigateur appelle `/api` en same-origin.

### Variables d’environnement (projet Vercel → Settings → Environment Variables)

Appliquées au **backend** (et éventuellement all) :

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ALLOWED_ORIGINS=https://TON-PROJET.vercel.app,http://localhost:5173
ADMIN_EMAILS=ton@email.com
ADMIN_PASSWORD_HASH=...
```

**Ne pas** définir `VITE_API_URL` en prod : leave empty → same origin (`/api`).

Après le 1er deploy, mets à jour `ALLOWED_ORIGINS` avec l’URL Vercel exacte (https, pas de slash).

### Vérifier

- `https://TON-PROJET.vercel.app/api/health` → `{"status":"ok",...}`  
- Site : `https://TON-PROJET.vercel.app`  
- Docs FastAPI : `https://TON-PROJET.vercel.app/docs` (si exposé)

Local all-in-one : `vercel dev` (ou `vercel dev -L`).

---

## 2. Supabase (après l’URL Vercel)

**Authentication → URL Configuration**

- **Site URL** : `https://TON-PROJET.vercel.app`
- **Redirect URLs** :
  ```
  https://TON-PROJET.vercel.app/**
  https://TON-PROJET.vercel.app/auth/callback
  flightwatcher://auth/callback
  http://localhost:5173/**
  ```

---

## 3. Checklist

- [ ] `GET /api/health` OK  
- [ ] Site charge (SPA routes type `/auth/callback` OK)  
- [ ] Login Google web  
- [ ] Une recherche / scan (attention timeout Hobby)  
- [ ] Admin `/admin` OK  

---

## 4. Dépannage

| Problème | Cause / fix |
|----------|-------------|
| CORS | `ALLOWED_ORIGINS` sans l’URL Vercel exacte |
| `Failed to fetch` API | rewrite `/api` ou mauvais `VITE_API_URL` absolu → retire `VITE_API_URL` et rebuild |
| Scan timeout | plan / `maxDuration` ; ou API sur Render |
| 404 refresh SPA | rewrite SPA dans le service `frontend` |
| Build `@flightwatcher/shared` | `installCommand` monorepo (`cd .. && npm install`) dans `vercel.json` |

---

## Alternative : Render (API) + Vercel (front only)

Si tu préfères une API longue durée hors Functions :

### Render

| Champ | Valeur |
|--------|--------|
| Root | *(vide)* |
| Build | `pip install -r backend/requirements.txt` |
| Start | `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT` |

Env : mêmes `SUPABASE_*`, `ALLOWED_ORIGINS`, `ADMIN_*`.

### Vercel front-only

Dans ce cas **retire / simplifie** `services` et pointe le build vers le front, avec :

```
VITE_API_URL=https://flightwatcher-api.onrender.com
```

Et un rewrite SPA classique. Le mode Services actuel assume API + web sur le même domaine Vercel.
