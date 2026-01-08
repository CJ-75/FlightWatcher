# Configuration rapide du fichier .env

## Méthode 1 : Utiliser le script de vérification

```bash
cd backend
python check_env.py
```

Ce script va :
- Vérifier si le fichier `.env` existe
- Créer un fichier `.env` exemple si nécessaire
- Vérifier que toutes les variables sont définies

## Méthode 2 : Créer manuellement le fichier .env

1. Créez un fichier nommé `.env` dans le dossier `backend/`
2. Ajoutez le contenu suivant :

```env
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre-clé-anon
SUPABASE_SERVICE_ROLE_KEY=votre-clé-service-role
```

3. Remplacez les valeurs par vos propres clés Supabase

## Où trouver vos clés Supabase ?

1. Allez sur [https://app.supabase.com](https://app.supabase.com)
2. Sélectionnez votre projet
3. Allez dans **Settings** > **API**
4. Copiez :
   - **Project URL** → `SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (optionnel)

## Vérification

Après avoir créé le fichier `.env` :

1. **Redémarrez le serveur backend** (important !)
2. Vous devriez voir dans la console : `✅ Supabase configuré et disponible`
3. Dans le frontend, vous devriez voir : `✅ Backend Supabase: Supabase est configuré et connecté ✅`

## Dépannage

### Le fichier .env existe mais l'erreur persiste

1. Vérifiez que le fichier est bien dans `backend/.env` (pas à la racine)
2. Vérifiez qu'il n'y a pas d'espaces autour du `=` dans le fichier .env
3. Vérifiez qu'il n'y a pas de guillemets autour des valeurs
4. Redémarrez le serveur backend

### Format correct du fichier .env

✅ **Correct** :
```env
SUPABASE_URL=https://abc.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

❌ **Incorrect** :
```env
SUPABASE_URL = https://abc.supabase.co  # Espaces autour du =
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # Guillemets
```

