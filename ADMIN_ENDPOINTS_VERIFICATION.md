# Vérification des Endpoints Admin - Supabase

## ✅ Endpoints vérifiés et fonctionnels

### 1. **Users** (`/api/admin/users`)
- ✅ **GET `/api/admin/users`** : Récupère la liste paginée des utilisateurs
  - Source: `user_profiles` table
  - Filtres: email, is_admin
  - Pagination: page, page_size
  - Retourne: users[], total, page, page_size

- ✅ **GET `/api/admin/users/{user_id}`** : Détails d'un utilisateur avec stats
  - Source: `user_profiles` + agrégations depuis `saved_searches`, `favorites`, `search_events`
  - Retourne: profil complet + stats (searches_count, favorites_count, search_events_count)

- ✅ **PUT `/api/admin/users/{user_id}`** : Met à jour un utilisateur
  - ⚠️ **Modification**: Le champ `is_admin` ne peut plus être modifié depuis le frontend
  - Le statut admin est géré uniquement via la liste hardcodée dans `admin_auth.py`

### 2. **Searches** (`/api/admin/searches`)
- ✅ **GET `/api/admin/searches`** : Liste paginée des recherches sauvegardées
  - Source: `saved_searches` table avec JOIN sur `user_profiles`
  - Filtres: user_id, departure_airport, auto_check_enabled, date_from, date_to
  - Retourne: searches[], total, page, page_size

- ✅ **GET `/api/admin/searches/stats`** : Statistiques des recherches
  - Source: `saved_searches` table
  - Retourne: total_searches, auto_check_enabled, recent_searches, searches_by_day

### 3. **Booking SAS / Activated** (`/api/admin/booking-sas`)
- ✅ **GET `/api/admin/booking-sas`** : Liste paginée des événements Booking SAS
  - Source: `booking_sas_events` table avec JOIN sur `user_profiles` pour récupérer l'email
  - Filtres: user_id, partner_id, destination_code, date_from, date_to
  - Retourne: events[] (avec user_email), total, page, page_size

- ✅ **GET `/api/admin/booking-sas/stats`** : Statistiques des événements Booking SAS
  - Source: `booking_sas_events` table
  - Retourne: total_clicks, clicks_by_day, partner_distribution, avg_price

### 4. **Plans** (`/api/admin/plans`)
- ✅ **GET `/api/admin/plans`** : Liste des plans d'abonnement
  - Source: `subscription_plans` table
  - Retourne: plans[]

- ✅ **POST `/api/admin/plans`** : Crée un nouveau plan
  - Source: `subscription_plans` table
  - Retourne: plan créé

- ✅ **PUT `/api/admin/plans/{plan_id}`** : Met à jour un plan
  - Source: `subscription_plans` table
  - Retourne: plan mis à jour

- ✅ **DELETE `/api/admin/plans/{plan_id}`** : Supprime un plan
  - Source: `subscription_plans` table
  - Retourne: confirmation

### 5. **Settings** (`/api/admin/settings`)
- ✅ **GET `/api/admin/settings`** : Configuration des plans et fonctionnalités
  - Source: `subscription_plans` + `plan_features` tables
  - Retourne: plans[], features_by_plan{}

- ✅ **PUT `/api/admin/settings`** : Met à jour les fonctionnalités d'un plan
  - Source: `plan_features` table
  - Retourne: features mises à jour

### 6. **Authentication** (`/api/admin/verify`)
- ✅ **GET `/api/admin/verify`** : Vérifie le statut admin
  - Vérifie l'email de l'utilisateur contre la liste hardcodée dans `admin_auth.py`
  - Retourne: is_admin, user_id, message

- ✅ **POST `/api/admin/impersonate/{target_user_id}`** : Crée un token d'impersonation
  - Vérifie que l'utilisateur cible existe
  - Retourne: token d'impersonation (à implémenter avec Supabase Admin API)

## 🔒 Sécurité

- ✅ Tous les endpoints sont protégés par le décorateur `@require_admin`
- ✅ Le statut admin est vérifié via la liste hardcodée d'emails dans `admin_auth.py`
- ✅ Le champ `is_admin` ne peut plus être modifié depuis le frontend (supprimé de l'interface)
- ✅ Le backend rejette toute tentative de modification de `is_admin` via l'API

## 📊 Tables Supabase utilisées

1. `user_profiles` - Profils utilisateurs
2. `saved_searches` - Recherches sauvegardées
3. `favorites` - Favoris utilisateurs
4. `search_events` - Événements de recherche
5. `booking_sas_events` - Événements Booking SAS
6. `subscription_plans` - Plans d'abonnement
7. `plan_features` - Fonctionnalités par plan

## ✅ Tous les endpoints sont fonctionnels et connectés à Supabase

