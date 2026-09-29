# Parité web / mobile

## Livré (MVP mobile)

- Auth Google + deep link `flightwatcher://auth/callback` (+ mode invité)
- UI alignée sur le web : primary `#FF6B35`, fond blanc, cartes arrondies, DestinationCard
- Recherche inspire (presets weekend) + budget
- Résultats + ouverture booking Ryanair
- Favoris (API Supabase)
- Profil / déconnexion
- Package `@flightwatcher/shared` partagé web/mobile

## À aligner ensuite (Phase 5+)

1. Presets dates complets + dates flexibles (comme SimpleSearch web)
2. Mode roulette
3. Auto-check recherches sauvegardées
4. Push notifications (Expo Notifications) pour alertes prix — **après** parité scan/favoris

## Config device

Sur téléphone physique, `EXPO_PUBLIC_API_URL` doit pointer vers l’IP LAN du PC (pas `localhost`).
