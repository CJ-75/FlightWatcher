# Parité web / mobile

## Livré — recherche & résultats

- Auth Google + deep link `flightwatcher://auth/callback` (+ mode invité)
- UI brand `#FF6B35`, Sora, cartes DestinationCard
- **Recherche inspire complète**
  - Budget 20–1000€
  - Airport picker (recherche + populaires)
  - Presets : weekend / next-weekend / next-week / **flexible**
  - Horaires par jour (Nuit / Matin / Après-midi / Soir / Journée)
  - Dates flexibles (sélection multi-jours)
  - Exclusion de destinations (par pays)
  - Validation aéroport + loading messages
  - Analytics `trackSearchEvent` (`source: mobile`)
- **Résultats complets**
  - Résumé de recherche
  - Sauvegarder la recherche
  - Mode roulette + partage
  - Favoris toggle (ajout / retrait)
  - Booking SAS (compte à rebours + deep link Ryanair + analytics)
  - Badge discount > 20% + bon deal

## À aligner ensuite

1. Onglet recherches sauvegardées (charger / re-scan / auto-check)
2. Push notifications (Expo Notifications)

## Config device

Sur téléphone physique, `EXPO_PUBLIC_API_URL` doit pointer vers l’IP LAN du PC (pas `localhost`).
