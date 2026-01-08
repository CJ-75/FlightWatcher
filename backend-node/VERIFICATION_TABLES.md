# Vérification des Tables Supabase

## Tables utilisées dans le backend Node.js

### ✅ 1. `user_profiles`
**Endpoints utilisant cette table :**
- `GET /api/supabase/status` (ligne 361) - Test de connexion
- `GET /api/auth/me` (ligne 625) - Récupération du profil utilisateur

**Champs utilisés :**
- `id` - UUID (clé primaire)
- Tous les champs via `select('*')`

**Vérification schéma :** ✅ Correspond
- Table existe dans `supabase_schema_v2.sql` ligne 10
- Colonnes : `id`, `created_at`, `last_active`, `home_airport`, `referral_code`, `referred_by`, `migration_completed`

---

### ✅ 2. `saved_searches`
**Endpoints utilisant cette table :**
- `GET /api/supabase/searches` (ligne 403) - Liste des recherches
- `POST /api/supabase/searches` (ligne 437) - Créer une recherche
- `DELETE /api/supabase/searches/:id` (ligne 481) - Supprimer une recherche

**Champs utilisés dans INSERT (ligne 438-448) :**
- `user_id` ✅
- `name` ✅
- `departure_airport` ✅
- `dates_depart` ✅ (JSONB)
- `dates_retour` ✅ (JSONB)
- `budget_max` ✅
- `limite_allers` ✅
- `destinations_exclues` ✅ (JSONB)
- `destinations_incluses` ✅ (JSONB)

**Vérification schéma :** ✅ Correspond
- Table existe dans `supabase_schema_v2.sql` ligne 27
- Tous les champs utilisés existent dans le schéma

**Champs manquants (non critiques) :**
- `auto_check_enabled` - Non utilisé (défaut FALSE)
- `check_interval_seconds` - Non utilisé (défaut 3600)
- `last_checked_at` - Non utilisé
- `last_check_results` - Non utilisé
- `times_used` - Non utilisé (défaut 0)
- `last_used` - Non utilisé

---

### ✅ 3. `favorites`
**Endpoints utilisant cette table :**
- `GET /api/supabase/favorites` (ligne 514) - Liste des favoris
- `POST /api/supabase/favorites` (ligne 548) - Créer un favori
- `DELETE /api/supabase/favorites/:id` (ligne 592) - Supprimer un favori

**Champs utilisés dans INSERT (ligne 549-559) :**
- `user_id` ✅
- `destination_code` ✅
- `destination_name` ✅
- `outbound_date` ✅
- `return_date` ✅
- `total_price` ✅
- `outbound_flight` ✅ (JSONB)
- `return_flight` ✅ (JSONB)
- `search_request` ✅ (JSONB)

**Vérification schéma :** ✅ Correspond
- Table existe dans `supabase_schema_v2.sql` ligne 65
- Tous les champs utilisés existent dans le schéma

**Champs manquants (non critiques) :**
- `search_id` - Non utilisé (optionnel, peut être NULL)
- `is_archived` - Non utilisé (défaut FALSE)
- `is_available` - Non utilisé (défaut TRUE)
- `last_availability_check` - Non utilisé
- `booking_url` - Non utilisé
- `booked` - Non utilisé (défaut FALSE)

---

### ✅ 4. `search_results_cache`
**Endpoints utilisant cette table :**
- `POST /api/scan` (ligne 231, 279) - Cache des résultats de scan

**Champs utilisés dans SELECT (ligne 232-234) :**
- `results` ✅
- `expires_at` ✅
- `cache_key` ✅ (pour la recherche)

**Champs utilisés dans UPSERT (ligne 280-288) :**
- `cache_key` ✅
- `departure_airport` ✅
- `budget_max` ✅
- `dates_depart` ✅ (JSONB)
- `dates_retour` ✅ (JSONB)
- `results` ✅ (JSONB)
- `expires_at` ✅

**Vérification schéma :** ✅ Correspond
- Table existe dans `supabase_schema_v2.sql` ligne 154
- Tous les champs utilisés existent dans le schéma

**Champs manquants (non critiques) :**
- `id` - Généré automatiquement
- `created_at` - Généré automatiquement (DEFAULT NOW())
- `hit_count` - Non mis à jour (défaut 0)
- `last_hit_at` - Non mis à jour

---

## ⚠️ Table non utilisée dans le backend Node.js

### `price_history`
**Statut :** Table existe dans le schéma mais n'est pas utilisée dans le backend Node.js

**Raison :** Cette table était utilisée dans le backend Python pour enregistrer l'historique des prix. Le backend Node.js actuel ne l'utilise pas encore.

**Recommandation :** Si vous souhaitez enregistrer l'historique des prix, ajoutez cette fonctionnalité dans `server.js` après le scan des vols.

---

## Résumé

✅ **Toutes les tables utilisées existent dans le schéma**
✅ **Tous les champs utilisés existent dans les tables**
✅ **Les types de données correspondent (JSONB, TEXT, INTEGER, etc.)**

### Améliorations possibles :
1. Mettre à jour `hit_count` et `last_hit_at` dans `search_results_cache` lors de la récupération du cache
2. Utiliser `last_used` dans `saved_searches` lors de la récupération
3. Implémenter l'enregistrement dans `price_history` après les scans

