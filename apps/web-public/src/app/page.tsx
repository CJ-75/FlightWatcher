import type { Metadata } from 'next'
import { fetchPublishedByCity, fetchSitemapPayload } from '@/lib/parcoursApi'
import { LandingHome } from '@/components/landing/LandingHome'
import { filterLandingPops } from '@/lib/landingHelpers'

export const revalidate = 3600

export const metadata: Metadata = {
  title: {
    absolute: 'Week-ends pas chers, déjà organisés | Waypop',
  },
  description:
    'Week-ends pas chers : vol + hôtel, Pops jour par jour, alertes prix et Planner. Solo, à deux ou à plusieurs. Cherche un séjour ou télécharge Waypop.',
  alternates: { canonical: 'https://waypop.co/' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Week-ends pas chers, déjà organisés | Waypop',
    description:
      'Prix, programme, Planner — déjà organisés. Voir les week-ends ou télécharger l’app.',
    url: 'https://waypop.co/',
    type: 'website',
  },
}

async function loadPopsForCities(cities: string[]) {
  const chunks = await Promise.all(
    cities.slice(0, 12).map((c) => fetchPublishedByCity(c).catch(() => [])),
  )
  return chunks.flat()
}

export default async function LandingPage() {
  const sitemap = await fetchSitemapPayload()
  const cityMap = sitemap.cities || {}
  const sitemapCities = Object.keys(cityMap).filter(
    (c) => (cityMap[c]?.length || 0) > 0,
  )
  const openCities = (sitemap.open_cities || sitemapCities).filter(Boolean)

  /** Prefer cities that actually appear in the sitemap with pops */
  const citiesForFetch = [
    ...new Set([...(sitemapCities.length ? sitemapCities : openCities), 'paris']),
  ]

  const all = filterLandingPops(await loadPopsForCities(citiesForFetch))
  const featured = all.filter((p) => p.featured === true)
  const pool = featured.length ? featured : all
  const pops = pool.slice(0, 6)

  const popCountByCity: Record<string, number> = {}
  for (const [slug, list] of Object.entries(cityMap)) {
    popCountByCity[slug] = list?.length || 0
  }
  for (const p of all) {
    const c = String(p.city_slug || '').toLowerCase()
    if (!c) continue
    popCountByCity[c] = Math.max(popCountByCity[c] || 0, 1)
  }

  const displayCities = (
    sitemapCities.length
      ? sitemapCities
      : [...new Set(all.map((p) => String(p.city_slug || '').toLowerCase()).filter(Boolean))]
  ).slice(0, 8)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'Waypop',
        url: 'https://waypop.co',
        description:
          'Week-ends pas chers : séjours vol+hôtel, Pops et Planner.',
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
      <LandingHome
        pops={pops}
        openCities={displayCities}
        popCountByCity={popCountByCity}
      />
    </>
  )
}
