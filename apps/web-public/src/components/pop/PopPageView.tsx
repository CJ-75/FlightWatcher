import Link from 'next/link'
import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import {
  buildItineraryMapsUrl,
  citySlugDisplayNameFr,
  ITINERARY_OCCASION_LABELS,
  sanitizeUserFacingText,
  type ItineraryOccasion,
  type PopIndexResult,
} from '@waypop/shared'
import type { PublicItinerary } from '@/lib/parcoursApi'
import { popSeoCopy } from '@/lib/popSeoPage'
import { PopFooter } from '@/components/pop/PopFooter'
import { PopJsonLd } from '@/components/pop/JsonLd'
import { PopImage } from '@/components/pop/PopImage'
import { ShareButton } from '@/components/pop/ShareButton'
import { Chip } from '@/components/ui/Chip'
import { Card } from '@/components/ui/Card'
import {
  cityFallbackStyle,
  PACE_LABEL,
  parseFaq,
  parseStay,
  parseTips,
} from '@/lib/popHelpers'

const DayProgramme = dynamic(
  () =>
    import('@/components/pop/DayProgramme').then((m) => m.DayProgramme),
  {
    loading: () => (
      <div className="min-h-[16rem] animate-pulse rounded-card bg-white/60" />
    ),
  },
)
const PriceIsland = dynamic(
  () => import('@/components/pop/PriceIsland').then((m) => m.PriceIsland),
  {
    loading: () => (
      <div className="min-h-[22rem] rounded-card bg-ink/90 animate-pulse" />
    ),
  },
)

type Props = {
  itin: PublicItinerary
  city: string
  slug: string
  index: PopIndexResult
  related?: PublicItinerary[]
  /** Hide live price island (edge/poor fixtures) */
  showPrice?: boolean
}

export function PopPageView({
  itin,
  city,
  slug,
  index,
  related = [],
  showPrice = true,
}: Props) {
  const cityLabel = citySlugDisplayNameFr(city) || city
  const seo = popSeoCopy(itin, cityLabel)
  const h1 = sanitizeUserFacingText(seo.h1) || seo.h1
  const title = sanitizeUserFacingText(itin.title) || itin.title
  const intro = itin.intro
    ? sanitizeUserFacingText(itin.intro, { multiline: true })
    : ''
  const canonicalPath = `/pop/${city}/${encodeURIComponent(String(itin.slug || slug))}`
  const items = [...(itin.itinerary_items || [])].sort(
    (a, b) =>
      Number(a.day_offset || 0) - Number(b.day_offset || 0) ||
      Number(a.position || 0) - Number(b.position || 0),
  )
  const byDay = new Map<number, typeof items>()
  for (const it of items) {
    const d = Number(it.day_offset ?? 0)
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d)!.push(it)
  }
  const days = [...byDay.keys()]
    .sort((a, b) => a - b)
    .map((day) => ({ day, items: byDay.get(day) || [] }))

  const durationLabel = seo.durationLabel
  const paceLabel =
    itin.pace && (PACE_LABEL[String(itin.pace)] || String(itin.pace))
  const ideal =
    (itin.ideal_for as string[] | undefined)?.length
      ? (itin.ideal_for as string[])
      : (itin.occasions as string[] | undefined) || []

  const infoCells: { label: string; value: string }[] = []
  if (durationLabel) infoCells.push({ label: 'Durée', value: durationLabel })
  if (itin.budget_estimate_eur && Number(itin.budget_estimate_eur) > 0) {
    infoCells.push({
      label: 'Budget sur place',
      value: `≈ ${Math.round(Number(itin.budget_estimate_eur))} €`,
    })
  }
  if (paceLabel) infoCells.push({ label: 'Rythme', value: paceLabel })
  if (ideal.length) {
    const labels = ideal
      .slice(0, 3)
      .map(
        (o) => ITINERARY_OCCASION_LABELS[o as ItineraryOccasion] || String(o),
      )
    infoCells.push({ label: 'Idéal pour', value: labels.join(', ') })
  }

  const stay = parseStay(itin.stay)
  const tips = parseTips(itin.tips)
  const faq = parseFaq(itin.faq)
  const verified =
    itin.verified_at &&
    (() => {
      try {
        return new Date(String(itin.verified_at)).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      } catch {
        return null
      }
    })()

  const mapsUrl = buildItineraryMapsUrl(items as never)
  const launchHref = `/parcours/${encodeURIComponent(itin.slug || slug)}`
  const transport = (itin.transport_modes as string[] | undefined) || []

  return (
    <>
      <PopJsonLd
        itin={itin}
        city={city}
        cityLabel={cityLabel}
        h1={h1}
        description={seo.description}
        canonicalPath={canonicalPath}
      />
      <main className="pb-28 lg:pb-12">
        <section className="relative">
          {itin.cover_image ? (
            <PopImage src={itin.cover_image} alt="" variant="hero" />
          ) : (
            <div
              className="flex h-[42vh] min-h-[220px] max-h-[420px] w-full flex-col items-center justify-center gap-2 px-6 text-center text-white sm:h-[48vh]"
              style={cityFallbackStyle(
                itin.color_key as string | undefined,
                city,
              )}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
                Waypop
              </p>
              <p className="text-2xl font-extrabold tracking-tight">{cityLabel}</p>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/20 to-transparent" />

          <div className="relative z-10 mx-auto -mt-24 max-w-6xl px-5 lg:-mt-28">
            <nav className="mb-3 text-sm text-white/85 drop-shadow">
              <Link
                href={`/pop/${city}`}
                className="text-white no-underline hover:underline"
              >
                Pops
              </Link>
              <span className="mx-1.5">›</span>
              <Link
                href={`/pop/${city}`}
                className="text-white no-underline hover:underline"
              >
                {cityLabel}
              </Link>
              <span className="mx-1.5">›</span>
              <span className="font-semibold line-clamp-1">{title}</span>
            </nav>

            <div className="rounded-card bg-white/95 p-5 shadow-lift backdrop-blur-sm sm:p-7">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary-700">
                Pop Waypop
                {verified ? ` · lieux vérifiés le ${verified}` : ''}
              </p>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-4xl break-words">
                {h1}
              </h1>
              {h1 !== title ? (
                <p className="mt-1 text-sm font-semibold text-muted break-words">
                  {title}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {durationLabel ? <Chip>{durationLabel}</Chip> : null}
                <Chip>{items.length} stops</Chip>
                {transport.slice(0, 2).map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
                {ideal.slice(0, 2).map((o) => (
                  <Chip key={o}>
                    {ITINERARY_OCCASION_LABELS[o as ItineraryOccasion] || o}
                  </Chip>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <ShareButton title={h1} />
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto mt-8 grid max-w-6xl gap-10 px-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
          <div className="space-y-10 min-w-0">
            {showPrice ? (
              <div className="lg:hidden min-h-[22rem]">
                <Suspense
                  fallback={
                    <div className="min-h-[22rem] rounded-card bg-ink/90 animate-pulse" />
                  }
                >
                  <PriceIsland
                    destCity={city}
                    cityLabel={cityLabel}
                    stopCount={items.length}
                  />
                </Suspense>
              </div>
            ) : null}

            {intro ? (
              <section aria-labelledby="intro">
                <h2 id="intro" className="sr-only">
                  Introduction
                </h2>
                <p className="text-base text-muted leading-relaxed whitespace-pre-line">
                  {intro}
                </p>
              </section>
            ) : null}

            {infoCells.length > 0 ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {infoCells.slice(0, 4).map((c) => (
                  <li
                    key={c.label}
                    className="rounded-2xl border border-line bg-white px-3 py-3"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                      {c.label}
                    </p>
                    <p className="mt-1 text-sm font-extrabold text-ink">
                      {c.value}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            <DayProgramme
              days={days}
              mapsUrl={mapsUrl}
              launchHref={launchHref}
            />

            {stay ? (
              <section className="space-y-3" aria-labelledby="stay">
                <h2 id="stay" className="text-xl font-extrabold text-ink">
                  Où dormir
                </h2>
                <Card className="p-5 space-y-2">
                  {stay.area ? (
                    <p className="font-extrabold text-ink">{stay.area}</p>
                  ) : null}
                  {stay.vibe ? (
                    <p className="text-sm text-primary-700 font-bold">
                      {stay.vibe}
                    </p>
                  ) : null}
                  {stay.note ? (
                    <p className="text-sm text-muted leading-relaxed whitespace-pre-line">
                      {sanitizeUserFacingText(stay.note, { multiline: true })}
                    </p>
                  ) : null}
                </Card>
              </section>
            ) : null}

            {tips.length > 0 ? (
              <section className="space-y-3" aria-labelledby="tips">
                <h2 id="tips" className="text-xl font-extrabold text-ink">
                  Bon à savoir
                </h2>
                <ul className="space-y-2">
                  {tips.map((t, i) => (
                    <li
                      key={i}
                      className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink"
                    >
                      {sanitizeUserFacingText(t)}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {faq.length > 0 ? (
              <section className="space-y-3" aria-labelledby="faq">
                <h2 id="faq" className="text-xl font-extrabold text-ink">
                  FAQ
                </h2>
                <div className="space-y-2">
                  {faq.map((item, i) => (
                    <details
                      key={i}
                      className="group rounded-2xl border border-line bg-white px-4 py-3"
                    >
                      <summary className="cursor-pointer list-none font-bold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
                        {sanitizeUserFacingText(item.q)}
                      </summary>
                      <p className="mt-2 text-sm text-muted leading-relaxed whitespace-pre-line">
                        {sanitizeUserFacingText(item.a, { multiline: true })}
                      </p>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}

            {related.length > 0 ? (
              <section className="space-y-3" aria-labelledby="more">
                <h2 id="more" className="text-xl font-extrabold text-ink">
                  D’autres Pops à {cityLabel}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {related.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/pop/${city}/${encodeURIComponent(r.slug || r.id)}`}
                        className="block rounded-card border border-line bg-white p-4 no-underline hover:border-primary-200"
                      >
                        <p className="font-extrabold text-ink line-clamp-2">
                          {sanitizeUserFacingText(r.title) || r.title}
                        </p>
                        {r.subtitle ? (
                          <p className="mt-1 text-sm text-muted line-clamp-2">
                            {sanitizeUserFacingText(r.subtitle)}
                          </p>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-6 space-y-4">
              {showPrice ? (
                <Suspense
                  fallback={
                    <div className="min-h-[22rem] rounded-card bg-ink/90 animate-pulse" />
                  }
                >
                  <PriceIsland
                    destCity={city}
                    cityLabel={cityLabel}
                    stopCount={items.length}
                  />
                </Suspense>
              ) : null}
              <Card className="p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wide text-muted">
                  Sur la carte
                </p>
                <p className="text-sm font-bold text-ink">
                  {items.length} stops · {days.length} jour
                  {days.length > 1 ? 's' : ''}
                </p>
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold no-underline hover:underline"
                  >
                    Ouvrir Maps →
                  </a>
                ) : null}
              </Card>
              <WhatsAppCard cityLabel={cityLabel} />
            </div>
          </aside>
        </div>
      </main>

      {showPrice ? (
        <div className="lg:hidden min-h-[4.25rem]">
          <Suspense fallback={<div className="min-h-[4.25rem]" />}>
            <PriceIsland
              destCity={city}
              cityLabel={cityLabel}
              stopCount={items.length}
              variant="bar"
            />
          </Suspense>
        </div>
      ) : (
        <div className="lg:hidden min-h-[4.25rem]" aria-hidden />
      )}
      <PopFooter />
      {!index.indexable ? (
        <p className="sr-only">noindex: {index.reasons.join(', ')}</p>
      ) : null}
    </>
  )
}

function WhatsAppCard({ cityLabel }: { cityLabel: string }) {
  const href =
    process.env.NEXT_PUBLIC_WHATSAPP_URL ||
    `https://wa.me/?text=${encodeURIComponent(`Pop ${cityLabel} — waypop.co`)}`
  return (
    <Card className="border-primary-100 bg-primary-50/60 p-4 space-y-2">
      <p className="text-sm font-extrabold text-ink">Une question ?</p>
      <p className="text-xs text-muted">
        Écris-nous sur WhatsApp — on répond vite.
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex text-sm font-bold no-underline hover:underline"
      >
        WhatsApp →
      </a>
    </Card>
  )
}
