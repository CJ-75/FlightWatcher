# Configuration Supabase - Backend

## Créer le fichier .env

Pour activer Supabase dans le backend, vous devez créer un fichier `.env` dans le dossier `backend/` avec les variables suivantes :

```env
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre-clé-anon
SUPABASE_SERVICE_ROLE_KEY=votre-clé-service-role
```

## Où trouver ces valeurs ?

1. **SUPABASE_URL** :
   - Allez sur [https://app.supabase.com](https://app.supabase.com)
   - Sélectionnez votre projet
   - Allez dans **Settings** > **API**
   - Copiez l'**Project URL**

2. **SUPABASE_ANON_KEY** :
   - Dans **Settings** > **API** > **Project API keys**
   - Copiez la clé **anon public** (celle-ci peut être exposée au frontend)

3. **SUPABASE_SERVICE_ROLE_KEY** (optionnel) :
   - Dans **Settings** > **API** > **Project API keys**
   - Copiez la clé **service_role** (⚠️ NE JAMAIS EXPOSER AU FRONTEND)
   - Cette clé est utilisée pour les opérations backend uniquement (price_history, cache)

## Exemple de fichier .env

```env
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzODk2ODAwMCwiZXhwIjoxOTU0NTQ0MDAwfQ.exemple
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjM4OTY4MDAwLCJleHAiOjE5NTQ1NDQwMDB9.exemple
```

## Important

- Le fichier `.env` ne doit **PAS** être commité dans Git (il est déjà dans `.gitignore`)
- Le frontend charge automatiquement la configuration depuis le backend via `/api/config`
- Vous n'avez **PAS** besoin de créer un fichier `.env` dans le dossier `frontend/`

## Vérification

Après avoir créé le fichier `.env`, redémarrez le serveur backend. Vous devriez voir :
- ✅ Configuration Supabase chargée depuis le backend (dans la console frontend)
- ✅ Backend Supabase: Supabase est configuré et connecté ✅ (dans l'interface)

