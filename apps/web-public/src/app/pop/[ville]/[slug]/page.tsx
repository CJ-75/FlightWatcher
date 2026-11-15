import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  buildItineraryMapsUrl,
  citySlugDisplayNameFr,
  evaluatePopIndexability,
  ITINERARY_DURATION_LABELS,
  ITINERARY_OCCASION_LABELS,
  sanitizeUserFacingText,
  type ItineraryOccasion,
} from '@waypop/shared'
import { fetchPublishedByCity, fetchPublishedBySlug } from '@/lib/parcoursApi'
import { DayProgramme } from '@/components/pop/DayProgramme'
import { PopFooter } from '@/components/pop/PopFooter'
import { PriceIsland } from '@/components/pop/PriceIsland'
import { Chip } from '@/components/ui/Chip'
import { Card } from '@/components/ui/Card'
import {
  cityFallbackStyle,
  PACE_LABEL,
  parseFaq,
  parseStay,
  parseTips,
} from '@/lib/popHelpers'

type Props = {
  params: Promise<{ ville: string; slug: string }>
}

async function loadPop(ville: string, slug: string) {
  const city = decodeURIComponent(ville).toLowerCase()
  const s = decodeURIComponent(slug).toLowerCase()
  const itin = await fetchPublishedBySlug(s)
  if (!itin || itin.is_demo) return null
  if (itin.status === 'retired') return { retired: true as const, city, slug: s }
  if (itin.city_slug && String(itin.city_slug).toLowerCase() !== city) {
    return null
  }
  return { itin, city, retired: false as const }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ville, slug } = await params
  const loaded = await loadPop(ville, slug)
  if (!loaded || loaded.retired || !('itin' in loaded) || !loaded.itin) {
    return { title: 'Pop introuvable', robots: { index: false, follow: true } }
  }
  const { itin } = loaded
  const title = sanitizeUserFacingText(itin.title) || itin.title
  const intro = String(itin.intro || '')
  const items = itin.itinerary_items || []
  const index = evaluatePopIndexability({
    status: itin.status,
    is_demo: itin.is_demo,
    intro,
    cover_image: itin.cover_image,
    photo_license: itin.photo_license as string | undefined,
    stopCount: items.length,
    stopsWithNote: items.filter((i) => String(i.note || '').trim()).length,
    imageCount:
      (itin.cover_image ? 1 : 0) +
      items.filter((i) => String(i.photo || '').trim()).length,
    city_indexable: false,
    verified_at: itin.verified_at as string | undefined,
  })
  return {
    title,
    description: intro.slice(0, 160) || undefined,
    robots: index.indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    alternates: {
      canonical: `https://waypop.co/pop/${loaded.city}/${encodeURIComponent(itin.slug || slug)}`,
    },
    openGraph: itin.cover_image
      ? { images: [{ url: itin.cover_image }] }
      : undefined,
  }
}

export default async function PopDetailPage({ params }: Props) {
  const { ville, slug } = await params
  const loaded = await loadPop(ville, slug)
  if (!loaded) notFound()
  if (loaded.retired) {
    return (
      <main className="mx-auto max-w-xl px-5 py-24 text-center space-y-3">
        <h1 className="text-2xl font-extrabold text-ink">Pop retiré</h1>
        <p className="text-muted text-sm">
          Ce Pop n’est plus publié. Découvre d’autres idées à{' '}
          <Link href={`/pop/${loaded.city}`}>{loaded.city}</Link>.
        </p>
      </main>
    )
  }
  const { itin, city } = loaded
  if (!itin) notFound()

  const title = sanitizeUserFacingText(itin.title) || itin.title
  const intro = itin.intro
    ? sanitizeUserFacingText(itin.intro, { multiline: true })
    : ''
  const items = [...(itin.itinerary_items || [])].sort(
    (a, b) =>
      Number(a.day_offset || 0) - Number(b.day_offset || 0) ||
      Number((a as { position?: number }).position || 0) -
        Number((b as { position?: number }).position || 0),
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
  const cityLabel = citySlugDisplayNameFr(city) || city

  const durationLabel =
    itin.duration_kind &&
    (ITINERARY_DURATION_LABELS[
      itin.duration_kind as keyof typeof ITINERARY_DURATION_LABELS
    ] ||
      String(itin.duration_kind))

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
        (o) =>
          ITINERARY_OCCASION_LABELS[o as ItineraryOccasion] || String(o),
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
  const related = (await fetchPublishedByCity(city))
    .filter((r) => r.id !== itin.id && r.slug)
    .slice(0, 6)

  const transport = (itin.transport_modes as string[] | undefined) || []

  return (
    <>
      <main className="pb-28 lg:pb-12">
        {/* Hero */}
        <section className="relative">
          {itin.cover_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={itin.cover_image}
              alt=""
              className="h-[42vh] min-h-[220px] max-h-[420px] w-full object-cover sm:h-[48vh]"
            />
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
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-4xl">
                {title}
              </h1>
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
                <ButtonShare title={title} />
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto mt-8 grid max-w-6xl gap-10 px-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
          <div className="space-y-10 min-w-0">
            {/* Mobile price under hero */}
            <div className="lg:hidden">
              <PriceIsland
                destCity={city}
                cityLabel={cityLabel}
                stopCount={items.length}
              />
            </div>

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

          {/* Desktop sticky column */}
          <aside className="hidden lg:block">
            <div className="sticky top-6 space-y-4">
              <PriceIsland
                destCity={city}
                cityLabel={cityLabel}
                stopCount={items.length}
              />
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

      <PriceIsland
        destCity={city}
        cityLabel={cityLabel}
        stopCount={items.length}
        variant="bar"
        className="lg:hidden"
      />
      <PopFooter />
    </>
  )
}

function ButtonShare({ title }: { title: string }) {
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(title + ' — waypop.co')}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink no-underline hover:bg-primary-50"
    >
      Partager
    </a>
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
