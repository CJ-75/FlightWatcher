# Admin FlightWatcher (simplifié FR)

Voir le détail à jour : [docs/ADMIN_PANEL.md](docs/ADMIN_PANEL.md)

## En bref

- Login : `ADMIN_PASSWORD` dans `backend/.env` → `/admin/login`
- Dashboard : KPIs + courbes inscrits / onboarding
- Utilisateurs / Onboarding / Activité (WAU + events)
- Contenu : Parcours, Activités, Occasions
- Ops : Digests, Santé, Journal (audit)
- Migration optionnelle onboarding : `backend/migrations/user_profiles_onboarding_at.sql` (manuel, pas `db push`)
