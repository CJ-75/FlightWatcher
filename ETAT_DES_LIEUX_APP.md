# FlightWatcher — État des lieux global

_25 oct. 2026 · @Chris_

Audit UI : `http://localhost:5173` · visiteur non connecté · 1280 px + mobile 375 px · réseau + console.

---

## Verdict global

L'app tient debout de bout en bout pour un visiteur non connecté : recherche, composition vol + hôtel, Mon voyage et Deals fonctionnent sans erreur console.

**Note globale : 6,5/10.**

Le produit est riche et cohérent, mais trois choses le retiennent :

1. la qualité des données de vol affichées
2. l'absence de routes (aucune URL par onglet)
3. un mur Deals encore maigre (6 séjours depuis Paris en week-end)

| Surface | Note /10 | Point fort | Point faible principal |
|---|---|---|---|
| Recherche | 6 | 27 résultats trouvés, cartes claires | Escales et prix par trajet douteux |
| Wizard vol + hôtel | 8 | 3 étapes nettes, hôtels chargés vite | Prix hôtel solo très élevé sans explication |
| Mon voyage | 5 | Brouillon sans compte, email, mention deux réservations | Aucun détail vol/hôtel, plus de navigation |
| Deals (mur) | 6,5 | Titres générés, prix décomposé, occasions | Week-end ≠ week-end, compteurs faux, « Nouveau » partout |
| Fiche séjour | 7,5 | « Pourquoi on valide », décomposition, autres dates | Codes bruts (FR, RO, BI), mot « pack », 5 boutons |
| Planner | 4 | Promesse claire en 3 étapes | Mur Google avant tout essai |
| Alertes | 3,5 | Promesse claire | Contenu coupé à gauche, relance 15 min |
| Favoris | 4 | Promesse claire | Contenu coupé à gauche, mur de connexion |
| Mobile web | 5,5 | Tout est accessible | Une carte/écran, logo et onglet tronqués |

---

## Parcours testés

| Parcours | Résultat | Durée |
|---|---|---|
| Recherche Paris, week-end (30 oct → 1er nov), 100 € | « Pas de résultats » + suggestion budget | ~5 s |
| Même recherche 250 € → Milan → hôtel → Mon voyage | Abouti : brouillon 456 € / pers. | ~15 s + 6 s hôtels |
| Deals → « Coup de cœur hôtel » → fiche Milan | Abouti : fiche complète | < 3 s |
| Planner, Alertes, Favoris (visiteur) | Présentation → « Continuer avec Google » seul | — |

### À garder

- Wizard 3 étapes : une question/écran, hôtels photo+note, « Voyage enregistré »
- Transparence prix Deals : « 2 nuits · vol 68 € + hôtel 218 € » + décomposition fiche
- Titres générés (« Milan en 3★, noté 9.2, vol direct »)
- Bloc « Pourquoi on valide ce plan » + ligne bagages
- Mention légale : deux réservations distinctes
- Section « Depuis d'autres aéroports »
- Aucune erreur console

---

## P0 — problèmes bloquants

| # | Problème | Preuve | Impact |
|---|---|---|---|
| 1 | Données de vol incohérentes | « Transavia · 3 ESCALES » ORY→VCE/BCN ; « Ryanair · 1 ESCALE » ; code « MW » | Plus aucune confiance |
| 2 | Prix aller/retour inventés | 20/27 avec moitiés identiques (72/72) alors que source = total | Prix faux affichés comme réels |
| 3 | Onglet Week-end ≠ week-end | Cracovie / Lisbonne mar→jeu dans Week-end | Promesse fausse |
| 4 | Compteurs occasions faux | « Coup de cœur · 4 » → « 1 offre » ; « Hors vacances · 11 » sur mur de 6 | Chip peu crédible |
| 5 | Aucune route par onglet | URL reste `/` ; `/deals` → Recherche ; 0 `<a>` | Pas de partage, deep link, SEO, retour |
| 6 | Contenu coupé Alertes / Favoris | Logo/titre à −8 px (« lightWatcher ») | Effet cassé sur 2/5 onglets |
| 7 | Mon voyage sans détail | Pas horaires/aéroport/compagnie/photo hôtel ; Aviasales pour vol Ryanair | Réserve à l’aveugle |

---

## Analyse écran par écran

### Accueil et Recherche

- Accueil = formulaire seul, pas de promesse ni aperçu deals
- Titre navigateur : « Scanner de vols Ryanair » (dépassé + marque tierce)
- Départ vide (placeholder Paris) ; bouton désactivé sans explication
- « Paris » inclut Vatry (XCR, ~150 km)
- Horaires techniques « 06:00 → 23:59 » sans réglage fait
- Résultats répètent la recherche (« Modifier » + « Dernière recherche »)
- Boutons violet hors palette orange
- Tri prix seul (ignore « temps sur place »)
- Pas de ligne bagages ni aéroport secondaire sur les cartes

### Wizard vol + hôtel

- Étape 1 claire ; étape 2 : 5 hôtels Milan 299–425 €/pers. ; total 456 € vs budget 250 € sans avertissement
- Note et étoiles même icône (« ★ 8.3 · 4★ »)
- Ordre « note/prix » peu lisible ; étape 3 : 4 boutons dont nom hôtel sur 2 lignes

### Mon voyage

- Nav disparait (seul ← Retour)
- « dès 456 € » pour un voyage déjà composé
- Pas d’horaires, aéroport, compagnie, bagages ; hôtel sans photo/prix/note
- « J'ai réservé mon vol ✓ » annoncé mais invisible avant clic partenaire

### Deals — mur

- Structure OK (durée, occasions, Affiner, tri)
- 6 occasions permanentes ; pas de saisonnier (Noël, Nouvel An) ; « Sans poser de congé » absent
- « Max de temps sur place » = tri présenté comme occasion
- Tuiles ~100 px → deals sous la ligne de flottaison
- Badge « Nouveau » partout ; badge occasion jamais visible
- Horaires sans aller/retour ; Bergame non dit sur la carte ; gros CTA orange vs prix orange

### Deals — fiche

- Très complète ; codes FR / RO / BI ; « Prix du pack » (mot écarté juridiquement)
- Galerie : toilettes en 2e ; rectangle gris avant load ; 5 boutons ; Échap ne ferme pas

### Planner, Alertes, Favoris

- Mur Google seul (pas d’essai guest, pas d’email)
- Alertes « toutes les 15 min » incompatible budget API Ryanair
- Jargon « Toast + lightbox » ; deux systèmes d’alertes sans lien visible

### Mobile web (375 px)

- Logo « FlightWatc… », onglet « Rech… »
- Nav en haut (standard apps = bas)
- Deals : titre + durée + tuiles + Affiner = 1er écran sans photo
- Une carte ≈ hauteur écran

---

## Technique / SEO / a11y / légal

| Domaine | Constat | Conséquence |
|---|---|---|
| Doublons API | `/api/config` ×3, `/api/airports` ×4 par load + à chaque onglet | Charge inutile |
| Recherche | ~15 s, 8 req fournisseurs, 1 message vague | Abandon |
| Routes | Une URL `/` ; `/deals` → Recherche | Pas de deep link |
| Liens | 0 `<a>` | Pas d’indexation / nouvel onglet |
| SEO | Pas de meta description ; titre Ryanair ; pas de footer | Invisible moteurs |
| A11y | Onglets sans nom accessible ; Échap | Clavier / lecteur difficile |
| État | Budget → 100 €, départ vidé au reload | Ressaisie |
| Légal | Pas de mentions / CGU / CGV / confidentialité hors fiche | Non conforme emails + résa hôtel |

**Non testé :** connecté, paiement hôtel sandbox, admin au-delà login, app native.

---

## Plan d'action

### P0 — confiance et promesse

- [ ] Recherche : prix total seul si source sans split aller/retour
- [ ] Recherche : masquer/recalculer escales incohérentes ; nom compagnie (pas code)
- [ ] Deals : Week-end = départ ven/sam/dim uniquement
- [ ] Occasions : compteurs avec filtres courants ; filtre SQL
- [ ] Routes : `/recherche`, `/deals`, `/deals?occasion=…`, `/planner`, `/alertes`, `/favoris` + vrais `<a>`
- [ ] Corriger décalage −8 px Alertes / Favoris
- [ ] Mon voyage : horaires, aéroports (secondaire), compagnie, bagages, photo+prix hôtel, nav, partenaire correct

### P1 — clarté et conversion

- [ ] Accueil : promesse + 3–6 deals au-dessus du formulaire
- [ ] Seed occasions saisonnières (Noël, Nouvel An)
- [ ] Badge occasion (pas « Nouveau ») ; « Max temps sur place » → tri
- [ ] Cartes : aéroport secondaire, horaires aller/retour, CTA discret
- [ ] Fiche : mots au lieu de FR/RO/BI, retirer « pack », galerie, Échap, actions regroupées
- [ ] Wizard : alerte dépassement budget ; séparer note / étoiles
- [ ] Planner : essai sans compte + email
- [ ] Alertes : fréquence ≥ 6 h, sans jargon, regroupement Deals
- [ ] Mobile : tabs bas, chips compactes, cartes plus courtes
- [ ] Dedup `/api/config` et `/api/airports`

### P2 — croissance

- [ ] Pages indexables occasion/origine, meta, titre sans marque tierce
- [ ] Footer légal
- [ ] Mémoriser dernière recherche
- [ ] Progression recherches longues
- [ ] Noms accessibles + test clavier

---

## Annexe — tests techniques (session agent)

| Suite | Résultat |
|---|---|
| Unit occasions + vente + alerts + materialize | **48 passed** |
| `pytest deals providers test_booking_sas` (`--capture=no`) | **exit 0** · ~218 passed · 1 skipped |
| `GET /api/config` | 200 · sandbox · community |
| `GET /api/deals/occasions` | 200 · 6 chips main |
| `GET /api/deals?limit=12` | 200 · 11 deals taggés |
| `GET /api/airports` | 200 · 663 |
| Booking SAS write/read | OK |

Note Windows : pytest sans `--capture=no` peut crasher en teardown (`I/O on closed file`) alors que les tests ont passé.
