import type { Metadata } from 'next'
import { fetchPublishedByCity, fetchSitemapPayload } from '@/lib/parcoursApi'
import { LandingHome } from '@/components/landing/LandingHome'
import { filterLandingPops } from '@/lib/landingHelpers'

export const revalidate = 3600

export const metadata: Metadata = {
  title: {
    absolute: 'Week-ends pas chers entre amis, déjà organisés | Waypop',
  },
  description:
    'Week-ends pas chers entre amis : vol + hôtel, Pops jour par jour, alertes prix et Planner de groupe. Cherche un séjour ou télécharge Waypop.',
  alternates: { canonical: 'https://waypop.co/' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Week-ends pas chers entre amis, déjà organisés | Waypop',
    description:
      'Prix, programme, groupe — déjà organisés. Voir les week-ends ou télécharger l’app.',
    url: 'https://waypop.co/',
    type: 'website',
  },
}

async function loadPopsForCities(cities: string[]) {
  const chunks = await Promise.all(
    cities.slice(0, 8).map((c) => fetchPublishedByCity(c).catch(() => [])),
  )
  return chunks.flat()
}

export default async function LandingPage() {
  const sitemap = await fetchSitemapPayload()
  const openCities = (
    sitemap.open_cities || Object.keys(sitemap.cities || {})
  ).filter(Boolean)

  const all = filterLandingPops(await loadPopsForCities(openCities.length ? openCities : ['paris']))
  const featured = all.filter((p) => p.featured === true)
  const pops = (featured.length ? featured : all).slice(0, 3)
  const momentDeals = all
    .filter((p) => !pops.some((x) => x.id === p.id))
    .slice(0, 3)

  /** Cities that actually have at least one published pop */
  const citiesWithPops = [
    ...new Set(
      all.map((p) => String(p.city_slug || '').toLowerCase()).filter(Boolean),
    ),
  ]
  const displayCities =
    citiesWithPops.length > 0
      ? citiesWithPops
      : openCities.filter((c) =>
          Object.keys(sitemap.cities || {}).includes(c),
        )

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'Waypop',
        url: 'https://waypop.co',
        description:
          'Week-ends pas chers entre amis : séjours vol+hôtel, Pops et Planner.',
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
        openCities={displayCities.slice(0, 6)}
        momentDeals={momentDeals}
      />
    </>
  )
}
