# Onboarding KPI + captures (Lot 6)

## Events allowlist (`backend/activities/event_limits.py`)

| Domain | Events |
|--------|--------|
| auth | `auth_sheet_opened`, `auth_started`, `auth_succeeded`, `auth_failed` |
| invite | `invite_landing_viewed`, `invite_join_clicked`, `invite_joined`, `invite_preview_failed`, `app_promo_*` |
| onboarding | `onboarding_started`, `onboarding_city_set`, `onboarding_pref_set`, `onboarding_completed`, `first_name_*`, `permission_*` |

Surfaces: `auth_sheet`, `invite_landing`, `onboarding`, `permissions`.

## KPI grille (validation manuelle)

1. **AuthSheet** — 6 triggers web + Expo : invite_join, favorite, create_trip, invite_friends, book, already_account.
2. **Invite** — preview restreint ; join → TripV2 + toast ; états open/full/expired ; AppPromo web.
3. **Nouvel user** — Promise → Ville → Pref < 30s jusqu’au prix ville (Parcours).
4. **Parcours partagé** — heart → AuthSheet ; MakeTrip dates sans auth ; create → AuthSheet ; open-in-app.
5. **Permissions** — zéro prompt OS au cold launch ; preprompt + cooldown 14j.
6. **Empty** — Voyages / Favoris + tip Inviter.

## Captures à valider

- [ ] AuthSheet Apple / Google / email (web)
- [ ] AuthSheet (Expo)
- [ ] InviteLanding cover + join
- [ ] AppPromo card
- [ ] Onboarding 3 écrans B
- [ ] CityBanner web
- [ ] MakeTrip formulaire invité puis AuthSheet
- [ ] PermissionPreprompt (push)
- [ ] Empty Voyages + tip
- [ ] Empty Favoris
