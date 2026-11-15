# Coût images Pop (Lot 4) — estimation avant choix

Hypothèses par Pop publié :
- 1 cover hero + ~6 photos stops = **7 images**
- Tailles servies via `next/image` : ~80–120 Ko WebP/AVIF moyen / vue (pas le fichier source)

## Option A — Vercel Image Optimization

| Volume | Images stockées* | Vues / mois (hyp.) | Ordre de grandeur |
|--------|------------------|--------------------|-------------------|
| 1 000 Pops | ~7 000 sources | 50k optimisations | **Inclus / bas** sur Pro si cache hit élevé ; dépassement ~$5–15 / mois |
| 10 000 Pops | ~70 000 sources | 500k optimisations | **$50–150 / mois** si beaucoup de cold variants (device sizes) |

\*Le billing Vercel compte surtout les **transformations**, pas le stockage source.

**Pour** : zéro pipeline custom, AVIF/WebP auto, CDN.  
**Contre** : coût croît avec le trafic et la diversité des `sizes`.

## Option B — Supabase Storage + transforms (ou tailles à la publication)

| Volume | Stockage ~ (JPEG 200–400 Ko) | Bande passante 100k vues |
|--------|------------------------------|---------------------------|
| 1 000 Pops | ~2–3 Go | ~10–20 Go egress |
| 10 000 Pops | ~20–30 Go | ~100–200 Go |

Sur plan Pro Supabase : stockage ~$0.02/Go, egress variable ; **1k Pops ≈ quelques $/mois**, **10k ≈ $20–80** selon trafic (hors Free).

**Génération à la publication** (3 tailles : 640 / 1200 / 1600) :
- CPU Render one-shot négligeable
- Egress plus prévisible, **pas de tax Vercel Image**
- Implémentation + invalidation à prévoir

## Recommandation Lot 4

1. **Maintenant** : garder **Vercel Image** (`formats: avif/webp`, `minimumCacheTTL` 7j) — volume pilot Paris faible.
2. **Seuil de bascule** : dès **>~2–3k Pops** ou facture Image > ~$30/mois → générer **3 tailles à la publication** dans Supabase Storage + URLs stables (sans `next/image` transform, ou `loader` custom qui pointe le preset).
3. Ne pas héberger les Unsplash/Wikimedia bruts en prod longue durée : mirror + licence au publish.

Chiffre à recalibrer avec la vraie facture Vercel après 2 semaines de preview trafic.
