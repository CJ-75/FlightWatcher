# Liste des Aéroports

L'endpoint `/api/airports` retourne la liste complète des aéroports disponibles depuis le fichier CSV.

## Utilisation

### Endpoint
```
GET /api/airports?query=PARIS
```

### Paramètres
- `query` (optionnel) : Recherche par code, nom, ville ou pays

### Réponse
```json
{
  "airports": [
    {
      "code": "BVA",
      "name": "Beauvais-Tillé",
      "city": "Beauvais",
      "country": "France"
    },
    ...
  ],
  "count": 1234
}
```

## Aéroports populaires Ryanair

### France
- **BVA** - Beauvais-Tillé (Beauvais)
- **CDG** - Charles de Gaulle (Paris)
- **ORY** - Orly (Paris)
- **NCE** - Nice Côte d'Azur (Nice)
- **MRS** - Marseille Provence (Marseille)
- **BOD** - Bordeaux-Mérignac (Bordeaux)
- **TLS** - Toulouse-Blagnac (Toulouse)
- **LYS** - Lyon-Saint-Exupéry (Lyon)

### Espagne
- **BCN** - Barcelone-El Prat (Barcelone)
- **MAD** - Madrid-Barajas (Madrid)
- **PMI** - Palma de Majorque (Palma)
- **AGP** - Malaga-Costa del Sol (Malaga)
- **ALC** - Alicante-Elche (Alicante)

### Italie
- **FCO** - Rome-Fiumicino (Rome)
- **MXP** - Milan-Malpensa (Milan)
- **VCE** - Venise-Marco Polo (Venise)
- **NAP** - Naples-Capodichino (Naples)

### Royaume-Uni
- **STN** - Londres-Stansted (Londres)
- **LGW** - Londres-Gatwick (Londres)
- **LHR** - Londres-Heathrow (Londres)
- **EDI** - Édimbourg (Édimbourg)

### Allemagne
- **BER** - Berlin-Brandenburg (Berlin)
- **MUC** - Munich (Munich)
- **FRA** - Francfort (Francfort)
- **HAM** - Hambourg (Hambourg)

## Test de l'endpoint

Pour tester l'endpoint localement :

```bash
# Démarrer le backend
cd backend-node
npm run dev

# Dans un autre terminal, tester l'endpoint
curl http://localhost:8000/api/airports

# Avec recherche
curl http://localhost:8000/api/airports?query=PARIS
```

## Script de test

Un script de test est disponible pour afficher la liste des aéroports :

```bash
cd backend-node
node test-airports.js
```

Ce script affiche :
- La liste des aéroports européens populaires
- Les statistiques par pays
- Les aéroports filtrés pour Ryanair

