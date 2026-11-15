import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { citySlugDisplayNameFr } from '@waypop/shared'
import {
  fetchPublishedByCity,
  fetchPublishedBySlug,
  fetchSlugRedirect,
} from '@/lib/parcoursApi'
import { assessPopIndex, popSeoCopy } from '@/lib/popSeoPage'
import { PopPageView } from '@/components/pop/PopPageView'

type Props = {
  params: Promise<{ ville: string; slug: string }>
}

export const revalidate = 86400

async function loadPop(ville: string, slug: string) {
  const city = decodeURIComponent(ville).toLowerCase()
  const s = decodeURIComponent(slug).toLowerCase()
  const itin = await fetchPublishedBySlug(s)
  if (!itin || itin.is_demo) {
    const redir = await fetchSlugRedirect(city, s)
    if (redir?.slug) {
      permanentRedirect(
        `/pop/${encodeURIComponent(redir.city_slug)}/${encodeURIComponent(redir.slug)}`,
      )
    }
    return null
  }
  if (itin.status === 'retired') return { retired: true as const, city, slug: s }
  const liveCity = String(itin.city_slug || city).toLowerCase()
  const liveSlug = String(itin.slug || s).toLowerCase()
  if (liveCity !== city || liveSlug !== s) {
    permanentRedirect(
      `/pop/${encodeURIComponent(liveCity)}/${encodeURIComponent(liveSlug)}`,
    )
  }
  return { itin, city: liveCity, retired: false as const }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ville, slug } = await params
  const loaded = await loadPop(ville, slug)
  if (!loaded || loaded.retired || !('itin' in loaded) || !loaded.itin) {
    return { title: 'Pop introuvable', robots: { index: false, follow: true } }
  }
  const { itin, city } = loaded
  const cityLabel = citySlugDisplayNameFr(city) || city
  const copy = popSeoCopy(itin, cityLabel)
  const index = await assessPopIndex(itin, city)
  const canonicalSlug = String(itin.slug || slug)
  const canonical = `https://waypop.co/pop/${city}/${encodeURIComponent(canonicalSlug)}`

  return {
    title: { absolute: copy.documentTitle },
    description: copy.description,
    robots: index.indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    alternates: { canonical },
    openGraph: {
      title: copy.h1,
      description: copy.description,
      url: canonical,
      type: 'article',
      images: itin.cover_image
        ? [{ url: itin.cover_image, width: 1200, height: 630 }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.h1,
      description: copy.description,
    },
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

  const index = await assessPopIndex(itin, city)
  const related = (await fetchPublishedByCity(city))
    .filter((r) => r.id !== itin.id && r.slug)
    .slice(0, 6)

  return (
    <PopPageView
      itin={itin}
      city={city}
      slug={slug}
      index={index}
      related={related}
    />
  )
}
