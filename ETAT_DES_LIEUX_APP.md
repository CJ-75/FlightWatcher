# État des lieux FlightWatcher — services, workflows, tests

_Date : 2026-10-25 · Environnement local (sandbox LiteAPI, `DEALS_SOURCE=community`)_

---

## 1. Score global

| Surface | Maturité | Tests auto | Smoke live | Notes |
|---|---|---|---|---|
| Auth / session | Bon | Partiel | Config OK | Supabase requis |
| Search / inspire | Bon | Providers + throttle | Airports OK | Pas de E2E UI |
| Planner collab | Bon | Limité | — | Invite + scan |
| **Deals mur + occasions** | Bon (v4) | Fort (unit) | OK | Voir §4 |
| Favoris / likes | Moyen+ | Partiel | — | Guest landings |
| My Trip / checkout hôtel | Moyen+ | Draft pricing | — | Paiement sandbox |
| Alertes (prix / origin / occasions) | Moyen | Unit F/G + price | — | Digests = cron externe |
| Admin | Moyen+ | — | — | Metrics + Occasions |
| Mobile | Parité partielle | Typecheck only | — | Pas d’onglet Alerts |

**Légende maturité** : Bon = parcours principal utilisable · Moyen = utilisable avec lacunes · Faible = stub.

---

## 2. Surfaces produit

### Web (`frontend/` via `AppNew.tsx` → `App.tsx`)
Onglets : **Search** · **Deals** · **Planner** · **Alerts** · **Saved**  
Routes annexes : `/login`, `/auth/*`, `/security`, `/planner/invite/:token`, `/bookings`, `/trip/:token`, `/admin/*`

### Mobile (`mobile/App.tsx`)
Tabs : Search · Deals · Planner · Favorites · Profile  
Stack : Results, DealDetail, DealCheckout, TripDetail, Bookings, Login, Security

### Admin
Users · Searches · Activated · Deals (métriques) · **Occasions** · Plans · Settings · Tests

---

## 3. Workflows utilisateur par service

### 3.1 Auth
1. Login Google / email (`/login`)  
2. Callback Supabase → session  
3. Accès favoris, likes, bookings, claim Mon voyage  
**Gap** : sans session, landings guest ; likes deals = 401.

### 3.2 Search (vols)
1. Onglet Search → origines, dates, budget, pax  
2. `POST /api/inspire` ou `/api/scan`  
3. Cartes destinations → détail / roulette / combo vol+hôtel → Mon voyage  
4. Option : sauver recherche, favori vol, Booking SAS  
**Gap** : timeouts longs sur scan ; pas de suite E2E UI.

### 3.3 Planner
1. Créer voyage → membres / invite token  
2. Scan partagé → accepter / rejeter propositions  
3. Auto-scan cron optionnel  
**Gap** : couverture tests API limitée.

### 3.4 Deals (séjours vol + hôtel)
1. Onglet Deals → durée (week-end / court / semaine)  
2. Chips occasions (inspire-toi) → filtre `?occasion=`  
3. **Affiner** : départ + arrivée + pax (origine mémorisée)  
4. Carte → fiche → *Autres dates* (même départ) · like · Mon voyage · checkout hôtel  
5. Option : alerte email « deals depuis {ville} »  
**Pipeline data** : seed-scan → baselines → promote → rates → **materialize (+ tags occasions)** → `GET /api/deals`  
**Gaps connus** :
- Filtre occasion encore post-fetch (GIN peu utilisé) → mur parfois vide
- Compteurs chips ≠ filtre durée client
- Deep link `?occasion=` fragile
- `il-fera-beau` off tant que `DEALS_WEATHER_ENABLED` false

### 3.5 Favoris / likes
- **Vols** : Saved / Favorites → `/api/supabase/favorites`  
- **Deals** : like → `/api/liked-deals` + upsert price alert  
**Gap** : guest limité ; unlike doit supprimer alerte.

### 3.6 My Trip & bookings
1. Continuer depuis deal → draft token `/trip/:token`  
2. Réserver vol partenaire → marquer flight-booked  
3. Compose / change hôtel → email optionnel → claim si login  
4. Historique : `/bookings`  
**Gap** : paiement prod = clés LiteAPI ; mobile sandbox simule succès.

### 3.7 Alertes
| Type | Déclencheur | Canal | Cron |
|---|---|---|---|
| Auto-check recherches | Onglet Alerts (web) | In-app / email | Client + `/api/auto-check` |
| Price drop deal | Like deal | Email | `check-price-alerts` (+ après rates) |
| Origin weekly | Signup mur Deals | Email | `send-origin-alert-digests` (externe) |
| Occasions | Config `push: true` + ≥3 deals | Email + Expo | `send-occasion-digests` (externe) |

**Gap** : digests origin/occasions **hors** scheduler in-process ; mobile sans onglet Alerts recherches ; push = tokens Expo à enregistrer.

### 3.8 Admin
- Métriques deals go/no-go, wall health  
- Page Occasions : volume tags, chips, unverified, sends  
**Gap** : pas de tests admin automatisés.

---

## 4. Occasions v4 — checklist livraison

| Lot | Contenu | Statut |
|---|---|---|
| A | Config + holidays + daylight | Done + tests |
| B | SQL tags + tagger materialize | Done · SQL manuel |
| C | API occasions + filtre | Done + tests |
| D | Weather LiteAPI gated | Done · env off par défaut |
| E | UI chips web/mobile | Done (rail + icônes) |
| F | Digests email + push | Done · SQL + cron |
| G | Admin occasions | Done |
| P/O | Pages SSR | Later |

SQL à appliquer manuellement : `apply_deals_occasions_lot_b|d|f_migration.sql` (+ origin alerts si besoin).

---

## 5. Jobs deals (ops)

**Scheduler in-process** (`DEALS_SCHEDULER_ENABLED`) : promote 30′ · revalidate 90′ · baselines 24 h · seed-scan 6 h · catalog 7 j · kill-switch 24 h  
(promote enchaîne rates → **materialize**).

**Cron HTTP** (`CRON_SECRET`) : materialize-wall, digests origin/occasions, price-alerts, wall-health, archive drafts, etc.  
**Retirés (410)** : calendar deals, refresh-deal-flights legacy.

---

## 6. Résultats des tests (cette session)

### Unitaires backend (cœur)
```
deals/test_occasions_* + tagger + weather + v4_vente + price_alerts + materialize
→ 48 passed
```

### Smoke live API (localhost:8000) — 2026-10-25
| Endpoint | Résultat |
|---|---|
| `GET /api/config` | **200** · sandbox LiteAPI · `deals_source=community` · scheduler on |
| `GET /api/deals/occasions?adults=2` | **200** · `main=6` chips (≥3) : un-jour-conge, hotel-plebiscite, extras-offerts, hors-vacances, pepites, max-sur-place |
| `GET /api/deals?adults=2&limit=12` | **200** · 11 deals · tags + badge présents (ex. hiver-soleil, un-jour-conge) · `limit` min=12 |
| `GET /api/deals?...&occasion=hors-vacances` | **200** · 11 deals (filtre actif ; mur déjà riche en ce tag) |
| `GET /api/airports` | **200** · 663 aéroports |
| `booking_sas_events` write/read | **OK** (Supabase) |

### Suite backend large (cette session)
```
pytest deals providers test_booking_sas.py --capture=no
→ exit 0 · ~218 passed · 1 skipped (pas de échec)
```
Cœur occasions déjà validé : **48 passed** (lots A/C/D/F/G + tagger + v4 + price + materialize).

Bug connu Windows : `pytest` sans `--capture=no` peut crash en teardown (`ValueError: I/O on closed file`) — les tests ont déjà tourné ; ignorer ou utiliser `--capture=no`.

### Non couvert / à faire manuellement
- [ ] Parcours UI web E2E (Search → Deals → chip → fiche → Autres dates → checkout)
- [ ] Mobile Expo (même parcours + push token)
- [ ] Digest origin / occasion (cron dry_run)
- [ ] Checkout hôtel sandbox bout-en-bout
- [ ] Admin Occasions + metrics après login
- [ ] `DEALS_WEATHER_ENABLED=true` + horizon météo
- [ ] Typecheck monorepo (`npm run typecheck:all`)

---

## 7. Priorités produit techniques

**P0**
1. Filtre occasion en SQL (`contains` + GIN)  
2. Empty state si 0 chips alors que mur non vide  
3. Stabiliser un seul process backend (:8000)

**P1**
4. Compteurs chips alignés durée / destination  
5. Deep link `?occasion=` robuste (web + mobile)  
6. Brancher cron externe digests jeudi  

**P2**
7. Occasions dans fiche détail  
8. E2E Playwright / Maestro  
9. Pages SSR occasions (Lot P/O)

---

## 8. Comment rejouer les tests

```bash
# Unitaires occasions + vente + alerts
cd backend
python -m pytest deals/test_occasions_lot_a.py deals/test_occasions_lot_c.py deals/test_occasions_lot_f_g.py deals/test_occasion_tagger.py deals/test_weather_lot_d.py deals/test_v4_vente.py deals/test_price_alerts.py deals/test_materialize_wall.py -q

# Smoke
curl http://127.0.0.1:8000/api/deals/occasions?adults=2
curl "http://127.0.0.1:8000/api/deals?adults=2&limit=12"

# Materialize (après SQL Lot B)
# POST /api/deals/jobs/materialize-wall  + header cron
```

---

_Commit suggéré doc : `docs: etat des lieux app workflows`_
