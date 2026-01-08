# Migration Supabase - Guide de déploiement

## ✅ Implémentation terminée

Tous les composants de la migration Supabase avec authentification ont été implémentés.

## 📋 Fichiers créés

### Backend
- `backend/auth_middleware.py` - Middleware d'authentification JWT
- `backend/price_tracker.py` - Tracking des prix historiques
- `supabase_schema_v2.sql` - Schéma complet avec 5 tables + RLS

### Frontend
- `frontend/src/lib/supabase.ts` - Client Supabase avec auth
- `frontend/src/components/Auth.tsx` - Composant authentification Google OAuth
- `frontend/src/components/UserProfile.tsx` - Gestion profil utilisateur
- `frontend/src/utils/migration.ts` - Migration automatique localStorage → Supabase
- `frontend/src/auth/callback.tsx` - Callback OAuth (optionnel)

## 📝 Fichiers modifiés

### Backend
- `backend/main.py` - Ajout auth middleware, endpoints user, price tracking, cache
- `backend/supabase_client.py` - Ajout service_role client
- `backend/requirements.txt` - Ajout PyJWT

### Frontend
- `frontend/src/utils/storage.ts` - Migration vers Supabase avec fallback localStorage
- `frontend/src/App.tsx` - Intégration Auth et migration automatique

## 🚀 Étapes de déploiement

### 1. Configuration Supabase

1. Créer un projet sur [Supabase](https://app.supabase.com)
2. Exécuter le script `supabase_schema_v2.sql` dans l'éditeur SQL
3. Activer Google OAuth dans Authentication → Providers
4. Configurer les redirect URLs :
   - `http://localhost:5173/auth/callback` (dev)
   - `https://votre-domaine.com/auth/callback` (prod)

### 2. Configuration Backend

Créer `backend/.env` :
```env
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre-clé-anon
SUPABASE_SERVICE_ROLE_KEY=votre-clé-service-role  # Pour price_history et cache
```

### 3. Configuration Frontend

Créer `frontend/.env` :
```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-clé-anon
```

### 4. Installation dépendances

```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

## 🔐 Sécurité

- **RLS activé** : Les users ne voient que leurs données
- **Service role** : Utilisé uniquement backend pour price_history et cache
- **JWT validation** : Tokens validés côté backend
- **Fallback localStorage** : Si pas connecté, continue avec localStorage

## 📊 Fonctionnalités

### Authentification
- ✅ Login/logout Google OAuth
- ✅ Migration automatique localStorage → Supabase au premier login
- ✅ Gestion de session persistante

### Données utilisateur
- ✅ Recherches sauvegardées avec user_id
- ✅ Favoris avec user_id
- ✅ Profil utilisateur (home_airport, referral_code)

### Analytics
- ✅ Tracking prix historique (price_history)
- ✅ Cache des résultats de recherche (1h expiration)
- ✅ Fonction SQL pour moyenne prix 30 jours

## 🧪 Tests

1. **Test authentification** :
   - Cliquer sur "Se connecter avec Google"
   - Vérifier redirection et retour
   - Vérifier migration automatique

2. **Test données** :
   - Créer une recherche → Vérifier dans Supabase
   - Ajouter un favori → Vérifier dans Supabase
   - Vérifier RLS (un user ne voit pas les données d'un autre)

3. **Test cache** :
   - Faire 2 recherches identiques rapidement
   - La 2ème doit venir du cache (nombre_requetes = 0)

4. **Test price_history** :
   - Faire un scan
   - Vérifier dans Supabase table price_history

## ⚠️ Notes importantes

1. **Migration** : Les données localStorage existantes sont migrées automatiquement au premier login
2. **Fallback** : L'app fonctionne toujours sans Supabase (localStorage)
3. **Service role** : Ne jamais exposer SUPABASE_SERVICE_ROLE_KEY au frontend
4. **RLS** : Les politiques garantissent l'isolation des données utilisateurs

## 🐛 Dépannage

### Erreur "Supabase n'est pas configuré"
- Vérifier les variables d'environnement dans `.env`
- Redémarrer le serveur backend

### Erreur OAuth
- Vérifier les redirect URLs dans Supabase Dashboard
- Vérifier que Google OAuth est activé

### Migration ne fonctionne pas
- Vérifier les logs dans la console navigateur
- Vérifier que le flag `migration_completed` n'est pas déjà à true

### Price history ne s'enregistre pas
- Vérifier que SUPABASE_SERVICE_ROLE_KEY est configurée
- Vérifier les logs backend pour erreurs

