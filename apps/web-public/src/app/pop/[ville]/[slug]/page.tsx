import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  citySlugDisplayNameFr,
  evaluatePopIndexability,
  sanitizeUserFacingText,
} from '@waypop/shared'
import { fetchPublishedBySlug } from '@/lib/parcoursApi'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'

type Props = { params: Promise<{ ville: string; slug: string }> }

async function loadPop(ville: string, slug: string) {
  const city = decodeURIComponent(ville).toLowerCase()
  const s = decodeURIComponent(slug).toLowerCase()
  const itin = await fetchPublishedBySlug(s)
  if (!itin || itin.is_demo) return null
  if (itin.city_slug && String(itin.city_slug).toLowerCase() !== city) {
    return null
  }
  return { itin, city }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ville, slug } = await params
  const loaded = await loadPop(ville, slug)
  if (!loaded) return { title: 'Pop introuvable' }
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
  }
}

export default async function PopDetailPage({ params }: Props) {
  const { ville, slug } = await params
  const loaded = await loadPop(ville, slug)
  if (!loaded) notFound()
  const { itin, city } = loaded

  const title = sanitizeUserFacingText(itin.title) || itin.title
  const intro = itin.intro
    ? sanitizeUserFacingText(itin.intro, { multiline: true })
    : ''
  const items = [...(itin.itinerary_items || [])].sort(
    (a, b) => Number(a.day_offset || 0) - Number(b.day_offset || 0),
  )
  const byDay = new Map<number, typeof items>()
  for (const it of items) {
    const d = Number(it.day_offset ?? 0)
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d)!.push(it)
  }
  const days = [...byDay.keys()].sort((a, b) => a - b)
  const cityLabel = citySlugDisplayNameFr(city) || city

  const stopsWithNote = items.filter((i) => String(i.note || '').trim()).length
  const imageCount =
    (itin.cover_image ? 1 : 0) +
    items.filter((i) => String(i.photo || '').trim()).length
  const index = evaluatePopIndexability({
    status: itin.status,
    is_demo: itin.is_demo,
    intro,
    cover_image: itin.cover_image,
    photo_license: itin.photo_license as string | undefined,
    stopCount: items.length,
    stopsWithNote,
    imageCount,
    city_indexable: false,
  })

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 space-y-8">
      <nav className="text-sm text-muted">
        <Link href={`/pop/${city}`} className="no-underline hover:underline">
          Pops
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/pop/${city}`} className="no-underline hover:underline">
          {cityLabel}
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-ink font-semibold line-clamp-1">{title}</span>
      </nav>

      <header className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary-700">
          Pop Waypop
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
          {title}
        </h1>
        {intro ? (
          <p className="text-base text-muted leading-relaxed whitespace-pre-line">
            {intro}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {itin.duration_kind ? (
            <Chip>{String(itin.duration_kind)}</Chip>
          ) : null}
          <Chip>{items.length} stops</Chip>
        </div>
      </header>

      <section className="space-y-6" aria-labelledby="programme">
        <h2 id="programme" className="text-xl font-extrabold text-ink">
          Le programme
        </h2>
        {/* All days in HTML — tabs (Lot 2) only hide/show */}
        {days.map((day) => (
          <div key={day} className="space-y-3">
            <h3 className="text-lg font-bold text-ink">
              Jour {day + 1}
            </h3>
            <ol className="space-y-3">
              {(byDay.get(day) || []).map((step, i) => (
                <li key={step.id || `${day}-${i}`}>
                  <Card className="p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-primary-700">
                      {step.moment || `Stop ${i + 1}`}
                    </p>
                    <p className="mt-1 font-extrabold text-ink">
                      {step.title || 'Étape'}
                    </p>
                    {step.note ? (
                      <p className="mt-2 text-sm text-muted leading-relaxed">
                        {sanitizeUserFacingText(step.note, {
                          multiline: true,
                        })}
                      </p>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      <p className="text-xs text-muted">
        Shell Lot 1 — design Lot 2, SEO Lot 3. Indexable :{' '}
        {index.indexable ? 'oui' : `non (${index.reasons.join(', ')})`}.
      </p>
    </main>
  )
}
