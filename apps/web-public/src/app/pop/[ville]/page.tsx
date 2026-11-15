import Link from 'next/link'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import {
  citySlugDisplayNameFr,
  ITINERARY_OCCASION_LABELS,
  sanitizeUserFacingText,
  type ItineraryOccasion,
} from '@waypop/shared'
import { fetchPublishedByCity } from '@/lib/parcoursApi'
import { PopFooter } from '@/components/pop/PopFooter'
import { WpPopCard } from '@/components/ui/WpPopCard'
import { WpRule } from '@/components/ui/WpRule'

const PriceIsland = dynamic(
  () => import('@/components/pop/PriceIsland').then((m) => m.PriceIsland),
  {
    loading: () => (
      <div className="min-h-[21rem] animate-pulse rounded-2xl bg-night/90" />
    ),
  },
)

export const revalidate = 86400

type Props = { params: Promise<{ ville: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ville } = await params
  const city = decodeURIComponent(ville).toLowerCase()
  const label = citySlugDisplayNameFr(city) || city
  const title = `Que faire à ${label} le week-end | Waypop`
  const description = `Itinéraires à ${label} : programme jour par jour, adresses et idée de prix week-end.`
  return {
    title: {
      absolute: title.length > 60 ? `Que faire à ${label} | Waypop` : title,
    },
    description: description.slice(0, 160),
    alternates: { canonical: `https://waypop.co/pop/${city}` },
    robots: { index: false, follow: true },
  }
}

export default async function PopCityPage({ params }: Props) {
  const { ville } = await params
  const city = decodeURIComponent(ville).toLowerCase()
  const list = await fetchPublishedByCity(city)
  const label = citySlugDisplayNameFr(city) || city

  const byOccasion = new Map<string, typeof list>()
  for (const it of list) {
    const keys =
      (it.ideal_for as string[] | undefined)?.length
        ? (it.ideal_for as string[])
        : (it.occasions as string[] | undefined)?.length
          ? (it.occasions as string[])
          : ['autre']
    for (const k of keys.slice(0, 1)) {
      if (!byOccasion.has(k)) byOccasion.set(k, [])
      byOccasion.get(k)!.push(it)
    }
  }

  return (
    <>
      <main className="pb-28 lg:pb-12">
        <section className="border-b border-line bg-surface">
          <div className="mx-auto max-w-pop px-5 py-10 lg:py-14">
            <nav className="text-[12px] font-medium text-muted">
              <Link
                href={`/pop/${city}`}
                className="text-ink-soft no-underline hover:underline"
              >
                Pops
              </Link>
              <span className="mx-2 text-line-strong">/</span>
              <span className="font-semibold text-ink">{label}</span>
            </nav>
            <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-brand text-primary-600">
                  Waypop · {label}
                </p>
                <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
                  Que faire à {label} le week-end
                </h1>
                <p className="mt-4 text-base leading-relaxed text-muted">
                  Des Pops choisis : première fois, en amoureux, petit budget…
                  Prix depuis ta ville de départ.
                </p>
              </div>
              <div className="hidden lg:block min-h-[21rem]">
                <Suspense
                  fallback={
                    <div className="min-h-[21rem] animate-pulse rounded-2xl bg-night/90" />
                  }
                >
                  <PriceIsland
                    destCity={city}
                    cityLabel={label}
                    stopCount={list.length}
                  />
                </Suspense>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-pop space-y-14 px-5 py-12">
          <div className="lg:hidden min-h-[21rem]">
            <Suspense
              fallback={
                <div className="min-h-[21rem] animate-pulse rounded-2xl bg-night/90" />
              }
            >
              <PriceIsland
                destCity={city}
                cityLabel={label}
                stopCount={list.length}
              />
            </Suspense>
          </div>

          {[...byOccasion.entries()].map(([occ, rows], idx) => {
            const occLabel =
              ITINERARY_OCCASION_LABELS[occ as ItineraryOccasion] ||
              (occ === 'autre' ? 'Tous les Pops' : occ)
            return (
              <section key={occ} className="space-y-6">
                {idx > 0 ? <WpRule /> : null}
                <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                  {occLabel}
                </h2>
                <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map((it) => (
                    <li key={it.id}>
                      <WpPopCard
                        href={`/pop/${city}/${encodeURIComponent(it.slug || it.id)}`}
                        title={sanitizeUserFacingText(it.title) || it.title}
                        subtitle={
                          it.subtitle
                            ? sanitizeUserFacingText(it.subtitle)
                            : null
                        }
                        image={it.cover_image}
                        citySlug={city}
                        fallbackLabel={label}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}

          {!list.length ? (
            <p className="text-sm text-muted">Aucun Pop publié pour {label}.</p>
          ) : null}
        </div>
      </main>
      <div className="lg:hidden min-h-[4.5rem]">
        <Suspense fallback={<div className="min-h-[4.5rem]" />}>
          <PriceIsland
            destCity={city}
            cityLabel={label}
            stopCount={list.length}
            variant="bar"
          />
        </Suspense>
      </div>
      <PopFooter />
    </>
  )
}
