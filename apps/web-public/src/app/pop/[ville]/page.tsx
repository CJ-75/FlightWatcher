import Link from 'next/link'
import type { Metadata } from 'next'
import {
  citySlugDisplayNameFr,
  ITINERARY_OCCASION_LABELS,
  sanitizeUserFacingText,
  type ItineraryOccasion,
} from '@waypop/shared'
import { fetchPublishedByCity } from '@/lib/parcoursApi'
import { PopFooter } from '@/components/pop/PopFooter'
import { PopImage } from '@/components/pop/PopImage'
import { PriceIsland } from '@/components/pop/PriceIsland'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'

export const revalidate = 86400

type Props = { params: Promise<{ ville: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ville } = await params
  const city = decodeURIComponent(ville).toLowerCase()
  const label = citySlugDisplayNameFr(city) || city
  const title = `Que faire à ${label} le week-end | Waypop`
  const description = `Itinéraires à ${label} : programme jour par jour, adresses et idée de prix week-end. Pops Waypop par intention.`
  return {
    title: { absolute: title.length > 60 ? `Que faire à ${label} | Waypop` : title },
    description: description.slice(0, 160),
    alternates: { canonical: `https://waypop.co/pop/${city}` },
    // Hub indexable only when city opened (page can refine later)
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
      <main className="mx-auto max-w-6xl px-5 py-10 space-y-10 pb-28 lg:pb-12">
        <nav className="text-sm text-muted">
          <Link href={`/pop/${city}`} className="no-underline hover:underline">
            Pops
          </Link>
          <span className="mx-1.5">›</span>
          <span className="text-ink font-semibold">{label}</span>
        </nav>

        <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary-700">
              Hub ville
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
              Que faire à {label} le week-end
            </h1>
            <p className="text-muted max-w-xl leading-relaxed">
              Des Pops choisis pour {label} : première fois, en amoureux, petit
              budget… Prix week-end depuis ta ville de départ.
            </p>
          </div>
          <div className="hidden lg:block">
            <PriceIsland
              destCity={city}
              cityLabel={label}
              stopCount={list.length}
            />
          </div>
        </header>

        <div className="lg:hidden">
          <PriceIsland
            destCity={city}
            cityLabel={label}
            stopCount={list.length}
          />
        </div>

        {[...byOccasion.entries()].map(([occ, rows]) => {
          const occLabel =
            ITINERARY_OCCASION_LABELS[occ as ItineraryOccasion] ||
            (occ === 'autre' ? 'Tous les Pops' : occ)
          return (
            <section key={occ} className="space-y-4">
              <h2 className="text-xl font-extrabold text-ink">{occLabel}</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((it) => (
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
                          {label}
                        </div>
                      )}
                      <div className="p-4 space-y-2">
                        <Link
                          href={`/pop/${city}/${encodeURIComponent(it.slug || it.id)}`}
                          className="font-extrabold text-ink no-underline hover:underline line-clamp-2"
                        >
                          {sanitizeUserFacingText(it.title) || it.title}
                        </Link>
                        {it.duration_kind ? (
                          <Chip>{String(it.duration_kind)}</Chip>
                        ) : null}
                        {it.subtitle ? (
                          <p className="text-sm text-muted line-clamp-2">
                            {sanitizeUserFacingText(it.subtitle)}
                          </p>
                        ) : null}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        {!list.length ? (
          <p className="text-sm text-muted">Aucun Pop publié pour {label}.</p>
        ) : null}
      </main>
      <PriceIsland
        destCity={city}
        cityLabel={label}
        stopCount={list.length}
        variant="bar"
        className="lg:hidden"
      />
      <PopFooter />
    </>
  )
}
