# Notes de fin de lot — Viator / parcours v7

## Lot A — Socle
### Fait
- Migration `apply_activities_lot_a_migration.sql` (PostGIS, places, place_refs, provider_cache, trip_items XOR, events+platform, itineraries, schema_migrations)
- Module `backend/activities/` + boot check + hotel→place hook
- Shared types/labels/API client

### Comment tester — Web / API
1. Appliquer manuellement `apply_activities_lot_a_migration.sql` dans Supabase SQL.
2. `GET /api/config` → `migrations_ok`, `activities_ui_enabled`.
3. `GET /api/admin/activities/migrations`.

### Comment tester — iOS / Android (Expo)
- N/A UI ; consommer `getConfig()` / `listTripItems` via shared client.

### Reste
- Appliquer la migration sur chaque environnement.

---

## Lot B — Viator sandbox
### Fait
- Client Retry-After, ranking, snapshot/city+nearby endpoints, format cartes shared.

### Comment tester — Web
- `GET /api/activities/cities/paris?adults=2` (clé Viator sandbox).
- Cron `POST /api/activities/jobs/sandbox-check`.

### Comment tester — Expo
- Même endpoints via `listCityActivities` / `nearbyActivities`.

### Reste
- `VIATOR_API_KEY` + `VIATOR_ENV=sandbox`.

---

## Lot C — Onglet Activités
### Fait
- Web `ActivitiesTab` + nav/routes `/activites` ; Expo `ActivitiesScreen` + tab + deep link.

### Comment tester — Web
1. `ACTIVITIES_ENABLED=true`, reload.
2. Onglet Activités → ville → fiche → « Réserver sur Viator » (open sync) → retour visibility prompt.

### Comment tester — Expo
1. Même flag ; onglet Activités ; InAppBrowser ; AppState prompt.

### Reste
- Grille 3 col desktop / 1 col mobile déjà en place.

---

## Lot D — Autour de moi
### Fait
- API nearby + cell ; web geolocation ; Expo `expo-location` (coords arrondies).

### Comment tester — Web
- CTA « Autour de moi » (HTTPS / localhost).

### Comment tester — Expo
- Permission localisation → listing + header rayon / fallback.

### Reste
- Densités réelles selon destinations Viator.

---

## Lot E — Planner ③ + MyTrip
### Fait
- `ActivityStepPanel` web (HTML DnD) + Expo (monter/descendre) → `reorderTripItems`.
- Pipeline step activities ; skip / validate / book-return.

### Comment tester — Web
- Mon voyage (`PLANNER_ACTIVITIES_ENABLED` ou activities UI) → ③ Activités.

### Comment tester — Expo
- TripSummary → panneau Activités + AppState return.

### Reste
- DnD natif gesture-handler optionnel plus tard.

---

## Lot F — Surfaces hors onglet
### Fait
- `ActivitySurfaceBanner` deal web+Expo ; J-7 email+push (`reminders.py` + scheduler + cron).

### Comment tester — Web
- Fiche deal → bannière activités ; `POST /api/activities/jobs/j7-reminders` (cron).

### Comment tester — Expo
- DealDetail bannière ; push token déjà via occasions.

### Reste
- Surface transfert >25 km / occasions si besoin d’UI dédiée.

---

## Lot G — Parcours
### Fait
- API create/apply/get ; pages `/parcours` web ; `ItineraryDetail` Expo.

### Comment tester — Web
- `ITINERARIES_ENABLED=true` → `/parcours?draft=TOKEN` → create → apply.

### Comment tester — Expo
- Deep link `flightwatcher://parcours/:id`.

### Reste
- Liste parcours utilisateur (endpoint list) si besoin produit.

---

## Hardening sécurité (post-review)
- Jobs cron : `require_cron` (Bearer `CRON_SECRET`) — dont `refresh-snapshots` + `j7-reminders`
- Admin `/api/admin/activities/*` : `@require_admin`
- trip_items mutate : `draft_token` obligatoire si draft ; membre planned_trip sinon
- Events : allowlist domain/event/surface/platform + rate-limit IP
- `migrations_ok` : admin only (bandeau `/admin/activities`, plus dans `/api/config` public)
- J-7 : dédup 6 jours via table `events`
- Snapshot hebdo grandes villes : job + scheduler 7j

## Lot H — Mesure + tests
### Fait
- Admin `/admin/activities` funnel + platform filter ; events.platform web/ios/android ; tests A/B + security/access

### Comment tester — Web
- Admin Activités ; filtrer platform ; checklist lots ci-dessus.

### Comment tester — Expo
- Events `platform=ios|android` après book_click.

### Reste
- Batterie manuelle §8 complète sur device réel + sandbox Viator.
