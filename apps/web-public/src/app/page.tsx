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
import { LandingOrigin } from '@/components/landing/LandingOrigin'
import { WpRule } from '@/components/ui/WpRule'

const PriceIsland = dynamic(
  () => import('@/components/pop/PriceIsland').then((m) => m.PriceIsland),
  {
    loading: () => (
      <div className="min-h-[21rem] animate-pulse rounded-2xl bg-night/90" />
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
  const openCities = (
    sitemap.open_cities || Object.keys(sitemap.cities || {})
  ).slice(0, 8)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'Waypop',
        url: 'https://waypop.co',
      },
      {
        '@type': 'WebSite',
        name: 'Waypop',
        url: 'https://waypop.co',
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-night" />
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 80% 10%, rgba(255,90,31,0.35), transparent 55%), linear-gradient(160deg, #161311 0%, #2a1a12 45%, #12100e 100%)',
          }}
        />
        <div className="relative mx-auto grid max-w-pop gap-12 px-5 pb-16 pt-16 lg:grid-cols-[minmax(0,1.1fr)_19rem] lg:items-end lg:pb-20 lg:pt-24">
          <div className="max-w-xl space-y-6 text-night-fg">
            <p className="wp-reveal text-[11px] font-semibold uppercase tracking-brand text-night-fg/70">
              Waypop
            </p>
            <h1 className="wp-reveal-delay text-[2rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Les week-ends entre potes, déjà organisés
            </h1>
            <p className="wp-reveal-delay-2 max-w-md text-base leading-relaxed text-night-fg/70">
              Un Pop = le programme, les adresses, une idée de prix. Tu invites,
              vous réservez.
            </p>
            <div className="wp-reveal-delay-2 pt-1">
              <LandingOrigin dark />
            </div>
          </div>
          <div className="hidden min-h-[21rem] lg:block">
            <Suspense
              fallback={
                <div className="min-h-[21rem] animate-pulse rounded-2xl bg-white/10" />
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

      <div className="mx-auto max-w-pop space-y-20 px-5 py-14">
        <div className="lg:hidden min-h-[21rem]">
          <Suspense
            fallback={
              <div className="min-h-[21rem] animate-pulse rounded-2xl bg-night/90" />
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
          <section className="space-y-8">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-600">
                Sélection
              </p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
                Pops en vedette
              </h2>
            </div>
            <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {pops.map((it) => {
                const city = String(it.city_slug || 'paris')
                return (
                  <li key={it.id}>
                    <Link
                      href={`/pop/${city}/${encodeURIComponent(it.slug || it.id)}`}
                      className="group block no-underline"
                    >
                      {it.cover_image ? (
                        <div className="overflow-hidden rounded-2xl">
                          <PopImage
                            src={it.cover_image}
                            alt=""
                            variant="card"
                            className="h-44 transition-transform duration-500 group-hover:scale-[1.03]"
                          />
                        </div>
                      ) : (
                        <div className="flex h-44 items-center justify-center rounded-2xl bg-night text-night-fg font-bold">
                          {citySlugDisplayNameFr(city) || city}
                        </div>
                      )}
                      <p className="mt-4 text-lg font-extrabold tracking-tight text-ink group-hover:underline">
                        {sanitizeUserFacingText(it.title) || it.title}
                      </p>
                      {it.subtitle ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted">
                          {sanitizeUserFacingText(it.subtitle)}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        <WpRule />

        <section className="space-y-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-600">
              Simple
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
              Comment ça marche
            </h2>
          </div>
          <ol className="grid gap-8 sm:grid-cols-3">
            {[
              {
                n: '01',
                t: 'Choisis un Pop',
                d: 'Un parcours jour par jour, pensé pour un vrai week-end.',
              },
              {
                n: '02',
                t: 'Invite le groupe',
                d: 'Ajoute-le au Planner et partage le lien.',
              },
              {
                n: '03',
                t: 'Réserve',
                d: 'Vol + hôtel quand le prix vous va — ou une alerte.',
              },
            ].map((s) => (
              <li key={s.n} className="space-y-3">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-primary-600">
                  {s.n}
                </p>
                <p className="text-xl font-extrabold tracking-tight text-ink">
                  {s.t}
                </p>
                <p className="text-sm leading-relaxed text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {openCities.length > 0 ? (
          <section className="space-y-5">
            <h2 className="text-2xl font-extrabold tracking-tight text-ink">
              Villes ouvertes
            </h2>
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              {openCities.map((c) => (
                <li key={c}>
                  <Link
                    href={`/pop/${c}`}
                    className="text-base font-bold text-ink no-underline underline-offset-4 hover:underline"
                  >
                    {citySlugDisplayNameFr(c) || c}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section>
            <Link href="/pop/paris" className="wp-cta inline-flex">
              Voir les Pops à Paris
            </Link>
          </section>
        )}

        <section className="rounded-2xl bg-night px-6 py-8 text-night-fg sm:px-10">
          <h2 className="text-2xl font-extrabold tracking-tight">
            Télécharger l’app
          </h2>
          <p className="mt-2 max-w-lg text-sm text-night-fg/65">
            Planner, alertes prix et parcours dans la poche.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="https://apps.apple.com"
              className="wp-cta-ghost border-white/20 bg-transparent text-night-fg hover:bg-white/10"
              rel="noopener noreferrer"
              target="_blank"
            >
              App Store
            </a>
            <a
              href="https://play.google.com"
              className="wp-cta-ghost border-white/20 bg-transparent text-night-fg hover:bg-white/10"
              rel="noopener noreferrer"
              target="_blank"
            >
              Google Play
            </a>
          </div>
        </section>
      </div>
      <PopFooter />
    </>
  )
}
