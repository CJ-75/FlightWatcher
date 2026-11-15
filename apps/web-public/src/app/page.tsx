import Link from 'next/link'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import {
  citySlugDisplayNameFr,
  sanitizeUserFacingText,
} from '@waypop/shared'
import { fetchPublishedByCity, fetchSitemapPayload } from '@/lib/parcoursApi'
import { PopFooter } from '@/components/pop/PopFooter'
import { PopImage } from '@/components/pop/PopImage'
import { Card } from '@/components/ui/Card'
import { LandingOrigin } from '@/components/landing/LandingOrigin'

const PriceIsland = dynamic(
  () => import('@/components/pop/PriceIsland').then((m) => m.PriceIsland),
  {
    loading: () => (
      <div className="min-h-[22rem] rounded-card bg-ink/90 animate-pulse" />
    ),
  },
)

export const revalidate = 3600

export const metadata: Metadata = {
  title: {
    absolute: 'Week-end pas cher entre amis | Waypop',
  },
  description:
    'Des week-ends déjà organisés, pas chers : Pops jour par jour, prix vol+hôtel, et Planner pour partir entre potes.',
  alternates: { canonical: 'https://waypop.co/' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Week-end pas cher entre amis | Waypop',
    description:
      'Choisis un Pop, invite le groupe, réserve. Prix week-end et itinéraires prêts.',
    url: 'https://waypop.co/',
    type: 'website',
  },
}

async function featuredPops() {
  // Paris pilot hub — featured first, then recent
  const list = await fetchPublishedByCity('paris')
  const featured = list.filter((p) => p.featured === true)
  const pool = featured.length ? featured : list
  return pool.slice(0, 6)
}

export default async function LandingPage() {
  const [pops, sitemap] = await Promise.all([
    featuredPops(),
    fetchSitemapPayload(),
  ])
  const openCities = (sitemap.open_cities || Object.keys(sitemap.cities || {})).slice(
    0,
    8,
  )

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'Waypop',
        url: 'https://waypop.co',
        logo: 'https://waypop.co/icon.png',
      },
      {
        '@type': 'WebSite',
        name: 'Waypop',
        url: 'https://waypop.co',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://waypop.co/pop/paris?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main>
        {/* Hero — brand first, one CTA group */}
        <section className="relative overflow-hidden bg-gradient-to-br from-[#FFF9F5] via-[#FFE9DD] to-[#FFDCC8]">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-14 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end lg:pb-20 lg:pt-20">
            <div className="space-y-5 max-w-xl">
              <p className="text-3xl sm:text-5xl font-extrabold tracking-tight text-ink">
                Waypop
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink leading-snug">
                Les week-ends entre potes, déjà organisés, pas chers
              </h1>
              <p className="text-muted text-base leading-relaxed">
                Un Pop = le programme, les adresses, et une idée de prix. Tu
                invites, vous réservez.
              </p>
              <LandingOrigin />
            </div>
            <div className="hidden lg:block min-h-[22rem]">
              <Suspense
                fallback={
                  <div className="min-h-[22rem] rounded-card bg-ink/90 animate-pulse" />
                }
              >
                <PriceIsland
                  destCity="paris"
                  cityLabel="Paris"
                  stopCount={pops.length || 6}
                />
              </Suspense>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-6xl space-y-16 px-5 py-14">
          <div className="lg:hidden min-h-[22rem]">
            <Suspense
              fallback={
                <div className="min-h-[22rem] rounded-card bg-ink/90 animate-pulse" />
              }
            >
              <PriceIsland
                destCity="paris"
                cityLabel="Paris"
                stopCount={pops.length || 6}
              />
            </Suspense>
          </div>

          {pops.length > 0 ? (
            <section className="space-y-5" aria-labelledby="featured">
              <h2 id="featured" className="text-2xl font-extrabold text-ink">
                Pops en vedette
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pops.map((it) => {
                  const city = String(it.city_slug || 'paris')
                  return (
                    <li key={it.id}>
                      <Card className="overflow-hidden p-0 h-full">
                        {it.cover_image ? (
                          <PopImage
                            src={it.cover_image}
                            alt=""
                            variant="card"
                          />
                        ) : (
                          <div className="flex h-36 items-center justify-center bg-gradient-to-br from-ink to-primary-600 text-white font-extrabold">
                            {citySlugDisplayNameFr(city) || city}
                          </div>
                        )}
                        <div className="p-4 space-y-2">
                          <Link
                            href={`/pop/${city}/${encodeURIComponent(it.slug || it.id)}`}
                            className="font-extrabold text-ink no-underline hover:underline line-clamp-2"
                          >
                            {sanitizeUserFacingText(it.title) || it.title}
                          </Link>
                          {it.subtitle ? (
                            <p className="text-sm text-muted line-clamp-2">
                              {sanitizeUserFacingText(it.subtitle)}
                            </p>
                          ) : null}
                        </div>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          <section className="space-y-5" aria-labelledby="how">
            <h2 id="how" className="text-2xl font-extrabold text-ink">
              Comment ça marche
            </h2>
            <ol className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  n: '1',
                  t: 'Choisis un Pop',
                  d: 'Un parcours jour par jour, pensé pour un vrai week-end.',
                },
                {
                  n: '2',
                  t: 'Invite le groupe',
                  d: 'Ajoute-le au Planner et partage le lien.',
                },
                {
                  n: '3',
                  t: 'Réserve',
                  d: 'Vol + hôtel quand le prix vous va — ou une alerte.',
                },
              ].map((s) => (
                <li
                  key={s.n}
                  className="rounded-card border border-line bg-white p-5 space-y-2"
                >
                  <p className="text-[10px] font-black uppercase tracking-wide text-primary-700">
                    Étape {s.n}
                  </p>
                  <p className="font-extrabold text-ink">{s.t}</p>
                  <p className="text-sm text-muted leading-relaxed">{s.d}</p>
                </li>
              ))}
            </ol>
          </section>

          {openCities.length > 0 ? (
            <section className="space-y-4" aria-labelledby="cities">
              <h2 id="cities" className="text-2xl font-extrabold text-ink">
                Villes ouvertes
              </h2>
              <ul className="flex flex-wrap gap-2">
                {openCities.map((c) => (
                  <li key={c}>
                    <Link
                      href={`/pop/${c}`}
                      className="inline-flex rounded-pill border border-line bg-white px-4 py-2 text-sm font-bold text-ink no-underline hover:bg-primary-50"
                    >
                      {citySlugDisplayNameFr(c) || c}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="space-y-3">
              <h2 className="text-2xl font-extrabold text-ink">Commencer</h2>
              <Link
                href="/pop/paris"
                className="app-btn-primary inline-flex no-underline"
              >
                Voir les Pops à Paris
              </Link>
            </section>
          )}

          <section className="space-y-4" aria-labelledby="app">
            <h2 id="app" className="text-2xl font-extrabold text-ink">
              Télécharger l’app
            </h2>
            <p className="text-muted text-sm max-w-lg">
              Planner, alertes prix et parcours dans la poche. Sur ordinateur,
              scanne le QR depuis la page stores (à brancher).
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://apps.apple.com"
                className="inline-flex rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink no-underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                App Store
              </a>
              <a
                href="https://play.google.com"
                className="inline-flex rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink no-underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                Google Play
              </a>
            </div>
          </section>
        </div>
      </main>
      <PopFooter />
    </>
  )
}
