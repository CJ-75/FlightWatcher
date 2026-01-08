# Debug - Chargement des données

## Problème
Les champs ne se chargent pas avec les données sur http://localhost:3000/

## Vérifications effectuées

### 1. Chargement depuis localStorage/Supabase
- ✅ Le Dashboard charge les données via `getSavedSearches()`
- ✅ Les données sont mises à jour dans les états (datesDepart, datesRetour, etc.)
- ✅ Des logs de débogage ont été ajoutés pour tracer le chargement

### 2. Passage des données à SimpleSearch
- ✅ Les props `flexibleDates` sont passées correctement
- ✅ Le composant SimpleSearch reçoit les dates

### 3. Affichage dans FlexibleDatesSelector
- ✅ Le composant affiche les dates si `flexibleDates.dates_depart.length > 0`
- ⚠️ **PROBLÈME** : Le preset "flexible" doit être sélectionné pour voir les dates

## Solution appliquée

1. **Sélection automatique du preset "flexible"** si des dates sont chargées
2. **Logs de débogage** ajoutés pour tracer le chargement
3. **Synchronisation améliorée** entre le chargement et l'affichage

## Comment vérifier

1. Ouvrez la console du navigateur (F12)
2. Rechargez la page http://localhost:3000/
3. Vérifiez les logs :
   - `📥 Recherches chargées: X`
   - `📋 Dernière recherche: {...}`
   - `✅ Chargement des données: {...}`
   - `📅 Dates chargées détectées, sélection automatique du preset flexible`

4. Vérifiez que :
   - Le preset "flexible" est automatiquement sélectionné
   - Les dates apparaissent dans la section "📅 Choisissez vos dates"
   - L'aéroport est pré-rempli

## Si les données ne s'affichent toujours pas

1. Vérifiez que le backend Node.js est démarré (http://localhost:8000)
2. Vérifiez la console pour les erreurs
3. Vérifiez que localStorage contient des données :
   ```javascript
   localStorage.getItem('flightwatcher_saved_searches')
   ```
4. Vérifiez que Supabase est configuré si vous êtes connecté

