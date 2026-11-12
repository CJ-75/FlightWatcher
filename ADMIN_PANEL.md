# Admin FlightWatcher (simplifié FR)

Voir le détail à jour : [docs/ADMIN_PANEL.md](docs/ADMIN_PANEL.md)

## En bref

- Login : `ADMIN_PASSWORD` dans `backend/.env` → `/admin/login`
- Accueil : inscrits / onboarding terminé / taux
- Utilisateurs : liste filtrable
- Contenu : Parcours, Activités, Occasions
- Migration optionnelle onboarding : `backend/migrations/user_profiles_onboarding_at.sql` (manuel, pas `db push`)
