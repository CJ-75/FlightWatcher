# FlightWatcher - Scanner de vols Ryanair

Interface web simple pour scanner les vols aller-retour depuis Beauvais avec critères de prix.

## Stack technique

- **Backend**: FastAPI (Python)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **API**: Bibliothèque ryanair-py
- **Base de données**: Supabase (optionnel, pour la persistance des données)

## Installation

### Backend

```bash
# Créer un environnement virtuel (optionnel mais recommandé)
python -m venv venv
source venv/bin/activate  # Sur Windows: venv\Scripts\activate

# Installer les dépendances
cd backend
pip install -r requirements.txt

# Ajouter les dépendances de ryanair-py
pip install -r ../ryanair-py/requirements.txt
```

### Configuration Supabase (Optionnel)

Pour activer la persistance des données avec Supabase :

1. **Créer un projet Supabase** :
   - Allez sur [https://app.supabase.com](https://app.supabase.com)
   - Créez un nouveau projet
   - Notez votre URL de projet et votre clé anonyme (anon key)

2. **Configurer le schéma de base de données** :
   - Dans votre projet Supabase, allez dans l'éditeur SQL
   - Exécutez le script `supabase_schema_v2.sql` (à la racine du projet)
   - Cela créera les tables `saved_searches` et `favorites` (avec authentification)
   - Si vous avez un ancien schéma avec `saved_favorites`, exécutez `migrate_saved_favorites_to_favorites.sql` pour migrer les données

3. **Configurer les variables d'environnement backend** :
   ```bash
   cd backend
   # Créer un fichier .env
   # Ajouter les variables suivantes:
   SUPABASE_URL=https://votre-projet.supabase.co
   SUPABASE_ANON_KEY=votre-clé-anon
   SUPABASE_SERVICE_ROLE_KEY=votre-clé-service-role  # Optionnel, pour price_history et cache
   ```
   
   **Note** : Le frontend charge automatiquement la configuration depuis le backend via l'endpoint `/api/config`. 
   Vous n'avez pas besoin de créer un fichier `.env` dans le dossier `frontend`.

**Note** : L'application fonctionne sans Supabase en utilisant le stockage local (localStorage). Supabase est optionnel et permet de synchroniser les données entre appareils.

### Frontend

```bash
cd frontend
npm install
```

## Lancement

### 1. Démarrer le backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Le backend sera accessible sur `http://localhost:8000`

### 2. Démarrer le frontend

Dans un autre terminal:

```bash
cd frontend
npm run dev
```

Le frontend sera accessible sur `http://localhost:5173`

## Utilisation

1. Ouvrir `http://localhost:5173` dans votre navigateur
2. Cliquer sur "🔍 Lancer le scan"
3. Les résultats s'affichent avec tous les voyages aller-retour trouvés

## Critères de recherche

- **Départ**: 7 ou 8 novembre
- **Retour**: 10 ou 11 novembre (lundi/mardi)
- **Prix max**: 100€ par segment (aller ET retour)
- **Aéroport**: Beauvais (BVA)

## Structure du projet

```
FlightWatcher/
├── backend/
│   ├── main.py              # API FastAPI
│   ├── supabase_client.py   # Client Supabase
│   ├── db_models.py         # Modèles de données
│   ├── requirements.txt     # Dépendances Python
│   └── .env.example         # Exemple de configuration
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Composant principal
│   │   ├── types.ts         # Types TypeScript
│   │   ├── utils/
│   │   │   ├── storage.ts   # Stockage local
│   │   │   └── supabase.ts  # Utilitaires Supabase
│   │   └── main.tsx         # Point d'entrée
│   ├── package.json
│   └── vite.config.ts
├── ryanair-py/              # Bibliothèque Ryanair
└── supabase_schema.sql      # Schéma SQL pour Supabase
```

## API Endpoints

### Endpoints principaux

- `GET /` - Status
- `POST /api/scan` - Lancer le scan des vols
- `GET /api/health` - Health check
- `GET /api/airports` - Liste des aéroports
- `GET /api/destinations` - Destinations depuis un aéroport
- `POST /api/auto-check` - Vérification automatique des vols

### Endpoints Supabase (si configuré)

- `GET /api/supabase/status` - Vérifier si Supabase est configuré
- `POST /api/supabase/searches` - Sauvegarder une recherche
- `GET /api/supabase/searches` - Récupérer toutes les recherches
- `DELETE /api/supabase/searches/{id}` - Supprimer une recherche
- `POST /api/supabase/favorites` - Sauvegarder un favori
- `GET /api/supabase/favorites` - Récupérer tous les favoris
- `DELETE /api/supabase/favorites/{id}` - Supprimer un favori

