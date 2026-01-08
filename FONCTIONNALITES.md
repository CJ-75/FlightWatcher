# Nouvelles fonctionnalités - FlightWatcher

## ✅ Fonctionnalités ajoutées

### 1. Sélection de dates multiples
- **Dates de départ** : Ajouter plusieurs dates pour le départ (ex: 7, 8, 9 novembre)
- **Dates de retour** : Ajouter plusieurs dates pour le retour (ex: 10, 11, 12 novembre)
- Interface avec badges cliquables pour supprimer les dates
- Validation : Au moins une date de départ ET une date de retour requises

### 2. Contrôle des horaires
- **Heures de départ** : Définir une plage horaire pour les vols aller (ex: 06:00 - 12:00)
- **Heures de retour** : Définir une plage horaire pour les vols retour (ex: 14:00 - 20:00)
- Format : HH:MM avec sélecteurs de temps natifs

### 3. Gestion du budget
- **Budget maximum par segment** : Définir le prix maximum pour l'aller ET le retour
- Slider interactif (10€ - 500€)
- Champ numérique pour saisie directe
- Par défaut : 100€

## 🔧 Modifications techniques

### Backend (FastAPI)
- `POST /api/scan` remplace `GET /api/scan`
- Nouveau modèle `ScanRequest` avec tous les paramètres
- Fonction `scanner_vols_beauvais_api` mise à jour pour :
  - Accepter des listes de dates
  - Filtrer par plages horaires
  - Respecter le budget configuré
  - Filtrer les résultats pour ne garder que les dates exactes sélectionnées

### Frontend (React + TypeScript)
- Formulaire complet avec tous les contrôles
- Interface utilisateur avec :
  - Sélecteurs de dates multiples
  - Badges colorés pour les dates sélectionnées
  - Contrôles d'horaires (time pickers)
  - Slider + input pour le budget
- Validation côté client
- Affichage des résultats inchangé (toujours avec statistiques)

## 📋 Format de la requête API

```json
{
  "dates_depart": ["2024-11-07", "2024-11-08"],
  "dates_retour": ["2024-11-10", "2024-11-11"],
  "heure_depart_min": "06:00",
  "heure_depart_max": "12:00",
  "heure_retour_min": "14:00",
  "heure_retour_max": "20:00",
  "budget_max": 100
}
```

## 🎯 Utilisation

1. Sélectionner une ou plusieurs dates de départ
2. Sélectionner une ou plusieurs dates de retour
3. (Optionnel) Ajuster les horaires de départ/retour
4. (Optionnel) Ajuster le budget maximum
5. Cliquer sur "🔍 Lancer le scan"

Le système recherchera tous les vols qui correspondent à **TOUTES** ces conditions :
- Date de départ dans la liste sélectionnée
- Date de retour dans la liste sélectionnée
- Heure de départ dans la plage horaire
- Heure de retour dans la plage horaire
- Prix aller ≤ budget_max
- Prix retour ≤ budget_max

