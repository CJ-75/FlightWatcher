# Calcul des Presets de Dates - FlightWatcher

## Numérotation des jours

**Frontend (JavaScript)** : 
- `getDay()` retourne : 0=dimanche, 1=lundi, 2=mardi, ..., 6=samedi
- Conversion avec `getDayOfWeekMondayBased()` : **1=lundi, 2=mardi, ..., 7=dimanche**

**Backend (Python)** :
- `weekday()` retourne : **0=lundi, 1=mardi, ..., 6=dimanche**

## 1. Preset "Ce weekend" (`weekend`)

### Logique
Trouve le **samedi et dimanche de cette semaine** à partir d'aujourd'hui.

### Calcul Frontend
```javascript
const currentDay = getDayOfWeekMondayBased(today); // 1=lundi, 6=samedi, 7=dimanche
const saturdayOffset = 6 - currentDay;  // Samedi = jour 6
const sundayOffset = 7 - currentDay;    // Dimanche = jour 7

// Si on est déjà après samedi, prendre le weekend suivant
const saturday = new Date(today);
saturday.setDate(today.getDate() + (saturdayOffset < 0 ? saturdayOffset + 7 : saturdayOffset));
```

### Calcul Backend
```python
current_day = today.weekday()  # 0=lundi, 5=samedi, 6=dimanche
saturday_offset = 5 - current_day  # Samedi = jour 5
sunday_offset = 6 - current_day    # Dimanche = jour 6

# Si on est déjà après samedi, prendre le weekend suivant
if saturday_offset < 0:
    saturday_offset += 7
if sunday_offset < 0:
    sunday_offset += 7
```

### Exemples
- **Aujourd'hui = Lundi (1)** : `6-1 = 5` → Samedi dans 5 jours, Dimanche dans 6 jours
- **Aujourd'hui = Vendredi (5)** : `6-5 = 1` → Samedi dans 1 jour, Dimanche dans 2 jours
- **Aujourd'hui = Dimanche (7)** : `6-7 = -1` → `-1+7 = 6` → Samedi dans 6 jours (semaine suivante)

### Résultat
- **Départ** : Samedi trouvé + horaires 06:00-23:59
- **Retour** : Dimanche trouvé + horaires 06:00-23:59

---

## 2. Preset "Weekend prochain" (`next-weekend`)

### Logique
Trouve le **samedi et dimanche de la semaine suivante** (toujours au moins 7 jours dans le futur).

### Calcul Frontend
```javascript
const currentDay = getDayOfWeekMondayBased(today); // 1=lundi, 6=samedi, 7=dimanche
const daysUntilNextSaturday = 13 - currentDay;  // 6 (samedi) + 7 jours = 13
const daysUntilNextSunday = 14 - currentDay;     // 7 (dimanche) + 7 jours = 14
```

### Calcul Backend
```python
current_day = today.weekday()  # 0=lundi, 5=samedi, 6=dimanche
days_until_next_saturday = 13 - current_day  # 5 (samedi) + 7 jours = 12
days_until_next_sunday = 14 - current_day    # 6 (dimanche) + 7 jours = 13
```

### Exemples
- **Aujourd'hui = Lundi (1)** : `13-1 = 12` → Samedi dans 12 jours, Dimanche dans 13 jours
- **Aujourd'hui = Vendredi (5)** : `13-5 = 8` → Samedi dans 8 jours, Dimanche dans 9 jours
- **Aujourd'hui = Dimanche (7)** : `13-7 = 6` → Samedi dans 6 jours, Dimanche dans 7 jours

### Résultat
- **Départ** : Samedi trouvé (toujours au moins 7 jours) + horaires 06:00-23:59
- **Retour** : Dimanche trouvé (toujours au moins 7 jours) + horaires 06:00-23:59

---

## 3. Preset "3 jours la semaine prochaine" (`next-week`)

### Logique
Trouve le **lundi de la semaine prochaine**, puis génère :
- **Départ** : Lundi, Mardi, Mercredi
- **Retour** : Jeudi, Vendredi, Samedi

### Calcul Frontend
```javascript
const currentDay = getDayOfWeekMondayBased(today); // 1=lundi, 7=dimanche
const daysUntilNextMonday = 8 - currentDay;  // 1 (lundi) + 7 jours = 8
```

### Calcul Backend
```python
current_day = today.weekday()  # 0=lundi, 6=dimanche
days_until_next_monday = 7 - current_day  # 0 (lundi) + 7 jours = 7
```

**Note** : La formule est différente car le backend utilise `weekday()` (0-6) alors que le frontend utilise `getDayOfWeekMondayBased()` (1-7).

### Exemples Frontend
- **Aujourd'hui = Lundi (1)** : `8-1 = 7` → Lundi dans 7 jours
- **Aujourd'hui = Mercredi (3)** : `8-3 = 5` → Lundi dans 5 jours
- **Aujourd'hui = Dimanche (7)** : `8-7 = 1` → Lundi dans 1 jour

### Exemples Backend
- **Aujourd'hui = Lundi (0)** : `7-0 = 7` → Lundi dans 7 jours
- **Aujourd'hui = Mercredi (2)** : `7-2 = 5` → Lundi dans 5 jours
- **Aujourd'hui = Dimanche (6)** : `7-6 = 1` → Lundi dans 1 jour

### Résultat
- **Départ** : 
  - Lundi trouvé + horaires 06:00-23:59
  - Mardi (Lundi + 1) + horaires 06:00-23:59
  - Mercredi (Lundi + 2) + horaires 06:00-23:59
- **Retour** :
  - Jeudi (Lundi + 3) + horaires 06:00-23:59
  - Vendredi (Lundi + 4) + horaires 06:00-23:59
  - Samedi (Lundi + 5) + horaires 06:00-23:59

---

## Comment est décidé le premier jour ?

### Principe général
Le **premier jour** est toujours déterminé par rapport à **aujourd'hui** (`today` ou `date.today()`).

### Méthode de calcul (NOUVELLE MÉTHODE)
1. **Obtenir le jour actuel** :
   - Frontend : `getDayOfWeekMondayBased(today)` → 1-7 (lundi=1, dimanche=7)
   - Backend : `today.weekday()` → 0-6 (lundi=0, dimanche=6)

2. **Calculer directement les jours jusqu'à la date cible** :
   - Pour samedi de cette semaine : `6 - currentDay` (frontend) ou `5 - currentDay` (backend)
   - Pour dimanche de cette semaine : `7 - currentDay` (frontend) ou `6 - currentDay` (backend)
   - Pour samedi de la semaine prochaine : `13 - currentDay` (frontend) ou `12 - currentDay` (backend)
   - Pour lundi de la semaine prochaine : `8 - currentDay` (frontend) ou `7 - currentDay` (backend)

3. **Gérer les cas spéciaux** :
   - Si le résultat est négatif (on est déjà passé le jour cible) → ajouter 7 jours
   - Pour "weekend prochain" et "next-week" → toujours calculer pour la semaine suivante (+7 jours)

### Tableau de correspondance

| Jour | Frontend (1-7) | Backend (0-6) | getDay() JS |
|------|----------------|---------------|-------------|
| Lundi | 1 | 0 | 1 |
| Mardi | 2 | 1 | 2 |
| Mercredi | 3 | 2 | 3 |
| Jeudi | 4 | 3 | 4 |
| Vendredi | 5 | 4 | 5 |
| Samedi | 6 | 5 | 6 |
| Dimanche | 7 | 6 | 0 |

### Conversion Frontend → Backend
Pour convertir de la numérotation frontend (1-7) vers backend (0-6) :
- Si frontend = 7 (dimanche) → backend = 6
- Sinon → backend = frontend - 1

Pour convertir de la numérotation backend (0-6) vers frontend (1-7) :
- Si backend = 6 (dimanche) → frontend = 7
- Sinon → frontend = backend + 1

