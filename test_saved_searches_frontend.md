# Test de saved_searches depuis le navigateur

## Instructions pour tester

1. **Ouvrir la console du navigateur** (F12)

2. **Tester la sauvegarde d'une recherche** :
   ```javascript
   // Dans la console du navigateur
   // 1. Lancer une recherche depuis l'interface
   // 2. Cliquer sur "💾 Sauvegarder"
   // 3. Entrer un nom et sauvegarder
   // 4. Vérifier les logs dans la console
   ```

3. **Vérifier les logs attendus** :
   - `💾 saveSearch appelé:` avec les détails de l'utilisateur
   - `📤 Insertion dans Supabase saved_searches:` avec les données
   - `✅ Recherche insérée avec succès:` avec l'ID

4. **Tester la récupération** :
   ```javascript
   // Dans la console du navigateur
   // Aller dans l'onglet "❤️ Sauvegardés"
   // Vérifier les logs :
   // - 📥 getSavedSearches appelé:
   // - 🔍 Requête Supabase saved_searches pour user_id:
   // - ✅ Données récupérées depuis Supabase saved_searches:
   // - 🔄 Mapping des données récupérées...
   // - ✅ Mapping terminé:
   ```

5. **Vérifier les erreurs possibles** :
   - Si vous voyez `❌ Erreur insertion Supabase saved_searches:` → Problème de permissions RLS ou de structure
   - Si vous voyez `⚠️ Aucune donnée récupérée depuis Supabase saved_searches` → Vérifier que les données existent dans la DB
   - Si vous voyez `📦 Données trouvées dans localStorage` → Les données sont dans localStorage mais pas dans Supabase

## Tests manuels à effectuer

### Test 1 : Sauvegarder une recherche
1. Se connecter avec Google
2. Lancer une recherche
3. Cliquer sur "💾 Sauvegarder" (dans les résultats ou sous le formulaire)
4. Entrer un nom (ex: "Test recherche")
5. Vérifier qu'un message de succès apparaît
6. Vérifier les logs dans la console

### Test 2 : Voir les recherches sauvegardées
1. Aller dans l'onglet "❤️ Sauvegardés"
2. Vérifier que la recherche sauvegardée apparaît
3. Vérifier les logs dans la console

### Test 3 : Charger une recherche
1. Dans l'onglet "❤️ Sauvegardés"
2. Cliquer sur "📂 Charger" sur une recherche
3. Vérifier que les paramètres sont remplis dans le formulaire

### Test 4 : Relancer une recherche
1. Dans l'onglet "❤️ Sauvegardés"
2. Cliquer sur "🔄 Relancer" sur une recherche
3. Vérifier que la recherche se lance avec les bons paramètres

### Test 5 : Supprimer une recherche
1. Dans l'onglet "❤️ Sauvegardés"
2. Cliquer sur "🗑️" sur une recherche
3. Vérifier que la recherche disparaît de la liste

## Vérifications dans Supabase

Après avoir exécuté `test_saved_searches.sql`, vérifier :

1. **Structure de la table** :
   - Colonne `departure_airport` existe (pas `aeroport_depart`)
   - Colonne `check_interval_seconds` existe (pas `auto_check_interval_seconds`)
   - Colonne `times_used` existe
   - Colonne `user_id` est NOT NULL

2. **Politiques RLS** :
   - 4 politiques existent (SELECT, INSERT, UPDATE, DELETE)
   - Toutes utilisent `auth.uid() = user_id`

3. **Données** :
   - Les recherches sauvegardées depuis le frontend apparaissent dans la table
   - Chaque recherche a un `user_id` non NULL
   - Les données sont correctement formatées (JSONB pour dates_depart, dates_retour, etc.)

