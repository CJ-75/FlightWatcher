import Link from 'next/link'
import type { Metadata } from 'next'
import { FIXTURE_SLUGS, POP_FIXTURES } from '@/fixtures/popFixtures'

export const metadata: Metadata = {
  title: 'Pop edge cases (dev)',
  robots: { index: false, follow: false },
}

const LABELS: Record<string, string> = {
  'fixture-riche': 'Riche',
  'fixture-moyen': 'Moyen',
  'fixture-seuil': 'Au seuil',
  'fixture-pauvre': 'Pauvre',
  'fixture-long-title': 'Titre long · 15 stops',
}

export default function PopEdgeIndexPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-14 space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-brand text-primary-600">
          Dev · Lot 5
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
          Cas extrêmes
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Fixtures locales, jamais indexées. Même UI que la V2 Pop.
        </p>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {FIXTURE_SLUGS.map((slug) => {
          const it = POP_FIXTURES[slug]!
          return (
            <li key={slug}>
              <Link
                href={`/dev/pop-fixtures/${slug}`}
                className="flex items-baseline justify-between gap-4 py-4 no-underline"
              >
                <span>
                  <span className="block font-extrabold text-ink">
                    {LABELS[slug] || slug}
                  </span>
                  <span className="mt-1 block text-sm text-muted line-clamp-1">
                    {it.title}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold text-primary-600">
                  →
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
