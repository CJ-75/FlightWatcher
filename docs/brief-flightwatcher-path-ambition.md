# Brief FlightWatcher — état actuel + ambition Path

**Usage :** coller ce document dans un autre LLM **avec la capture UI Path en pièce jointe**.  
**Date :** 7 novembre 2026  
**Repo :** FlightWatcher (monorepo web + mobile + API)  
**Décision produit déjà prise :** Path = **peau visuelle du Planner** (pas un 2ᵉ produit, pas une marketplace).

---

# PARTIE A — État actuel de l’application

## A1. Identité produit

**FlightWatcher** est une app de voyage low-cost (FR primaire) qui aide à **composer un séjour de bout en bout** :

1. Trouver un **vol** pas cher (surtout Ryanair, aussi meta-search Travelpayouts)
2. Trouver / réserver un **hôtel** (LiteAPI, paiement in-app)
3. Ajouter des **activités** (catalogue Viator)
4. Organiser le tout dans un **Planner collaboratif** (inviter des proches)

**Plateformes :**
- Web (React + Vite + Tailwind)
- Mobile (Expo / React Native, police Sora)
- Backend unique FastAPI + Supabase (Auth Google + Postgres)

**Cible :** voyageurs FR (week-ends / city-trips), solo / duo / groupe (1–6 personnes).  
**Brand UI actuelle :** warm peach / orange (`#FF6B35`, fond `#FFF9F5`) — **pas** dark magazine. Photos destinations (~400+ heroes villes).

**Origine :** démarré comme scanner de vols Ryanair → évolué en builder de séjour multi-modules.

---

## A2. Architecture technique (résumé)

```
FlightWatcher/
  backend/              # FastAPI — API unique
  frontend/             # React 18 + Vite — app web user + /admin
  mobile/               # Expo / RN — iOS/Android
  packages/shared/      # @flightwatcher/shared — types, client API, i18n, cityImages, pipeline, copy planner
  migrations/ + apply_*.sql   # SQL Supabase manuel (jamais npx supabase db push)
```

**Partenaires :**
| Domaine | Provider |
|---|---|
| Vols | Ryanair, Travelpayouts/Aviasales |
| Hôtels | LiteAPI (compose live + mur deals pré-caché) |
| Paiement hôtel | LiteAPI Payment SDK |
| Activités | Viator Partner API |
| Auth / DB | Supabase (Google OAuth + RLS) |
| Restos | Liens Maps / Places (feature flag) |

**Feature flags** (via `GET /api/config`) :  
`DEALS_UI_ENABLED`, `ACTIVITIES_ENABLED`, `PLANNER_ACTIVITIES_ENABLED`, `PLANNER_RESTAURANTS_ENABLED`, `ITINERARIES_ENABLED`, `ALERTS_UI_ENABLED` (off par défaut), `DEALS_BOOKING_ENABLED`, etc.

---

## A3. Navigation principale

### Web (onglets)
| Route | Label |
|---|---|
| `/vols` | Vols |
| `/sejours` | Séjours |
| `/planner` (+ `/:tripId`) | Planner |
| `/activites` | Activités (flag) |
| `/favoris` | Favoris |
| `/alertes` | Alertes (flag, souvent off) |
| `/trip/:token` | Mon voyage (MyTrip) |
| `/bookings` | Réservations |
| `/planner/invite/:token` | Invitation |
| `/parcours` | Itineraries Lot G (stub, flag) |

### Mobile (bottom tabs)
**Vols · Séjours · Activités · Voyages (= Planner) · Profil**  
Favoris accessible depuis Profil. Deep links `flightwatcher://…`.

---

## A4. Modules fonctionnels — ce que l’app fait aujourd’hui

### 1) Vols (recherche / inspire / scan)
- Choisir aéroport(s) de départ, dates (presets weekend / dates libres), budget €/pers, directs.
- Modes : recherche ciblée, **inspire** (destination ouverte), roulette.
- Résultats A/R enrichis (prix, image ville, deal quality).
- CTAs : réserver chez le partenaire, upsell hôtel, **Ajouter au planner**.

### 2) Séjours (mur de deals)
- Mur de séjours **vol + hôtel** pré-assemblés (« Séjours pas chers »).
- Destinations **seed** (~85 curées) + **organic** (issues des recherches users).
- Filtres durée / occasions / origine.
- Fiche deal → checkout hôtel / Mon voyage / Ajouter au planner.

### 3) Planner (séjour collaboratif) — cœur du sujet Path
Hub « **Tes séjours** » avec filtres **À venir · En cours · Passés**.

**Créer un séjour :**
1. Nom + party mode (Solo / Duo / À plusieurs 3–6)
2. Départ, destination (ou inspire), dates, budget, directs
3. Création → ouverture détail + **auto-scan** des vols

**Phases d’un séjour (`TravelWorkspacePhase`) :**
| Phase | Label FR | Sens |
|---|---|---|
| `planning` | En cours | Scanner / choisir un vol |
| `flight_selected` | Vol choisi | Passer à l’hôtel |
| `composing` | À finaliser | Checkout hôtel en cours |
| `booked` | Réservé | Séjour réservé |
| `past` | Terminé | Archivé ou date dépassée |

**Pipeline UI « Ton parcours » :** Vol → Hôtel → Activités.  
*(Adresses / restos : flag existant, **hors plan Path pour le moment**.)*

**Actions détail (orga) :** scanner, accepter/refuser propositions, « J’ai déjà un vol », modifier modalités + rescanner, composer/payer hôtel, « J’ai déjà un hôtel », activités, partager lien invite, ajouter/retirer membres (max 6), renommer, archiver, supprimer (bookings conservés).

**Invité :** voit le séjour, peut booker son vol / composer son hôtel pour soi ; **ne** scanne **pas** et **n’accepte pas** le vol à la place de l’orga. Pas d’action « Quitter le séjour » soi-même.

**Entry points vers un séjour :**
- Hub Planner
- Search / Deals → Ajouter au planner
- Promote d’un draft MyTrip perso
- Activités → « Où l’ajouter ? »
- Lien invite `/planner/invite/:token`
- Retour depuis MyTrip / Bookings

### 4) MyTrip / hôtel / paiement
- Draft partageable (`draft_token`) lié au planner.
- Compose hôtel LiteAPI (liste, photos, Maps, sélection).
- Prebook → pay → book → **facture PDF hôtel** (seul PDF actuel = booking, pas un guide).
- Distinction claire : résa vol partenaire ≠ résa hôtel FlightWatcher.

### 5) Activités
- Catalogue par ville (Viator), nearby « autour de moi ».
- Ajout au séjour (`trip_items` : idea / validated / booked / skipped).
- Champs `day_offset`, `moment`, `notes` **existent en data** mais **pas d’éditeur UI diary** aujourd’hui.
- Flag `PLANNER_ACTIVITIES_ENABLED` pour l’étape pipeline.

### 6) Restaurants / Adresses — hors plan actuel
- Flag `PLANNER_RESTAURANTS_ENABLED` + panel partiellement prêts.
- **Décision (nov 2026) :** ne pas livrer Adresses dans la refonte Path ni juste avant. Pas un prérequis des lots 0–5.

### 7) Favoris / Auth / Profil
- Favoris vols / deals / activités / adresses.
- Auth Google obligatoire pour Planner collab / favoris sync.
- Guest web = gate login ; guest mobile = preview limitée.

### 8) Itineraries « Parcours » (Lot G)
- API save/apply templates d’activités.
- UI **stub** (`/parcours`), flag `ITINERARIES_ENABLED`.
- **Ce n’est pas** encore le skin Path. Naming à clarifier vs pipeline « Ton parcours ».

---

## A5. Modèle data clé (Planner)

| Entité | Rôle |
|---|---|
| `PlannedTrip` | Critères + lifecycle du séjour collab |
| `TripProposal` | Vols proposés par le scan |
| `TripMember` | Orga / voyageurs + invite |
| `TravelWorkspace` | Projection hub (phase, capabilities, pipeline, image) |
| `MyTripDraft` | Exécution vol+hôtel |
| `TripItem` | Ligne jour (activité / hôtel / resto) + notes |
| `HotelBooking` | Réservation LiteAPI |

**Capabilities API :** `can_scan`, `can_choose_flight`, `can_compose_hotel`, `can_view_confirmation` (asymétrie orga/invité).

---

## A6. UX / brand actuelle (important pour le redesign)

- Look **warm peach/orange**, light mode.
- Hub déjà **photo-led** (`JourneyCard`, city heroes).
- Détail séjour encore **opérationnel** : stepper + formulaires + CTAs booking (pas encore magazine immersif).
- Mot « **parcours** » déjà utilisé = stepper Vol→Hôtel→Activités.
- **Pas de** : dark editorial Path, globe, feed marketplace, vente de guides PDF.

**Tailles code indicative (détail Planner lourd) :**
- `PlannerTab.tsx` ~4350 lignes
- `TripDetailScreen.tsx` ~3400 lignes
→ le redesign Path touche surtout cette surface.

---

# PARTIE B — Ambition Path

## B1. Décision produit (figée)

> **Path = la peau du Planner.**  
> Planner = le moteur (scan, book, invite).  
> Path = comment on **voit** et **raconte** le séjour.

Ce n’est **pas** :
- un nouveau produit séparé
- une marketplace de guides
- un clone « Get this Path / PDF / créateurs payants »
- une home globe / map mondiale

## B2. Ambition UX (référence visuelle = capture jointe)

La capture UI jointe montre une app travel premium type **Path** :
- photo full-bleed, typo expressive (serif), glassmorphism
- landing / discovery / **détail immersif**
- dans la ref originale : tabs Overview · Itinerary · Inclusions · Reviews + footer prix guide

**Ce qu’on retient pour FlightWatcher :**
- l’**ambiance** et la structure du **détail séjour**
- **3 onglets seulement :** Aperçu · Programme · Carnet (Path = code interne)
- Flag `TRIP_DETAIL_V2` / `trip_detail_v2_enabled` (rollback sans redeploy)
- sticky CTA = **actions booking Planner** — **jamais** un prix « Get this Path »

**Ce qu’on exclut explicitement :**
- Marketplace / Get this Path
- PDF Guide
- Onglet Inclusions
- Map / globe globale / GPS tracks créateurs
- **Adresses / restos** (pas dans les lots Path pour le moment)

## B3. Articulation Path ↔ Planner

```
[Hub Planner — Tes voyages]
        │
        ▼
[Détail séjour = PAGE PATH]
   ├── Aperçu
   ├── Programme   ← timeline jour par jour
   └── Carnet
        │
        ▼
[CTAs / sheets] ──► mêmes actions Planner qu’aujourd’hui
```

| Couche | Responsabilité |
|---|---|
| **Path (peau)** | Hero, 3 tabs, timeline visuelle, notes, avis, CTA sticky |
| **Planner (moteur)** | Créer, scanner, accepter vol, hôtel, activités, invite, archive |

## B4. Contenu des 3 onglets (mapping data existante)

### Aperçu
- Pitch voyage : destination, dates, party, budget, directs
- Organisateur + membres + partager
- Pastilles Étapes + prochaine action
- Meta + rename / danger zone (archive, delete) côté orga

### Programme
- Timeline narrative : vol → hôtel → jours / activités (pas d’Adresses pour l’instant)
- Bloc À placer + éditeur day_offset / moment / notes
- Stepper pipeline en rail secondaire

### Carnet
- Avis catalogue (hôtel LiteAPI, activités Viator)
- Notes du groupe ; facture PDF hôtel si dispo
- **Pas** de ratings créateurs marketplace

## B5. Ce qui est déjà prêt vs à construire

| Élément | État |
|---|---|
| ~400+ city heroes | Prêt |
| JourneyCard / hub photo | Prêt (à densifier) |
| Pipeline « Ton parcours » | Prêt (à narrativiser) |
| TripItem + notes | Data prête, UI diary à créer |
| Invite / membres / avatar | Prêt |
| Ratings catalogue | Graine Reviews |
| Shell Path 3 tabs | À construire |
| Timeline jour immersive | À construire |
| Marketplace / globe / PDF guide | Hors scope |

## B6. Roadmap ambition (ordre)

0. **Corrections P0** (confiance) — pas de prérequis Adresses  
1. **Logique partagée** + flag `TRIP_DETAIL_V2` + events  
2. **Shell / habillage Path** — hero + Aperçu · Programme · Carnet + sticky CTA  
3. **Programme** — timeline vol · hôtel · activités  
4. **Aperçu + Carnet**  
5. **Hub, noms (Voyages), jetons** → retire flag  

**Hors plan pour le moment :** Adresses / restos (v8), Explorer, marketplace, PDF guide, globe, parcours partagés.

Le funnel conversion (Ryanair → hôtel LiteAPI → invite) **ne change pas**.

## B7. Phrase de cadrage pour le LLM lecteur

Tu analyses une app existante **FlightWatcher** (builder de séjour low-cost FR, web+mobile) dont le **Planner collaboratif** est aujourd’hui utilitaire (stepper + CTAs). L’ambition est de **reskin le détail séjour** avec une UX type Path (voir image jointe) : immersif, Overview / Itinerary / Reviews, sans marketplace ni map globale. Path est uniquement la **peau** ; le moteur Planner et le modèle data restent.

**Questions utiles à poser / trancher ensuite :**
- Comment ranger chaque CTA actuel (scan, skip vol/hôtel, return-ask, modalités, share) dans le shell Path sans perte ?
- Quelle hiérarchie visuelle : Path sur le détail seulement, ou aussi le hub ?
- Comment nommer « parcours » (pipeline) vs futur template itineraries sans confusion ?
- Faut-il un éditeur day_offset/moment/notes dès le lot Itinerary ?

---

# PARTIE C — Inventaire actions Planner (pour ne rien perdre)

### Hub
Filtrer À venir/En cours/Passés · Nouveau séjour · Ouvrir · Promote MyTrip → planner · empty states

### Create
Nom · Solo/Duo/Groupe · Départ/Destination · Budget · Directs · Dates · Créer (+ auto-scan)

### Vol
Scanner · Accepter/Refuser · Empty budget « Mettre {price}€ » · J’ai déjà un vol · Réserver partenaire · Confirmer « Oui c’est réservé » · Modalités + rescanner · Autre vol · Supprimer vol

### Hôtel
Choisir · Payer · Voir · J’ai déjà un hôtel · Maps · Gallery · Changer d’hôtel · Facture PDF

### Activités (flag)
Ajouter · Reorder · Valider · Réserver Viator · Skip « Pas d’activité »

### Party
Partager lien · Ajouter/Retirer membre · Rejoindre via invite · (pas Quitter soi-même)

### Cycle de vie
Renommer · Archiver → past · Supprimer (garde bookings) · Past auto si date dépassée

### Asymétrie
Orga : scan/accept/share/members/archive/delete  
Invité : lecture + book perso vol/hôtel

---

**Fin du brief.**  
Joindre la capture UI Path. Demander au LLM une critique d’articulation Path-peau / Planner-moteur, une proposition d’IA des écrans, et une liste de risques de perte de fonctionnalités.
