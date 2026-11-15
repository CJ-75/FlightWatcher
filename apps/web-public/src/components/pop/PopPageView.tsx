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
import { WpTag } from '@/components/ui/WpTag'
import { WpRule } from '@/components/ui/WpRule'
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
      <div className="min-h-[16rem] animate-pulse rounded-2xl bg-sand/60" />
    ),
  },
)
const PriceIsland = dynamic(
  () => import('@/components/pop/PriceIsland').then((m) => m.PriceIsland),
  {
    loading: () => (
      <div className="min-h-[21rem] animate-pulse rounded-2xl bg-night/90" />
    ),
  },
)

type Props = {
  itin: PublicItinerary
  city: string
  slug: string
  index: PopIndexResult
  related?: PublicItinerary[]
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

  const facts: { label: string; value: string }[] = []
  if (durationLabel) facts.push({ label: 'Durée', value: durationLabel })
  if (itin.budget_estimate_eur && Number(itin.budget_estimate_eur) > 0) {
    facts.push({
      label: 'Sur place',
      value: `≈ ${Math.round(Number(itin.budget_estimate_eur))} €`,
    })
  }
  if (paceLabel) facts.push({ label: 'Rythme', value: paceLabel })
  if (ideal.length) {
    facts.push({
      label: 'Idéal',
      value: ideal
        .slice(0, 2)
        .map(
          (o) => ITINERARY_OCCASION_LABELS[o as ItineraryOccasion] || String(o),
        )
        .join(', '),
    })
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
  const metaBits = [
    durationLabel,
    `${items.length} stops`,
    ...transport.slice(0, 1),
    ...ideal
      .slice(0, 1)
      .map((o) => ITINERARY_OCCASION_LABELS[o as ItineraryOccasion] || o),
  ].filter(Boolean)

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

      {/* Full-bleed hero */}
      <header className="relative isolate min-h-[min(72vh,560px)] overflow-hidden bg-night">
        {itin.cover_image ? (
          <div className="absolute inset-0">
            <PopImage src={itin.cover_image} alt="" variant="hero" fill />
          </div>
        ) : (
          <div
            className="absolute inset-0"
            style={cityFallbackStyle(
              itin.color_key as string | undefined,
              city,
            )}
          />
        )}
        <div className="wp-mesh absolute inset-0" />

        <div className="relative z-10 mx-auto flex min-h-[min(72vh,560px)] max-w-pop flex-col justify-end px-5 pb-10 pt-24 sm:pb-14 sm:pt-28">
          <nav className="wp-reveal mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-white/70">
            <Link
              href={`/pop/${city}`}
              className="text-white/80 no-underline hover:text-white hover:underline"
            >
              Pops
            </Link>
            <span aria-hidden>/</span>
            <Link
              href={`/pop/${city}`}
              className="text-white/80 no-underline hover:text-white hover:underline"
            >
              {cityLabel}
            </Link>
          </nav>

          <p className="wp-reveal text-[11px] font-semibold uppercase tracking-brand text-white/75">
            Waypop
            {verified ? ` · vérifié le ${verified}` : ''}
          </p>
          <h1 className="wp-reveal-delay mt-3 max-w-3xl text-[1.85rem] font-extrabold leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
            {h1}
          </h1>
          {h1 !== title ? (
            <p className="wp-reveal-delay mt-2 max-w-2xl text-sm font-medium text-white/70">
              {title}
            </p>
          ) : null}

          {metaBits.length > 0 ? (
            <p className="wp-reveal-delay-2 mt-5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-semibold text-white/80">
              {metaBits.map((b, i) => (
                <span key={`${b}-${i}`} className="inline-flex items-center gap-3">
                  {i > 0 ? (
                    <span className="text-white/35" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  {b}
                </span>
              ))}
            </p>
          ) : null}

          <div className="wp-reveal-delay-2 mt-7">
            <ShareButton title={h1} />
          </div>
        </div>
      </header>

      <main className="pb-28 lg:pb-16">
        <div className="mx-auto grid max-w-pop gap-12 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-14 lg:py-14">
          <div className="min-w-0 space-y-12">
            {showPrice ? (
              <div className="lg:hidden min-h-[21rem]">
                <Suspense
                  fallback={
                    <div className="min-h-[21rem] animate-pulse rounded-2xl bg-night/90" />
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
              <section className="max-w-2xl">
                <h2 className="sr-only">Introduction</h2>
                <p className="text-[1.05rem] leading-[1.7] text-ink-soft whitespace-pre-line">
                  {intro}
                </p>
              </section>
            ) : null}

            {facts.length > 0 ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                {facts.slice(0, 4).map((f) => (
                  <div key={f.label}>
                    <dt>
                      <WpTag>{f.label}</WpTag>
                    </dt>
                    <dd className="mt-1.5 text-sm font-bold text-ink">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <WpRule />

            <DayProgramme
              days={days}
              mapsUrl={mapsUrl}
              launchHref={launchHref}
            />

            {stay ? (
              <section className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-600">
                  Hébergement
                </p>
                <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                  Où dormir
                </h2>
                <div className="max-w-2xl border-l-2 border-primary-500/80 pl-5">
                  {stay.area ? (
                    <p className="text-lg font-extrabold text-ink">{stay.area}</p>
                  ) : null}
                  {stay.vibe ? (
                    <p className="mt-1 text-sm font-semibold text-primary-600">
                      {stay.vibe}
                    </p>
                  ) : null}
                  {stay.note ? (
                    <p className="mt-3 text-[15px] leading-relaxed text-ink-soft whitespace-pre-line">
                      {sanitizeUserFacingText(stay.note, { multiline: true })}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {tips.length > 0 ? (
              <section className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-600">
                  Conseils
                </p>
                <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                  Bon à savoir
                </h2>
                <ul className="max-w-2xl space-y-3">
                  {tips.map((t, i) => (
                    <li
                      key={i}
                      className="flex gap-3 text-[15px] leading-relaxed text-ink-soft"
                    >
                      <span
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500"
                        aria-hidden
                      />
                      <span>{sanitizeUserFacingText(t)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {faq.length > 0 ? (
              <section className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-600">
                  Questions
                </p>
                <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                  FAQ
                </h2>
                <div className="max-w-2xl divide-y divide-line border-y border-line">
                  {faq.map((item, i) => (
                    <details key={i} className="group py-4">
                      <summary className="cursor-pointer list-none font-bold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center justify-between gap-4">
                          {sanitizeUserFacingText(item.q)}
                          <span
                            className="text-muted transition-transform group-open:rotate-45"
                            aria-hidden
                          >
                            +
                          </span>
                        </span>
                      </summary>
                      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft whitespace-pre-line">
                        {sanitizeUserFacingText(item.a, { multiline: true })}
                      </p>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}

            {related.length > 0 ? (
              <section className="space-y-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-600">
                  Continuer
                </p>
                <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                  D’autres Pops à {cityLabel}
                </h2>
                <ul className="grid gap-6 sm:grid-cols-2">
                  {related.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/pop/${city}/${encodeURIComponent(r.slug || r.id)}`}
                        className="group block no-underline"
                      >
                        {r.cover_image ? (
                          <div className="overflow-hidden rounded-2xl">
                            <PopImage
                              src={r.cover_image}
                              alt=""
                              variant="card"
                              className="transition-transform duration-500 group-hover:scale-[1.03]"
                            />
                          </div>
                        ) : (
                          <div className="flex h-36 items-center justify-center rounded-2xl bg-night text-sm font-bold text-night-fg">
                            {cityLabel}
                          </div>
                        )}
                        <p className="mt-3 text-base font-extrabold tracking-tight text-ink group-hover:underline">
                          {sanitizeUserFacingText(r.title) || r.title}
                        </p>
                        {r.subtitle ? (
                          <p className="mt-1 line-clamp-2 text-sm text-muted">
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
            <div className="sticky top-8 space-y-5">
              {showPrice ? (
                <Suspense
                  fallback={
                    <div className="min-h-[21rem] animate-pulse rounded-2xl bg-night/90" />
                  }
                >
                  <PriceIsland
                    destCity={city}
                    cityLabel={cityLabel}
                    stopCount={items.length}
                  />
                </Suspense>
              ) : null}
              <div className="rounded-2xl border border-line bg-surface px-5 py-4">
                <WpTag>Sur place</WpTag>
                <p className="mt-2 text-sm font-bold text-ink">
                  {items.length} stops · {days.length} jour
                  {days.length > 1 ? 's' : ''}
                </p>
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-sm font-bold no-underline hover:underline"
                  >
                    Ouvrir Maps →
                  </a>
                ) : null}
              </div>
              <WhatsAppCard cityLabel={cityLabel} />
            </div>
          </aside>
        </div>
      </main>

      {showPrice ? (
        <div className="lg:hidden min-h-[4.5rem]">
          <Suspense fallback={<div className="min-h-[4.5rem]" />}>
            <PriceIsland
              destCity={city}
              cityLabel={cityLabel}
              stopCount={items.length}
              variant="bar"
            />
          </Suspense>
        </div>
      ) : (
        <div className="lg:hidden min-h-[4.5rem]" aria-hidden />
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
    <div className="rounded-2xl bg-sand/80 px-5 py-4">
      <p className="text-sm font-extrabold text-ink">Une question ?</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Écris-nous sur WhatsApp — réponse rapide.
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-sm font-bold no-underline hover:underline"
      >
        WhatsApp →
      </a>
    </div>
  )
}
