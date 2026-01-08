# Guide de configuration Supabase pour FlightWatcher

Ce guide vous explique comment configurer Supabase pour persister vos recherches et favoris dans une base de données cloud.

## Pourquoi utiliser Supabase ?

- **Synchronisation** : Accédez à vos recherches et favoris depuis n'importe quel appareil
- **Persistance** : Vos données ne sont pas perdues si vous videz le cache du navigateur
- **Backup** : Vos données sont sauvegardées automatiquement
- **Partage** : Possibilité future de partager des recherches avec d'autres utilisateurs

## Étapes de configuration

### 1. Créer un projet Supabase

1. Allez sur [https://app.supabase.com](https://app.supabase.com)
2. Créez un compte ou connectez-vous
3. Cliquez sur "New Project"
4. Remplissez les informations :
   - **Name** : FlightWatcher (ou un nom de votre choix)
   - **Database Password** : Choisissez un mot de passe fort
   - **Region** : Choisissez la région la plus proche
5. Cliquez sur "Create new project"
6. Attendez que le projet soit créé (2-3 minutes)

### 2. Récupérer les clés d'API

1. Dans votre projet Supabase, allez dans **Settings** → **API**
2. Notez les valeurs suivantes :
   - **Project URL** (ex: `https://xxxxx.supabase.co`)
   - **anon public** key (clé publique anonyme)

### 3. Créer les tables dans Supabase

1. Dans votre projet Supabase, allez dans **SQL Editor**
2. Cliquez sur "New query"
3. Copiez le contenu du fichier `supabase_schema.sql` (à la racine du projet)
4. Collez-le dans l'éditeur SQL
5. Cliquez sur "Run" (ou appuyez sur Ctrl+Enter)
6. Vérifiez que les tables `saved_searches` et `saved_favorites` ont été créées dans **Table Editor**

### 4. Configurer le backend

1. Dans le dossier `backend`, créez un fichier `.env` :
   ```bash
   cd backend
   cp .env.example .env
   ```

2. Éditez le fichier `.env` et ajoutez vos clés :
   ```env
   SUPABASE_URL=https://votre-projet.supabase.co
   SUPABASE_ANON_KEY=votre-clé-anon-ici
   ```

3. Redémarrez le serveur backend pour que les changements prennent effet

### 5. Configurer le frontend (optionnel)

Le frontend peut utiliser Supabase directement, mais pour des raisons de sécurité, il est recommandé de passer par l'API backend. Si vous souhaitez quand même configurer le frontend :

1. Dans le dossier `frontend`, créez un fichier `.env` :
   ```env
   VITE_SUPABASE_URL=https://votre-projet.supabase.co
   VITE_SUPABASE_ANON_KEY=votre-clé-anon-ici
   ```

2. Redémarrez le serveur de développement frontend

## Vérification

Pour vérifier que Supabase est correctement configuré :

1. Démarrez le backend
2. Visitez `http://localhost:8000/api/supabase/status`
3. Vous devriez voir :
   ```json
   {
     "available": true,
     "message": "Supabase est configuré et disponible"
   }
   ```

## Utilisation

Une fois Supabase configuré, l'application utilisera automatiquement Supabase pour :
- Sauvegarder vos recherches
- Sauvegarder vos favoris
- Synchroniser les données entre appareils

Les données sont toujours sauvegardées localement (localStorage) en parallèle pour une meilleure performance.

## Dépannage

### Erreur "Supabase n'est pas configuré"

- Vérifiez que le fichier `.env` existe dans le dossier `backend`
- Vérifiez que les variables `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont correctement définies
- Redémarrez le serveur backend

### Erreur "Table does not exist"

- Vérifiez que vous avez bien exécuté le script `supabase_schema.sql`
- Vérifiez dans **Table Editor** que les tables existent

### Les données ne se synchronisent pas

- Vérifiez que Supabase est accessible depuis votre réseau
- Vérifiez les logs du backend pour voir les erreurs éventuelles
- L'application continue de fonctionner avec localStorage même si Supabase n'est pas disponible

## Sécurité

⚠️ **Important** : Ne partagez jamais votre clé `SUPABASE_ANON_KEY` publiquement. Elle est conçue pour être utilisée côté client, mais elle doit rester privée dans votre projet.

Pour un environnement de production, considérez :
- Utiliser Row Level Security (RLS) dans Supabase
- Implémenter l'authentification utilisateur
- Utiliser des clés de service pour les opérations sensibles

## Support

Si vous rencontrez des problèmes, vérifiez :
- Les logs du backend (dans la console où vous avez lancé `uvicorn`)
- La documentation Supabase : [https://supabase.com/docs](https://supabase.com/docs)
- Les issues GitHub du projet

