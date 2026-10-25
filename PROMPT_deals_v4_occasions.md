# PROMPT v4 — Occasions Deals

Voir le message produit dans le chat. Décisions validées :

1. Tags au **materialize**
2. Remplacer quick filters ; seuil prix **200 €** (`moins-200`)
3. Météo : pas de badge °C avant mesure sandbox ; `hiver-soleil` = whitelist
4. Notifs : **email + push**

Lots A→G livrés · P/O plus tard.

| Lot | Statut |
|---|---|
| A config/holidays/daylight | done |
| B SQL + tagger materialize | done — `apply_deals_occasions_lot_b_migration.sql` |
| C API occasions + filtre | done |
| D weather LiteAPI | done — `DEALS_WEATHER_ENABLED` + `apply_deals_occasions_lot_d_migration.sql` |
| E UI chips web/mobile | done |
| F email + Expo push | done — `apply_deals_occasions_lot_f_migration.sql` · cron `send-occasion-digests` |
| G admin `/admin/occasions` | done |
| P/O pages SSR | later |
