# Panneau d'Administration FlightWatcher

## Installation

### 1. Migrations de base de données

Exécutez les migrations SQL suivantes dans Supabase :

```bash
# 1. Ajouter le champ is_admin
psql -f migrations/add_admin_field.sql

# 2. Créer la table subscription_plans
psql -f migrations/create_subscription_plans.sql

# 3. Créer la table plan_features
psql -f migrations/create_plan_features.sql
```

### 2. Configurer les emails administrateurs et le mot de passe

Les administrateurs sont définis par leur email et un mot de passe admin. Configuration via variables d'environnement :

**Ajoutez dans `backend/.env` :**

```env
# Emails des administrateurs (séparés par des virgules)
ADMIN_EMAILS=votre-email@gmail.com,autre-admin@example.com

# Hash bcrypt du mot de passe admin (OBLIGATOIRE pour la sécurité)
ADMIN_PASSWORD_HASH=$2a$12$RxGnFWsPFJsrspELGy5X1.pIVbSxqBf2Z86v43bFbjFyCh4AI8dg.
```

**Générer un nouveau hash de mot de passe :**

```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'votre_mot_de_passe', bcrypt.gensalt(rounds=12)).decode())"
```

**Méthode alternative : Code source (non recommandé pour la production)**

Vous pouvez aussi modifier `backend/admin_auth.py` directement, mais c'est moins sécurisé :

```python
ADMIN_EMAILS = [
    "votre-email@gmail.com",
    "autre-admin@example.com",
]
```

**Note** : 
- Les emails doivent correspondre exactement à ceux utilisés pour la connexion Google OAuth
- Le hash du mot de passe doit être stocké dans `.env` et ne JAMAIS être commité dans Git
- Ajoutez `.env` à votre `.gitignore` pour éviter de commiter les secrets

### 3. Installer les dépendances frontend

```bash
cd frontend
npm install
```

Les dépendances suivantes seront installées :
- `recharts` : Graphiques interactifs
- `date-fns` : Manipulation de dates
- `react-hot-toast` : Notifications toast

## Accès au panneau admin

1. Accédez à `/admin/login`
2. Cliquez sur "Se connecter avec Google"
3. Connectez-vous avec votre compte Google (l'email doit être dans la liste des admins)
4. **Saisissez le mot de passe admin** dans la modal qui apparaît
5. Vous serez redirigé vers `/admin/users` si vous êtes admin
6. Si votre email n'est pas dans la liste ou le mot de passe est incorrect, vous verrez un message d'erreur

**Double authentification** : Email Google OAuth + Mot de passe admin hardcodé (hash bcrypt)

## Pages disponibles

### 1. Users (`/admin/users`)
- Liste de tous les utilisateurs avec pagination
- Statistiques : total, actifs, nouveaux, admins
- Graphiques : évolution inscriptions, répartition par aéroport
- Actions :
  - **Log as** : Impersonation d'un utilisateur
  - **Ajouter/Retirer admin** : Gérer les droits admin

### 2. Searches (`/admin/searches`)
- Liste de toutes les recherches sauvegardées
- Statistiques : total, avec auto-check, utilisées récemment
- Graphiques : volume par jour, répartition par aéroport
- Filtres : utilisateur, aéroport, date, auto-check

### 3. Activated (`/admin/activated`)
- Analytics des événements Booking SAS
- Statistiques : total clics, prix moyen, taux de conversion
- Graphiques : clics par jour, répartition par partenaire
- Filtres : partenaire, destination, date, utilisateur

### 4. Plans (`/admin/plans`)
- Gestion des plans d'abonnement (structure prête pour Stripe)
- Créer/Modifier/Supprimer des plans
- Activer/Désactiver des plans
- Graphique : répartition des plans

### 5. Settings (`/admin/settings`)
- Configuration des limites et fonctionnalités par plan
- Fonctionnalités configurables :
  - Auto-check activé
  - Notifications email
  - Export données
  - API access
  - Support prioritaire

## Fonctionnalités

### Impersonation (Log As)

1. Cliquez sur "Log as" pour un utilisateur
2. Confirmez l'action
3. Vous serez redirigé vers l'application principale avec le compte de l'utilisateur
4. Une bannière jaune indique le mode impersonation
5. Cliquez sur "Retour admin" pour revenir à votre compte admin

**Note** : L'impersonation complète nécessite l'implémentation avec Supabase Admin API. Actuellement, la structure est prête mais nécessite une configuration supplémentaire.

### API Endpoints

Tous les endpoints admin sont préfixés `/api/admin/*` et nécessitent :
- Authentification (token JWT)
- Statut admin (`is_admin = true`)

Endpoints disponibles :
- `GET /api/admin/verify` - Vérifier statut admin
- `POST /api/admin/impersonate/{user_id}` - Créer token impersonation
- `GET /api/admin/users` - Liste utilisateurs
- `GET /api/admin/users/{user_id}` - Détails utilisateur
- `PUT /api/admin/users/{user_id}` - Modifier utilisateur
- `GET /api/admin/searches` - Liste recherches
- `GET /api/admin/searches/stats` - Statistiques recherches
- `GET /api/admin/booking-sas` - Liste événements SAS
- `GET /api/admin/booking-sas/stats` - Statistiques SAS
- `GET /api/admin/plans` - Liste plans
- `POST /api/admin/plans` - Créer plan
- `PUT /api/admin/plans/{plan_id}` - Modifier plan
- `DELETE /api/admin/plans/{plan_id}` - Supprimer plan
- `GET /api/admin/settings` - Configuration
- `PUT /api/admin/settings` - Mettre à jour config

## Sécurité

- **Double authentification** : Email Google OAuth + Mot de passe admin (hash bcrypt)
- Le hash du mot de passe est stocké dans `.env` (jamais dans le code source)
- Tous les endpoints admin sont protégés par le middleware `require_admin`
- Vérification de l'email contre une liste hardcodée dans `ADMIN_EMAILS`
- Cookie de session `admin_password_verified` valide 24h après vérification du mot de passe
- Le cookie est `httpOnly` pour éviter l'accès JavaScript
- Logs des actions admin (à implémenter)
- Tokens d'impersonation avec expiration (1h)

**Important** : 
- Ne commitez JAMAIS le fichier `.env` dans Git
- Ajoutez `.env` à votre `.gitignore`
- Changez le hash du mot de passe en production

## Développement

### Structure des fichiers

```
frontend/src/admin/
├── AdminApp.tsx              # Protection de route
├── AdminLogin.tsx            # Page de login
├── AdminLayout.tsx           # Layout avec sidebar
├── components/               # Composants réutilisables
│   ├── AdminHeader.tsx
│   ├── AdminSidebar.tsx
│   ├── StatsCard.tsx
│   ├── DataTable.tsx
│   └── Charts/              # Composants graphiques
├── pages/                   # Pages admin
│   ├── UsersPage.tsx
│   ├── SearchesPage.tsx
│   ├── ActivatedPage.tsx
│   ├── PlansPage.tsx
│   └── SettingsPage.tsx
└── hooks/                   # Hooks personnalisés
    ├── useAdminAuth.ts
    ├── useImpersonation.ts
    └── useAdminData.ts

backend/
├── admin_routes.py          # Routes API admin
├── admin_auth.py            # Middleware authentification
└── admin_services.py        # Services métier
```

## Notes importantes

1. **Stripe** : La structure pour Stripe est prête mais l'intégration complète n'est pas implémentée
2. **Impersonation** : Nécessite Supabase Admin API pour une implémentation complète
3. **Graphiques** : Utilise Recharts pour des graphiques interactifs et responsives
4. **Design** : Interface moderne avec Tailwind CSS et animations Framer Motion

## Prochaines étapes

- [ ] Implémenter l'impersonation complète avec Supabase Admin API
- [ ] Ajouter les logs d'audit pour les actions admin
- [ ] Intégrer Stripe pour la gestion des abonnements
- [ ] Ajouter l'export CSV des données
- [ ] Améliorer les graphiques avec plus de métriques
- [ ] Ajouter la recherche avancée dans les tableaux

