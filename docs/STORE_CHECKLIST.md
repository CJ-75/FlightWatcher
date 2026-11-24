# WayPop — Avancement store (App Store + Play)

Doc de suivi. On avance **step by step**.  
**Push V1 (6 notifs) + Resend = inclus.**

**Hébergement choisi :** API **Render** (Frankfurt) + front **Vercel** (`waypop.co`).  
Guide : [RENDER_API.md](RENDER_API.md). Mobile API → `https://api.waypop.co` (pas same-origin Vercel Services).

Légende : ✅ fait · 🟡 en cours / partiel · ⬜ à faire · 🔒 manuel · 🔧 repo

---

## Assets (rappel)

Placeholders dans `mobile/assets/` — **à remplacer** avant submit (mêmes chemins).  
Régénérer : `python mobile/scripts/gen_store_assets.py`

## Backlog UX (plus tard)

- **Signup avec mot de passe** : la création de compte doit proposer / exiger un mot de passe (form actuel pas bon — reset password smoke bloqué).
- **Pop SEO Next** : déployer `apps/web-public` + rewrite Vercel `/pop/*` (fallback SPA `/pop/:city/:slug` en place).

---

## Ordre des étapes

| # | Étape | Qui | Statut |
|---|--------|-----|--------|
| **1** | Base mobile (`eas.json`, cleartext, versions, assets placeholder) | 🔧 | ✅ |
| **2** | Comptes + EAS (`eas login`, `build:configure` → projectId) | 🔒 | ✅ `ae76aa6f-…` |
| **3** | API **Render** + DNS `api.waypop.co` + front Vercel | 🔒 | ✅ API + `waypop.co` + `WEB_APP_URL` |
| **4** | **Resend** domaine + `RESEND_*` + tests | 🔒 | ✅ smoke `confirmation_sent:true` (contact@waypop.co) |
| **5** | **Push V1** code + SQL + mobile | 🔧 | 🟡 |
| **5b** | Appliquer `apply_push_v1_migration.sql` + crons + APNs/FCM | 🔒 | 🟡 SQL ✅ · crons ✅ · APNs/FCM ⏸️ avec comptes Apple/Play |
| **6** | Sécu release | 🔒 | ✅ bypass=0 · hash admin · HTTPS · privacy |
| **7** | Supabase Auth redirects + OAuth native | 🔒 | ✅ web waypop.co · native ⏸️ build preview |
| **8** | Preview EAS + tests (mail + 6 push) | 🔒 | ⬜ |
| **9** | Assets finaux + screenshots | 🔒 | ⬜ |
| **10–12** | Metadata + prod submit + go-live | 🔒 | ⬜ |

---

## Push V1 (catalogue)

Voir [docs/PUSH.md](PUSH.md) — **6 push** (groupe 1–4, pops 5–6).  
**Pas de push prix** (email only). Legacy occasion/J-7/relaunch push coupés (`PUSH_V1_ONLY=1`).

Repo déjà : `backend/push/`, routes `/api/push/*`, hooks planner, `expo-notifications`, Profile toggles, preprompt post-onboarding.

À faire manuellement :
1. SQL `apply_push_v1_migration.sql` dans Supabase
2. Crons listés dans `.env.example`
3. EAS projectId + APNs/FCM
4. Build **preview** (natif)

---

## Journal

| Date | Fait |
|------|------|
| 2026-11-22 | Étape 1 mobile store-ready |
| 2026-11-23 | Push V1 spec + backend + mobile opt-in ; legacy push gated |
| 2026-11-23 | Confirmé stack : Render API + Vercel front (pas Vercel Services seul) |
| 2026-11-23 | Render `waypop-api` live · `api.waypop.co` OK |
| 2026-11-23 | `vercel.json` front-only (API → api.waypop.co) |
| 2026-11-23 | Vercel Waypop live · DNS `waypop.co` · `WEB_APP_URL` Render |
| 2026-11-23 | Resend domaine + `RESEND_*` Render |
| 2026-11-24 | Push SQL + crons Supabase · Auth redirects waypop.co OK |
