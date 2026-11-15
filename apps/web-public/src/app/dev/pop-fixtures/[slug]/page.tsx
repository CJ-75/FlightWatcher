import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  citySlugDisplayNameFr,
  evaluatePopIndexability,
  hasTravelTimesInItems,
  tipsPerDayOk,
} from '@waypop/shared'
import { getFixture, FIXTURE_SLUGS } from '@/fixtures/popFixtures'
import { popSeoCopy } from '@/lib/popSeoPage'
import { PopPageView } from '@/components/pop/PopPageView'

type Props = { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'

export function generateStaticParams() {
  return FIXTURE_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const itin = getFixture(slug)
  if (!itin) return { title: 'Fixture', robots: { index: false, follow: false } }
  const city = String(itin.city_slug || 'paris')
  const copy = popSeoCopy(itin, citySlugDisplayNameFr(city) || city)
  return {
    title: { absolute: `[fixture] ${copy.documentTitle}` },
    robots: { index: false, follow: false },
  }
}

export default async function FixturePopPage({ params }: Props) {
  const { slug } = await params
  const itin = getFixture(slug)
  if (!itin) notFound()
  const city = String(itin.city_slug || 'paris')
  const items = itin.itinerary_items || []
  const days = new Set(items.map((i) => Number(i.day_offset ?? 0)))
  const index = evaluatePopIndexability({
    status: itin.status,
    is_demo: true,
    intro: itin.intro,
    cover_image: itin.cover_image,
    photo_license: itin.photo_license,
    verified_at: itin.verified_at,
    city_indexable: false,
    stopCount: items.length,
    stopsWithNote: items.filter((i) => String(i.note || '').trim()).length,
    imageCount:
      (itin.cover_image ? 1 : 0) +
      items.filter((i) => String(i.photo || '').trim()).length,
    hasTravelTimes: hasTravelTimesInItems(items),
    tipsPerDayOk: tipsPerDayOk(itin.tips, Math.max(days.size, 1)),
    hasLivePrice: false,
  })

  const related = FIXTURE_SLUGS.filter((s) => s !== slug)
    .map((s) => getFixture(s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .slice(0, 4)

  return (
    <div>
      <div className="border-b border-white/10 bg-night px-4 py-2.5 text-center text-[11px] font-semibold text-night-fg/80">
        Fixture · noindex ·{' '}
        <Link
          href="/dev/pop-edge"
          className="text-night-fg underline underline-offset-2"
        >
          tous les cas
        </Link>
        {' · '}
        indexable={String(index.indexable)}
        {index.reasons.length ? ` (${index.reasons.slice(0, 3).join(', ')})` : ''}
      </div>
      <PopPageView
        itin={itin}
        city={city}
        slug={slug}
        index={index}
        related={related}
        showPrice={slug !== 'fixture-pauvre'}
      />
    </div>
  )
}
