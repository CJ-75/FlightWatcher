import Link from 'next/link'
import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import {
  citySlugDisplayNameFr,
  idealLabelFr,
  sanitizeUserFacingText,
  transportLabelFr,
  type PopIndexResult,
} from '@waypop/shared'
import type { PublicItinerary } from '@/lib/parcoursApi'
import { popSeoCopy } from '@/lib/popSeoPage'
import { PopFooter } from '@/components/pop/PopFooter'
import { PopJsonLd } from '@/components/pop/JsonLd'
import { isPublicImageSrc, PopImage } from '@/components/pop/PopImage'
import { KeepButton } from '@/components/pop/KeepButton'
import { ShareButton } from '@/components/pop/ShareButton'
import { LaunchPopCta } from '@/components/pop/LaunchPopCta'
import { PlannerAddCta } from '@/components/pop/PlannerAddCta'
import { PopAuthor } from '@/components/ui/WaypopMark'
import { WpEyebrow } from '@/components/ui/WpEyebrow'
import { WpPopCard } from '@/components/ui/WpPopCard'
import { WpRule } from '@/components/ui/WpRule'
import { WpTag } from '@/components/ui/WpTag'
import {
  cityFallbackStyle,
  PACE_LABEL,
  parseFaq,
  parseStay,
  parseTips,
} from '@/lib/popHelpers'
import { assertUniquePagePhotos } from '@/lib/popPhotos'

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
  /** Prefixe liens related — fixtures: /dev/pop-fixtures */
  relatedHrefBase?: string
}

export function PopPageView({
  itin,
  city,
  slug,
  index,
  related = [],
  showPrice = true,
  relatedHrefBase,
}: Props) {
  const cityLabel = citySlugDisplayNameFr(city) || city
  const seo = popSeoCopy(itin, cityLabel)
  const h1 =
    sanitizeUserFacingText(seo.h1) ||
    sanitizeUserFacingText(itin.title) ||
    seo.h1
  const promise =
    itin.subtitle &&
    sanitizeUserFacingText(itin.subtitle) &&
    sanitizeUserFacingText(itin.subtitle) !== h1
      ? sanitizeUserFacingText(itin.subtitle)
      : null
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
  const idealRaw =
    (itin.ideal_for as string[] | undefined)?.length
      ? (itin.ideal_for as string[])
      : (itin.occasions as string[] | undefined) || []
  /** One intention only */
  const idealOne = idealRaw[0] ? idealLabelFr(idealRaw[0]) : null

  const facts: { label: string; value: string }[] = []
  if (durationLabel) facts.push({ label: 'Durée', value: durationLabel })
  if (itin.budget_estimate_eur && Number(itin.budget_estimate_eur) > 0) {
    facts.push({
      label: 'Budget',
      value: `≈ ${Math.round(Number(itin.budget_estimate_eur))} € / jour (estimé)`,
    })
  }
  if (paceLabel) facts.push({ label: 'Rythme', value: paceLabel })
  if (idealOne) facts.push({ label: 'Idéal', value: idealOne })

  const stay = parseStay(itin.stay)
  const tips = parseTips(itin.tips)
  const faq = parseFaq(itin.faq)

  const launchHref = `/parcours/${encodeURIComponent(itin.slug || slug)}`
  const transport = (itin.transport_modes as string[] | undefined) || []
  const metaBits = [
    durationLabel,
    `${items.length} stops`,
    ...transport.slice(0, 1).map((t) => transportLabelFr(t)),
    idealOne,
  ].filter(Boolean)

  const dayCount = days.length || 1
  const h2Programme =
    dayCount === 1
      ? `Programme d’une journée à ${cityLabel}`
      : `Programme de ${dayCount} jours à ${cityLabel}`
  const h2Stay = idealOne
    ? `Où dormir à ${cityLabel} pour une ${idealOne.toLowerCase()}`
    : `Où dormir à ${cityLabel}`
  const h2Faq = `Questions fréquentes sur un week-end à ${cityLabel}`

  const photoCheck = assertUniquePagePhotos([
    itin.cover_image,
    ...items.map((it) => it.photo),
  ])

  const shareUrl =
    typeof process.env.NEXT_PUBLIC_SITE_URL === 'string'
      ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}${canonicalPath}`
      : `https://waypop.co${canonicalPath}`

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

      {/* Hero photo plein cadre — CTAs noirs, peu de boutons */}
      <header className="relative isolate overflow-hidden bg-night">
        {isPublicImageSrc(itin.cover_image) ? (
          <div className="absolute inset-0">
            <PopImage src={itin.cover_image!} alt="" variant="hero" fill />
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

        <div className="relative z-10 mx-auto flex max-w-pop flex-col justify-end px-5 pb-5 pt-14 sm:pb-12 sm:pt-24">
          <nav className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-white/70 sm:mb-4 sm:text-[12px]">
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
            <span aria-hidden>/</span>
            <span className="line-clamp-1 text-white/90">{h1}</span>
          </nav>

          <PopAuthor authorKind={itin.author_kind as string | undefined} />
          <h1 className="mt-1 max-w-3xl text-[1.35rem] font-extrabold leading-[1.18] tracking-tight text-white sm:mt-3 sm:text-4xl lg:text-[2.75rem]">
            {h1}
          </h1>
          {promise ? (
            <p className="mt-1.5 line-clamp-2 max-w-2xl text-sm font-medium text-white/75 sm:mt-2 sm:line-clamp-none">
              {promise}
            </p>
          ) : null}

          {metaBits.length > 0 ? (
            <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold text-white/80 sm:mt-4 sm:text-[13px]">
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

          <div className="mt-5 flex flex-wrap items-center gap-2.5 sm:mt-8 sm:gap-3">
            <PlannerAddCta
              href={`/sejours?dest=${encodeURIComponent(city)}`}
              variant="ink"
            />
            <LaunchPopCta href={launchHref} variant="hero" />
            <ShareButton title={h1} variant="icon" />
            <KeepButton
              city={city}
              slug={String(itin.slug || slug)}
              title={h1}
              variant="icon"
            />
          </div>
        </div>
      </header>

      {/* Zone pêche sous le hero (prix + contenu) */}
      <main className="bg-[#FFF9F5] pb-36 lg:pb-16">
        <div className="mx-auto grid max-w-pop gap-12 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-14 lg:py-14">
          {/* flex+gap (not space-y): lg:hidden PriceIsland must not push intro below sidebar top */}
          <div className="flex min-w-0 flex-col gap-12">
            {showPrice ? (
              <div className="lg:hidden">
                <Suspense
                  fallback={
                    <div className="min-h-[21rem] animate-pulse rounded-2xl bg-night/90" />
                  }
                >
                  <PriceIsland
                    destCity={city}
                    cityLabel={cityLabel}
                    stopCount={items.length}
                    dayCount={dayCount}
                    shareUrl={shareUrl}
                    shareTitle={h1}
                  />
                </Suspense>
              </div>
            ) : null}

            {intro ? (
              <section>
                <h2 className="sr-only">Introduction</h2>
                <p className="text-[1.05rem] leading-[1.7] text-ink-soft whitespace-pre-line">
                  {intro}
                </p>
              </section>
            ) : null}

            {facts.length > 0 ? (
              <dl className="flex flex-wrap gap-x-8 gap-y-5 pr-1 sm:flex-nowrap sm:justify-between sm:gap-x-6">
                {facts.slice(0, 4).map((f) => (
                  <div
                    key={f.label}
                    className="min-w-0 shrink-0 overflow-visible sm:max-w-[28%]"
                  >
                    <dt>
                      <WpTag>{f.label}</WpTag>
                    </dt>
                    <dd className="mt-1.5 pr-1.5 text-sm font-bold text-ink">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <WpRule />

            <DayProgramme
              days={days}
              launchHref={launchHref}
              cityLabel={cityLabel}
              colorKey={itin.color_key}
              city={city}
              coverImage={itin.cover_image}
              h2={h2Programme}
            />

            {stay ? (
              <section className="space-y-4">
                <WpEyebrow>Hébergement</WpEyebrow>
                <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                  {h2Stay}
                </h2>
                <div className="border-l-2 border-primary-500/80 pl-5">
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
                <WpEyebrow>Conseils</WpEyebrow>
                <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                  Bon à savoir
                </h2>
                <ul className="space-y-3">
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
                <WpEyebrow>Questions</WpEyebrow>
                <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                  {h2Faq}
                </h2>
                <div className="divide-y divide-line border-y border-line">
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

            <section className="space-y-5">
              <WpEyebrow>Continuer</WpEyebrow>
              <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                D’autres Pops à {cityLabel}
              </h2>
              {related.length > 0 ? (
                <ul className="grid gap-6 sm:grid-cols-2">
                  {related.map((r) => (
                    <li key={r.id}>
                      <WpPopCard
                        href={
                          relatedHrefBase
                            ? `${relatedHrefBase.replace(/\/$/, '')}/${encodeURIComponent(String(r.slug || r.id))}`
                            : `/pop/${city}/${encodeURIComponent(String(r.slug || r.id))}`
                        }
                        title={sanitizeUserFacingText(r.title) || r.title}
                        subtitle={
                          r.subtitle
                            ? sanitizeUserFacingText(r.subtitle)
                            : null
                        }
                        image={r.cover_image}
                        citySlug={String(r.city_slug || city)}
                        fallbackLabel={cityLabel}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">
                  D’autres Pops arrivent bientôt — explore{' '}
                  <Link href={`/pop/${city}`} className="font-bold">
                    {cityLabel}
                  </Link>
                  .
                </p>
              )}
            </section>
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
                    dayCount={dayCount}
                    shareUrl={shareUrl}
                    shareTitle={h1}
                  />
                </Suspense>
              ) : null}
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
              dayCount={dayCount}
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
      {!photoCheck.ok ? (
        <p className="sr-only">
          photo-dupes: {photoCheck.duplicates.join(', ')}
        </p>
      ) : null}
    </>
  )
}
