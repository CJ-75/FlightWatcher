# Lot 5 — Checklist d’acceptation Pop / Landing

Cocher avant `POP_PAGE_V2=on` en prod. Fixtures : `/dev/pop-edge` (noindex).

## Automatisé (bloquant CI / local)

```bash
# API + Next locaux
cd apps/web-public
npm run test:unit
npm run accept:html   # serveur dev sur :3001
npm run accept:flags  # BASE=… API=…
```

| # | Critère | Auto | Manuel |
|---|---------|------|--------|
| 2 | HTML : titre, intro, tous stops, FAQ | `accept:html` sur fixture-riche | curl prod |
| 4 | Pas de TODO / Lorem / undefined | `accept:html` + `test:unit` | |
| 5 | Blocs vides / noindex sous seuil | fixture-seuil / pauvre | |
| 6 | 301 / 410 / 404 / canonical / sitemap / vercel noindex | partiel `accept:flags` | Rich Results + Search Console |
| 7 | Flags off = SPA ; on = Next ; preview noindex | `accept:flags` | |
| 16 | Cas extrêmes | `/dev/pop-edge` | 360 & 1280 px |
| 17 | Tests auto en place | scripts ci-dessus | brancher CI |
| 18 | `target_query` doublon refusé | admin + index SQL unique | |

## Manuel (captures)

1. **Lighthouse mobile** ≥ 95 : `fixture-riche`, `fixture-moyen`, `fixture-seuil`, Pop Paris réel, landing `/`, Escapo comparatif.
3. **Rich Results / Schema** : 0 erreur sur fixture-riche + 1 Pop réel.
8–9. SPA / mobile inchangés (3 écrans web + 3 mobile avant/après).
10. Aperçu WhatsApp Pop + landing.
11. 360 px / 1280 px : pas de scroll horizontal ; sticky bar ne cache pas le CTA.
12–13. Render étape A ; TTFB &lt; 500 ms hors cache ; `x-vercel-cache: HIT`.
14–15. Ajout Planner web + alerte email ; session `/` ↔ `/planner` + cookie `wp_signed_in`.
19. Landing Lighthouse ≥ 95, user connecté → `/sejours`.

## Fixtures

| Slug | But |
|------|-----|
| `fixture-riche` | Lighthouse + HTML + JSON-LD + FAQ |
| `fixture-moyen` | Contenu moyen |
| `fixture-seuil` | noindex (manque value-add) |
| `fixture-pauvre` | 1 stop, pas de photo, beau fallback |
| `fixture-long-title` | 90 car. + 15 stops / 4 jours |

URLs : `/dev/pop-fixtures/{slug}`

## Go-live

1. SQL SEO appliqué  
2. Lot 5 auto vert  
3. Captures Lighthouse jointes  
4. `POP_PAGE_V2=on` + rewrite Vercel `/pop` → Next  
5. Paris `pop_index_cities.indexable` seulement après seuil réel  
