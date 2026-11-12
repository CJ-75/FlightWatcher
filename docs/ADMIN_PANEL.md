# Admin FlightWatcher (simplifié FR)

Panneau `/admin` — **inscrits**, **onboarding**, **contenu** (Parcours / Activités / Occasions).

## Accès

1. `ADMIN_PASSWORD=...` dans `backend/.env`
2. `/admin/login` → mot de passe seul (pas de Google)
3. Cookie `admin_session` HttpOnly ~24h

## Menu

| Route | Rôle |
|-------|------|
| `/admin` | Accueil — inscrits, onboardés, taux |
| `/admin/users` | Liste inscrits + statut onboarding |
| `/admin/parcours` | Catalogue parcours |
| `/admin/activities` | Activités |
| `/admin/occasions` | Occasions |

## APIs légères

- `GET /api/admin/inscrits/stats` — KPIs (cache ~45s)
- `GET /api/admin/inscrits?page=&q=&onboarding=all|done|pending`
- Source : table `user_profiles`

## Onboarding en base

À la fin du flow mobile, écriture best-effort :

- `onboarding_completed = true`
- `onboarding_completed_at` (si colonne présente)
- `last_onboarding_step = done`

Migration manuelle (Supabase SQL, **pas** `npx supabase db push`) :

`backend/migrations/user_profiles_onboarding_at.sql`

## Perf

Accueil = 2–3 counts `user_profiles` uniquement (plus de wall_health / growth / status).

## Commit suggéré

`admin simplifie inscrits fr`
