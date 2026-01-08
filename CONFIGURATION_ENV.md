# Guide de configuration des fichiers .env

Ce guide vous explique comment configurer les fichiers `.env` pour utiliser Supabase avec FlightWatcher.

## 📋 Fichiers .env.example

Deux fichiers d'exemple ont été créés :
- `backend/.env.example` - Configuration backend (recommandé)
- `frontend/.env.example` - Configuration frontend (optionnel)

## 🚀 Configuration rapide

### Étape 1 : Obtenir vos clés Supabase

1. Allez sur [https://app.supabase.com](https://app.supabase.com)
2. Créez un projet ou sélectionnez un projet existant
3. Allez dans **Settings** → **API**
4. Vous verrez deux valeurs importantes :
   - **Project URL** : `https://xxxxxxxxxxxxx.supabase.co`
   - **anon public** key : Une longue chaîne commençant par `eyJ...`

### Étape 2 : Configurer le backend (Recommandé)

```bash
# Dans le dossier backend
cd backend

# Windows PowerShell
Copy-Item .env.example .env

# Linux/Mac
cp .env.example .env
```

Ensuite, éditez le fichier `.env` et remplacez :
- `SUPABASE_URL` par votre Project URL
- `SUPABASE_ANON_KEY` par votre clé anon public

**Exemple de fichier .env rempli :**
```env
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzODk2NzI4MCwiZXhwIjoxOTU0NTQzMjgwfQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Étape 3 : Configurer le frontend (Optionnel)

Le frontend peut fonctionner sans fichier `.env` car il utilise l'API backend. Si vous voulez quand même le configurer :

```bash
# Dans le dossier frontend
cd frontend

# Windows PowerShell
Copy-Item .env.example .env

# Linux/Mac
cp .env.example .env
```

Ensuite, éditez le fichier `.env` avec les mêmes valeurs (mais avec le préfixe `VITE_`) :
```env
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzODk2NzI4MCwiZXhwIjoxOTU0NTQzMjgwfQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## ✅ Vérification

Après avoir configuré le backend, testez la configuration :

1. Démarrez le backend :
   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```

2. Visitez dans votre navigateur :
   ```
   http://localhost:8000/api/supabase/status
   ```

3. Vous devriez voir :
   ```json
   {
     "available": true,
     "message": "Supabase est configuré et disponible"
   }
   ```

## ⚠️ Important

- **Ne commitez JAMAIS** vos fichiers `.env` avec vos vraies clés
- Les fichiers `.env` sont déjà dans `.gitignore` pour éviter cela
- Si vous partagez votre code, utilisez toujours les fichiers `.env.example`

## 🔧 Format des valeurs

### SUPABASE_URL
- Format : `https://xxxxxxxxxxxxx.supabase.co`
- Où trouver : Settings → API → Project URL
- Exemple : `https://abcdefghijklmnop.supabase.co`

### SUPABASE_ANON_KEY
- Format : Longue chaîne JWT commençant par `eyJ...`
- Où trouver : Settings → API → anon public
- Exemple : `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzODk2NzI4MCwiZXhwIjoxOTU0NTQzMjgwfQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## 📝 Notes

- L'application fonctionne **sans Supabase** en utilisant localStorage
- Supabase est **optionnel** et permet la synchronisation entre appareils
- Si vous ne configurez pas Supabase, l'application fonctionnera normalement avec le stockage local

## 🆘 Dépannage

### Erreur "Supabase n'est pas configuré"
- Vérifiez que le fichier `.env` existe dans `backend/`
- Vérifiez que les noms des variables sont corrects (SUPABASE_URL, SUPABASE_ANON_KEY)
- Vérifiez qu'il n'y a pas d'espaces avant/après les valeurs
- Redémarrez le serveur backend

### Erreur "Invalid API key"
- Vérifiez que vous avez copié la clé complète (elle est très longue)
- Vérifiez qu'il n'y a pas d'espaces ou de retours à la ligne dans la clé
- Vérifiez que vous utilisez la clé "anon public" et non la clé "service_role"

