# Restaurants / Tes adresses — lots A–H

## Appliquer d’abord
1. SQL manuel : `apply_restaurants_lot_a_migration.sql` (Supabase SQL editor)
2. Flags backend `.env` : `PLANNER_RESTAURANTS_ENABLED=true`, `LINK_IMPORT_ENABLED=true`
3. Optionnel : `GEOAPIFY_API_KEY` pour reconnaissance enrichie
4. Redémarrer le backend

## Fait (web + mobile)
- **A** Schéma places / details / user_places / link_imports / reports + RLS
- **B** Parsing Maps / IG / TT + resolve court anti-SSRF
- **C** Upsert place + Geoapify on-demand + lieu personnel
- **D** Chips ouverture (`evaluateOpening`)
- **E** Étape ④ pipeline — web `MyTrip` + Expo `TripSummaryScreen`
- **F** Import multi-liens (création voyage optionnelle + collage ③④)
- **G** Empty states ④, Maps hôtel, signalement ; Favoris **Mes adresses** (web + Expo)
- **H** J-7 restos ; metrics admin ; itineraries place-backed

## UX (parité)
| Surface | Web | Expo |
|---|---|---|
| Étape ④ Adresses | MyTrip section + stepper | TripSummary card |
| Coller liens | LinkImportPanel | Import inline |
| Favoris Mes adresses | Onglet dédié | Onglet dédié |
| CTA depuis Activités | Lien → `?restaurants=1` | → TripSummary / Favoris |
| Création voyage | Paste optionnel → session → ④ | — |

## Tester
1. Migration SQL + flags + restart
2. Mon voyage → **④ Adresses** → coller lien Maps → Oui, ajouter
3. Favoris → Mes adresses
4. Activités → « Ajoute tes adresses »
5. Expo : même parcours TripSummary + Favoris

## Suite (hors scope immédiat)
- Place ID Google Essentials + LLM Haiku (flags off)
- Share Intent Expo cold start
- Contenu « À goûter ici » par ville
- Captures §8.7
- Partage parcours users (§10)
