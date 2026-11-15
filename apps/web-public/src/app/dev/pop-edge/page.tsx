import Link from 'next/link'
import type { Metadata } from 'next'
import { FIXTURE_SLUGS, POP_FIXTURES } from '@/fixtures/popFixtures'

export const metadata: Metadata = {
  title: 'Pop edge cases (dev)',
  robots: { index: false, follow: false },
}

const LABELS: Record<string, string> = {
  'fixture-riche': 'Riche (Lighthouse + HTML complet)',
  'fixture-moyen': 'Moyen',
  'fixture-seuil': 'Au seuil (noindex attendu)',
  'fixture-pauvre': 'Pauvre (1 stop, pas de photo)',
  'fixture-long-title': 'Titre long + 15 stops / 4 jours',
}

/** Lot 5 — cas extrêmes, preview only. */
export default function PopEdgeIndexPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 space-y-6">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary-700">
        Dev · Lot 5
      </p>
      <h1 className="text-3xl font-extrabold text-ink">Cas extrêmes Pop</h1>
      <p className="text-sm text-muted">
        Fixtures locales (`is_demo`), jamais dans le sitemap. Ouvre à 360 px et
        1280 px : pas de scroll horizontal, barre prix ne cache rien.
      </p>
      <ul className="space-y-3">
        {FIXTURE_SLUGS.map((slug) => {
          const it = POP_FIXTURES[slug]!
          return (
            <li key={slug}>
              <Link
                href={`/dev/pop-fixtures/${slug}`}
                className="block rounded-card border border-line bg-white p-4 no-underline hover:border-primary-200"
              >
                <p className="font-extrabold text-ink">
                  {LABELS[slug] || slug}
                </p>
                <p className="mt-1 text-sm text-muted line-clamp-2">
                  {it.title} · {it.itinerary_items?.length || 0} stops
                </p>
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
