# Routage `waypop.co` — SPA Vite + Next `apps/web-public` (**proposition, non appliquée**)

## Comparaison

| | Rewrite externe | Vercel Microfrontends |
|---|---|---|
| **Complexité** | Faible (DNS + rewrites projet) | Moyenne (feature Vercel, config multi-apps) |
| **Cache CDN** | OK si `Cache-Control` / ISR côté Next ; vérifier `x-vercel-cache: HIT` | Conçu pour ça |
| **Cookies** | Même domaine → OK (`wp_signed_in`, `pop_v`) | OK |
| **Reco Lot 1** | **Commencer par rewrite externe** | Migrer si friction cache/auth |

## Proposition rewrite (projet SPA / domaine principal)

Ne pas merger dans `vercel.json` racine tant que non validé.

```json
{
  "rewrites": [
    {
      "source": "/pop/:path*",
      "destination": "https://waypop-web-public.vercel.app/pop/:path*"
    },
    {
      "source": "/",
      "destination": "https://waypop-web-public.vercel.app/"
    },
    {
      "source": "/api/:path*",
      "destination": "https://api.waypop.co/api/:path*"
    }
  ]
}
```

SPA : rewrite catch-all existant vers `index.html` pour le reste.

**Projet Next** : region **`fra1`**, env `WAYPOP_API_URL=https://api.waypop.co`, `POP_PAGE_V2` lu via `/api/config` (pas besoin de le dupliquer sauf preview locale).

**`*.vercel.app`** : middleware pose `X-Robots-Tag: noindex` (déjà dans `apps/web-public`).

## Quand `POP_PAGE_V2=on`

Les 301 `/parcours/:slug` → `/pop/{ville}/{slug}` se font **côté SPA ou edge** (à brancher Lot 1 suite) — pas avant flag on.
