# PROMPT v4 — Deals qui vendent

> À coller dans ton agent de code, à la racine du repo. Fait suite à v3.3 (mur stable). **Objectif : convertir avec des prix réels** — récit calculé, variété, origine visible, boucles de retour. Pas de copy VoyagesPirates (urgence inventée, prix d’exemple figés).

---

## 0. Ton rôle et tes règles

Tu es lead engineer FlightWatcher et expert produit voyage B2C.

**Principe directeur : la donnée est déjà meilleure que VoyagesPirates ; ce qui manque, c’est la vente** (pourquoi c’est une affaire, variété, origine, occasion).

1. Relis : `DealCard`, `DealsTab` / `DealsScreen`, `DealDetailModal`, `community_list`, `badge_for_baseline`, `baggage`, photos pool.
2. Résume en 10 lignes et confirme les lots. **Pas de code avant validation** (sauf si l’utilisateur demande d’exécuter tout de suite).
3. Lots petits, flags si besoin, tests, note « fait / tester / reste ».
4. **Hors périmètre §9** : ne pas implémenter.
5. **Jamais** `npx supabase db push` — SQL manuel `apply_*.sql`.
6. Fin de lot : nom de commit court (commit seulement si demandé).

### Diagnostic (ne pas diluer)

| Eux (VoyagesPirates) | Nous |
|---|---|
| Titre émotion + inclus + occasion | Fiche technique répétée |
| Origine implicite / multi-villes | Origine cachée dans Affiner |
| Fil d’intentions saisonnières | Mur monotone (5 villes × N cartes) |
| Newsletter / WhatsApp / app | Pas de boucle de retour |
| Prix « à partir de » dates d’exemple | **Prix réels vol+hôtel** (notre avantage) |

Sous-titre cible : **« Des prix réels, vérifiés, depuis ton aéroport. »**

---

## 1. Lot A — Mur : origine, durée, diversité (P0)

### A1. Chip départ visible
- Au-dessus du mur (hors Affiner replié) : chip **« Départ : {ville} ▾ »**.
- Au 1er passage sans préférence : demander / préremplir (géoloc soft ou Paris) puis **localStorage** (`fw_deals_origin`).
- Sync avec le filtre Affiner « Départ ».
- Option « aéroports proches » si déjà en data (sinon v4.1).

### A2. Onglets durée
- Titre page : **« Séjours vol + hôtel »** (plus « Week-ends » si le mur mélange).
- Onglets : **Week-end (1–3 nuits) · Court (4–5) · Semaine (6–9)**.
- Filtre côté list API ou client : `nights` déjà sur le deal.
- Tri / comparaison uniquement **dans** l’onglet actif.

### A3. Diversité stricte
- Sur **tout** le mur (avec ou sans origine) : **max 2 cartes / ville**, **max 3 / pays**.
- Appliquer dans `list_community_deals` après enrich, avant truncate.
- Mur plus court OK (12 > 20 clones).

**DoD** : chip visible ; onglet week-end ne montre pas 7 nuits ; ≤ 2 Lisbonne sur un mur sans origine.

---

## 2. Lot B — Accroche calculée (P0)

Sur chaque carte, **une** accroche vraie, choisie par score (la plus forte) :

| Accroche | Source |
|---|---|
| « −X % vs habitude » | `baseline` / badge existant (rare) |
| « Vol direct à Y € A/R » | `flight.direct` + `flight_pp` |
| « Hôtel N/10 pour Z € les N nuits » | rating + hotel_pp + nights |
| « Le moins cher vers {ville} ce mois » | si 1er du mois / dest (observations) — optionnel v4.1 |

- Champ API : `hook` / `hook_kind` (string courte).
- **Aucun LLM** dans ce lot (titres LLM = lot F).
- Remplace « Prix vérifié » comme signal principal de *valeur* (la vérif reste en fiche / ligne méthode).

**DoD** : ≥ 80 % des cartes ont un `hook` non vide ; aucune accroche inventée hors champs.

---

## 3. Lot C — Carte lisible (P1)

Anatomie :
1. Photo (façade / ville — **pas chambre / SDB**), cœur, badge **Nouveau** si `fetched_at` < 24 h.
2. Ville + accroche.
3. Prix **140 € / pers.** + « 2 nuits · vol 53 € + hôtel 87 € » **une ligne**.
4. Dates + horaires : « mar. 24 → jeu. 26 nov · Aller 13:00 → 14:00 · Retour 17:10 → 20:30 ».
5. « depuis {ville départ} ».
6. Hôtel : étoiles · nom · note · centre.
7. **≤ 3 chips** : Vol direct · Petit-déj · bagage (rétablir ligne bagages lot D).
8. **Carte entière cliquable** ; CTA discret « Voir l’offre → » ; orange = prix seulement.

### C1. Photo couverture
- Interdire URLs / tags chambre / bathroom si signal dispo ; sinon heuristique `raw` / gallery rank.
- Préférer `main_photo` pool déjà « façade ».

### C2. Microcopy
- Retirer « FR » cryptique ; horaires aller **et** retour.
- Rétablir `baggage_line` sur la carte.

**DoD** : carte cliquable sans gros bouton orange ; bagages visibles si data ; ret_dep_local affiché.

---

## 4. Lot D — Fiche argumentaire (P1)

Sur `DealDetailModal` / mobile détail :
1. **Pourquoi c’est un bon plan** — 3 puces calculées (baseline, note vs gamme, direct + horaires).
2. Pictos points forts (données only).
3. **Autres départs / dates** — 3–5 deals `deals_active` même ville (autres origines / dates), prix réels, **avant** « Voir d’autres dates → Search ».
4. Ligne méthode : « Prix vérifié aujourd’hui · comment on sélectionne ».
5. **Partager WhatsApp** (texte court + lien).

**DoD** : bloc « Autres options » non vide quand ≥ 2 deals même `dest` en base.

---

## 5. Lot E — Boucles de retour (P1–P2)

1. Module après la 6e carte : **« Les meilleurs deals depuis {ville} chaque jeudi »** + email (sans compte). Resend déjà là.
2. Partage WhatsApp carte + fiche.
3. Preuve sociale si seuil : « Sauvegardé N fois cette semaine » (likes agrégés).
4. Rails saisonniers (table ~15 occasions) — **P2**, dates vérifiées seulement.

**DoD** : inscription alerte stockée + email de confirmation ; métrique `alert_signup`.

---

## 6. Lot F — Titres humains data-only (P2)

- Template ou LLM **strict** : input = champs structurés uniquement ; interdiction d’affirmer stock / « chambres qui partent ».
- Ex. « Lisbonne en 4★ noté 9,4, vol direct, petit-déj ».

---

## 7. Mesure

- CTR carte → fiche
- Fiche → Continuer
- Inscriptions alerte
- Retour J+7

Pas d’A/B avant 3–5 tests utilisateurs qualitatifs.

---

## 8. Ordre d’implémentation

1. **A** (origine + durée + diversité) — débloque la promesse
2. **B** (accroche) — débloque la valeur
3. **C** (carte) — lisibilité
4. **D** (fiche) — argumentaire
5. **E** (alerte) — levier distribution
6. **F** (titres) — polish

---

## 9. Hors périmètre

- Urgence non vérifiable (« chambres partent vite »)
- Prix d’exemple figés type Lastminute
- Ski / croisières / voiture
- Refonte Search / Planner
- Copier le ton emoji spam VoyagesPirates
- `supabase db push`

---

## 10. Livrable par lot

- Diff + tests
- Note : fait / comment tester / reste
- Nom de commit court proposé
