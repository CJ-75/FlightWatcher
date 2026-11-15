# Stratégie Push — WayPop

Objectif : rappeler les bons moments sans spam. Priorité aux **actions utiles** (relancer un séjour, prix trouvé, J-7 activités).

## Canaux

| Canal | Quand | Infra |
|-------|--------|--------|
| **In-app CTA** | Immédiat, user-initiated | Planner hub / détail |
| **Email** | Confirmation + nudge | Resend (`email_notify.py`) |
| **Push Expo** | Nudge + événements chauds | `deals/push_notify.py` + table `push_tokens` |

Mobile : enregistrement token via `POST /api/deals/push-tokens` (à brancher `expo-notifications` — voir PARITY).

## Cas : séjour terminé **sans réservation**

Un `planned_trips.status = completed` (hub **Passés**) **sans** vol/hôtel réservé = intention non convertie.

### Produit

1. **CTA in-app** « Relancer avec de nouvelles dates » (organisateur seulement)
2. Choix de dates **futures** (presets week-end / custom)
3. API `POST /api/planner/trips/{id}/relaunch` → dates + `planning` + **scan complet**
4. Email + push de **confirmation** au relance (orga + membres avec email)

### Nudge automatisé (phase 2)

Cron quotidien (ex. 10h Europe/Paris) :

- Cible : `completed`, pas de réservation active, last nudge > 14j, dates séjour passées ≥ 3j
- Push : « Tu veux repartir ? Mets à jour les dates de {trip} »
- Email : même message + deep link `/planner?trip={id}&relaunch=1`
- Cap : **1 nudge / séjour / 14 jours**, max **2** au total, opt-out = désinscription email / token push `active=false`

Feature flags (proposés) :

```
PLANNER_RELAUNCH_PUSH_ENABLED=1
PLANNER_RELAUNCH_NUDGE_ENABLED=0   # activer après tokens mobile
```

### Payload push (convention)

```json
{
  "type": "planner_relaunch",
  "trip_id": "uuid",
  "screen": "TripDetail"
}
```

Deep link app : `flightwatcher://planner/trip/{id}` (puis `waypop://` quand allowlist Supabase à jour).

## Autres types déjà / bientôt

| `type` | Trigger |
|--------|---------|
| `deal_price_drop` | Like deal + baisse |
| `occasion_alert` | Occasions Lot F |
| `activity_j7` | Rappels activités J-7 |
| `planner_under_budget` | Surveillance prix (email aujourd’hui) |
| `planner_relaunch` | Relance dates (ce doc) |

## Principes UX

- Un seul job par notif : **ouvrir le bon écran**
- Jamais de push marketing générique
- Quiet hours 21h–9h Europe/Paris
- Toujours un chemin in-app équivalent (pas de dépendance exclusive au push)

## Rollout

1. ✅ CTA + API relaunch + email confirmation
2. Brancher `expo-notifications` + enregistrement token au login
3. Activer nudge cron (`PLANNER_RELAUNCH_NUDGE_ENABLED`)
4. Mesurer : ouverture push → sheet dates → scan réussi
