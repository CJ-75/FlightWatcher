# Déploiement WayPop — Vercel (Services)

Web + API sur **un seul projet Vercel** (Services beta) + domaine **`waypop.co`**.

```
Navigateur  →  waypop.co (Vercel)
                 ├─ /api/* , /auth/mobile-callback  →  service backend (FastAPI)
                 └─ /*                              →  service frontend (Vite)
                        ↓
                   Supabase + Ryanair
```

L’app mobile (EAS) : `EXPO_PUBLIC_API_URL=https://waypop.co`. Voir `backend/MOBILE_AUTH.md`.

> **Limite** : les scans longs tournent en Vercel Function (`maxDuration` 300 s, plan Pro). Sur Hobby (~60 s) un gros `/api/scan` peut timeout. Alternative : API sur Render → [section Render](#alternative-render--api--vercel-front-only).

---

## 0. DNS `waypop.co` (ordre)

1. Créer / déployer le projet Vercel (section 1) — même sans custom domain d’abord (`*.vercel.app`).
2. Vercel → Project → **Settings → Domains** → Add `waypop.co` et `www.waypop.co`.
3. Chez le **registrar** (là où tu as payé le domaine), crée les records que Vercel affiche. Typiquement :

| Type | Name / Host | Value | TTL |
|------|-------------|-------|-----|
| **A** | `@` | `76.76.21.21` | Auto / 300 |
| **CNAME** | `www` | `cname.vercel-dns.com` | Auto / 300 |

> Vercel peut afficher une valeur CNAME / vérification différente — **copie exactement** l’UI Domains, pas ce tableau si ça diverge.

4. Attendre propagation (souvent 5–30 min, parfois jusqu’à 48 h).
5. Vercel marque le domaine **Valid** + HTTPS (cert Let's Encrypt auto).
6. Mets à jour env + Supabase (sections 1–2) avec `https://waypop.co`.

### Resend (après DNS)

Chez le registrar, ajoute aussi les records SPF/DKIM que Resend donne pour `waypop.co` (souvent TXT + CNAME). Ne casse pas le A/CNAME Vercel.

### Smoke DNS

- `https://waypop.co/api/health` → ok  
- `https://www.waypop.co` → redirige ou sert le site  
- Certificat HTTPS vert  

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
ALLOWED_ORIGINS=https://waypop.co,https://www.waypop.co,http://localhost:5173
ADMIN_EMAILS=ton@email.com
ADMIN_PASSWORD_HASH=...
MEDIA_PROVIDER=supabase
MEDIA_BUCKET=media
```

**Ne pas** définir `VITE_API_URL` en prod : leave empty → same origin (`/api`).

Après custom domain : `ALLOWED_ORIGINS` = `https://waypop.co` (https, pas de slash).

### Vérifier

- `https://waypop.co/api/health` → `{"status":"ok",...}`  
- Site : `https://waypop.co`  
- (avant DNS) `https://TON-PROJET.vercel.app/api/health`

Local all-in-one : `vercel dev` (ou `vercel dev -L`).

---

## 2. Supabase (après `https://waypop.co`)

**Authentication → URL Configuration**

- **Site URL** : `https://waypop.co`
- **Redirect URLs** :
  ```
  https://waypop.co/**
  https://waypop.co/auth/callback
  https://www.waypop.co/**
  https://www.waypop.co/auth/callback
  flightwatcher://auth/callback
  flightwatcher://**
  waypop://auth/callback
  waypop://**
  http://localhost:5173/**
  ```

---

## 3. Checklist

- [ ] Domaine `waypop.co` Valid + HTTPS sur Vercel  
- [ ] `GET /api/health` OK  
- [ ] Site charge (SPA routes type `/auth/callback` OK)  
- [ ] Login Google web  
- [ ] Une recherche / scan (attention timeout Hobby)  
- [ ] Admin `/admin` OK  
- [ ] Upload media OK (`/api/media/upload`)  

---

## 4. Dépannage

| Problème | Cause / fix |
|----------|-------------|
| CORS | `ALLOWED_ORIGINS` sans l’URL Vercel exacte |
| `Failed to fetch` API | rewrite `/api` ou mauvais `VITE_API_URL` absolu → retire `VITE_API_URL` et rebuild |
| Scan timeout | plan / `maxDuration` ; ou API sur Render |
| 404 refresh SPA | rewrite SPA dans le service `frontend` |
| Build `@waypop/shared` | `installCommand` monorepo (`cd .. && npm install`) dans `vercel.json` |

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
VITE_API_URL=https://waypop-api.onrender.com
```

Et un rewrite SPA classique. Le mode Services actuel assume API + web sur le même domaine Vercel.
