# PROMPT v3.3 — Un mur qui ne meurt pas

> À coller dans ton agent de code, à la racine du repo. Fait suite aux prompts v1, v2, v3, v3.1 et v3.2 (déjà implémentés). **Objectif : supprimer les deux couplages fragiles qui vident le mur**, pas ajouter de surveillance manuelle.

---

## 0. Ton rôle et tes règles

Tu es lead engineer FlightWatcher et expert produit voyage B2C.

**Principe directeur : un deal affiché doit rester affiché pour des raisons stables (photo, dates), et un prix affiché doit rester honnête.** On ne « surveille » pas un mur qui meurt — on coupe les couplages qui le font mourir.

1. Relis d'abord l'état actuel : `community_list` (`require_photo`, soft fill, fallback `hotel_pool`), `compose_hotel` / `upsell` (`_rates_still_usable`, `non_canonical_dates`), `hotel_rates.refresh_hotel_rates` (encore sur `canonical_windows`), `hotel_pool` / `hotel_gallery`, `promote-deals`, scheduler / `job_runs`, `metrics` admin, `draft_pricing` / Mon voyage / prebook LiteAPI, budget Ryanair (v3.2).
2. Résume en 10 lignes et confirme le plan des lots ci-dessous. **Pas de code avant validation.**
3. Chaque lot est petit, derrière flag si pertinent, avec tests et une note « fait / comment tester / reste ».
4. **N'implémente rien de la liste « Hors périmètre » (§9)**, même si c'est tentant.
5. **Ne jamais** `npx supabase db push` — SQL manuel uniquement (`apply_*.sql`).
6. Fin de lot : nom de commit court proposé (ne commit que si demandé).

### Diagnostic à traiter (ne pas diluer)

Deux causes racines du mur vide :

1. **La photo dépend du tarif.** `require_photo=True` + photo souvent portée par `hotel_rates_cache.top` → rates expirés → photo absente → carte absente. Une photo d'hôtel ne change pas en 2 h : elle doit venir du **pool statique en base**.
2. **Les rates sont encore pensés en fenêtres canoniques** (`canonical_windows` / week-end), alors que `deals_active` a des **dates de vol libres**. D'où `non_canonical_dates → rates miss` et compose qui échoue.

Les rustines actuelles (grace stale ~72 h, fallback photo pool à la lecture) restent acceptables **temporairement** ; les lots A–C les remplacent par des invariants propres.

---

## 1. Lot A — Photos en base, découplées des rates (en premier)

Problème : le mur meurt quand les rates expirent, alors que la règle produit « pas de carte sans photo » est bonne.

### A1. Persistance
- S'assurer que chaque hôtel du `hotel_pool` a une `main_photo` (et idéalement `thumbnail`) **écrite en base** au bootstrap / refresh pool — pas seulement dans le JSON `raw` ou dans `hotel_rates_cache.top`.
- Si des lignes pool existent sans photo : job / backfill idempotent qui remplit depuis `raw` ou un appel LiteAPI **data** (pas rates), avec budget et logs.
- Migration SQL manuelle si colonnes / index manquants (`apply_deals_v33_lot_a_migration.sql`).

### A2. Règle d'affichage
- `community_list` / promote / scoring : la **photo carte** = `hotel_pool.main_photo` (ou thumbnail), **jamais** conditionnée à un row rates frais.
- `require_photo` reste vrai, mais la source de vérité photo est le pool.
- La galerie hover / fiche peut enrichir ensuite ; le mur ne doit **pas** appeler LiteAPI au listage pour une photo.

### A3. Retrait de la rustine photo
- Une fois A1–A2 verts : le fallback « inventer un hôtel depuis le pool juste pour la photo » au listage peut rester en last-resort, mais ne doit plus être le chemin nominal.
- Documenter dans la note de lot ce qui reste comme filet.

**DoD** :
- un deal dont les rates sont expirés **reste visible** s'il a un hôtel pool avec photo ;
- un test unitaire / intégration prouve que la photo carte ne lit pas `hotel_rates_cache` ;
- sur une dest seed, ≥ 90 % des hôtels pool rankés ont `main_photo` non vide après backfill.

---

## 2. Lot B — Rates aux dates réelles de `deals_active`, chaînés après promote

Problème : `refresh_hotel_rates` itère `canonical_windows` ; les deals community ratent le cache → compose miss.

### B1. Refresh piloté par les deals
- Nouveau chemin (CLI + endpoint cron) : `refresh-deal-rates` (nom libre) qui :
  1. lit `deals_active` (actifs, non expirés) ;
  2. déduplique les combos `(destination_id | iata, checkin, checkout, adults)` ;
  3. rafraîchit / upsert `hotel_rates_cache` (ou bucket on-demand existant) pour **ces dates exactes** ;
  4. respecte un **budget LiteAPI** par run (`DEALS_RATES_REFRESH_MAX_CALLS`, défaut raisonnable, ex. 80) et une priorité (origines `SEED_PRIORITY_ORIGINS` d'abord, puis deals `live`, puis le reste).
- Réutiliser le scoring / top-N existants ; ne pas réinventer LiteAPI.

### B2. Fenêtres canoniques
- Les windows week-end peuvent rester pour le calendrier / legacy **si encore flagués** ; elles ne sont plus le moteur du mur community.
- Search / compose sur dates libres : si miss, **fetch on-demand** (déjà prévu) doit réellement partir — plus de cul-de-sac `non_canonical_dates` sans filet. Si `fetch_if_miss=false` côté browse, le job B1 doit avoir rempli le cache **avant** le listage.

### B3. Chaînage des jobs
- Ordre fixe après un promote réussi : **`promote-deals` → `refresh-deal-rates` → (re)compose / materialize hotel_top3 si besoin**.
- Pas trois minuteries indépendantes qui se croisent. Scheduler : enchaîner ou déclencher rates « due » uniquement pour les clés des deals fraîchement promus + deals dont rates > TTL.

**DoD** :
- un deal community aux dates non-week-end obtient un row rates `ok` après le job ;
- un test montre qu'un combo hors `canonical_windows` n'est plus systématiquement `non_canonical_dates` sans tentative ;
- le résumé du job logue `combos`, `ok`, `skipped_budget`, `api_calls`.

---

## 3. Lot C — Soft fill et grace stale honnêtes

Problème : « dès X € » sans hôtel = vol déguisé ; grace 72 h = tarif zombie.

### C1. Soft fill sans tarif hôtel bookable
Choisir **une** des deux présentations (implémenter la 1re par défaut, flag pour la 2de si simple) :

1. **Vol seul explicite** : libellé du type « Vol dès X € · hôtel à choisir » — le total carte n'inclut **pas** un hôtel fantôme.
2. **Fourchette indicative pool** : « Hôtels dès Y €/nuit » dérivé du pool / derniers rates frais de la ville, **clairement indicative**, jamais additionnée en silence au total « séjour ».

Interdit : afficher un total séjour = vol seul.

### C2. Grace stale plafonnée
- Remplacer le grace ~72 h par `DEALS_RATES_STALE_GRACE_H` (défaut **24**).
- Au-delà : ne plus servir le tarif stale comme prix hôtel bookable ; basculer sur C1 (vol seul ou fourchette indicative).
- Le prebook LiteAPI reste la vérité paiement (inchangé).

### C3. Badges / copy
- Aucun badge qui laisse croire qu'un prix hôtel est confirmé s'il est stale ou indicatif.
- Aligner web + mobile.

**DoD** :
- test : rates expirés depuis 30 h → pas de prix hôtel bookable sur la carte ; copy soft fill honnête ;
- test : rates expirés depuis 2 h (dans la grace) → encore utilisables ;
- revue manuelle 5 cartes soft fill : aucun total trompeur.

---

## 4. Lot D — Invariants, alertes, chaînage visible

Problème : checklist manuelle oubliée ; le mur se vide avant qu'on le sache.

### D1. Invariants (seuils configurables)

| Invariant | Seuil d'alerte (défaut) |
|---|---|
| Deals avec photo, par origine prioritaire | `< 8` |
| Part des deals actifs avec tarif hôtel **frais** (dans TTL, hors grace) | `< 70 %` |
| Âge des baselines (dernière refresh OK) | `> 36 h` |
| Taux de 403 Ryanair | `> 5 %` sur 1 h |
| Dernier run OK de chaque job critique | `> 2 ×` sa fréquence nominale |

### D2. Surfaces
- Page / section **santé** dans l'admin Deals (réutiliser `metrics` / `job_runs`).
- Email quotidien optionnel (Resend) si un invariant est rouge — flag `DEALS_HEALTH_EMAIL_TO`.
- Logs structurés + compteur pour le 403 (s'appuyer sur le budget/circuit v3.2).

### D3. Chaînage documenté
- Une seule vue « dernier promote → dernier rates-deal → dernier compose » avec timestamps.
- Si rates n'a pas tourné après promote : invariant rouge.

**DoD** :
- admin affiche vert/rouge sur données de test ;
- un test unitaire évalue les seuils ;
- email dry-run ou log « would_send » en local.

---

## 5. Lot E — Smoke test automatisé de la chaîne de prix

Problème : écart carte → Mon voyage → prebook = perte de confiance.

### E1. Scénario automatisé (CI ou `python -m deals.smoke_price`)
1. Prendre 1 deal `live` avec hôtel rates `ok` (fixture ou sandbox).
2. Lire `price_per_person` / total carte (serveur).
3. `POST` create my-trip (ou équivalent) — **recalcul serveur**, jamais trust client.
4. PATCH hôtel si applicable — recalcul serveur.
5. Appeler le chemin prebook / quote hôtel (sandbox LiteAPI) et comparer dans une **tolérance** (`DEALS_PRICE_SMOKE_TOLERANCE_PCT`, défaut 5 % hors taxes clairement séparées).

### E2. Échec = signal
- Exit non-zero + message actionnable.
- Pas de flaky : skip explicite si sandbox / clés absentes (`SKIP` documenté), fail si clés présentes et écart hors tolérance.

**DoD** : un run local documenté dans la note de lot ; écart volontaire dans un test unitaire détecté.

---

## 6. Lot F — Point 403 Ryanair en prod + validation humaine

Problème : sans vols live fiables, les badges et la revalidation mentent.

### F1. Prod
- Vérifier budget horaire, cache TTL, priorités click > revalidate > organic > promote (v3.2).
- Mesurer le taux 403 réel 24–48 h ; ajuster plafonds si besoin **sans** re-ouvrir le seed à Ryanair.
- Documenter le runbook : circuit open, bascule cached, alerte D1.

### F2. Soft launch
- Faire parcourir le mur + Mon voyage à **2 ou 3** personnes réelles (origines prioritaires).
- Noter : mur vide ? prix qui saute ? copy soft fill comprise ?
- Corriger uniquement les bugs bloquants remontés ; pas de nouveau scope UX.

**DoD** :
- taux 403 sous le seuil D1 sur une fenêtre de 24 h **ou** plan écrit + flag si impossible ;
- compte-rendu court des 2–3 tests utilisateurs (même en commentaire PR / note de lot).

---

## 7. Configuration ajoutée

```
DEALS_RATES_STALE_GRACE_H=24
DEALS_RATES_REFRESH_MAX_CALLS=80
DEALS_HEALTH_MIN_DEALS_WITH_PHOTO=8
DEALS_HEALTH_MIN_FRESH_HOTEL_RATE_SHARE=0.70
DEALS_HEALTH_BASELINE_MAX_AGE_H=36
DEALS_HEALTH_RYANAIR_403_MAX_SHARE=0.05
DEALS_HEALTH_EMAIL_TO=
DEALS_PRICE_SMOKE_TOLERANCE_PCT=5
DEALS_SOFT_FILL_MODE=flight_only
# flight_only | indicative_hotel_night
```

(Réutiliser `SEED_PRIORITY_ORIGINS`, `DEALS_BASELINE_MAX_AGE_H` v3.1 si déjà présents — ne pas dupliquer sous deux noms.)

---

## 8. Ordre de livraison

| Lot | Contenu | Pourquoi dans cet ordre |
|---|---|---|
| **A** | Photos en base découplées des rates | Correctif principal du mur vide |
| **B** | Rates aux dates de `deals_active` + chaînage post-promote | Correctif principal des compose miss |
| **C** | Soft fill + grace 24 h honnêtes | Confiance prix |
| **D** | Invariants + alertes + chaînage visible | Remplace la checklist manuelle |
| **E** | Smoke chaîne de prix | Filet avant ouverture |
| **F** | 403 prod + 2–3 vrais users | Validation terrain |

---

## 9. Hors périmètre (ne pas implémenter)

- Wizard Search sans `deal_key` / « trust vol » hors deal.
- Compose hôtel **natif** mobile (garder in-app browser).
- Traduction i18n.
- Nouvelle source de vols live (Flights LiteAPI, etc.).
- Refonte visuelle majeure du mur.
- Élargir le grace stale au-delà de 24 h « pour remplir le mur ».
- Réactiver le calendrier week-end legacy comme filet community.
- Boutons admin de seed manuel au-delà de la page santé.

---

## 10. Note de fin (obligatoire à chaque lot)

Pour chaque lot livré, coller :

```
### Fait
- …

### Comment tester
- …

### Reste
- …

Commit proposé : v3.3-lot-X-…
```
