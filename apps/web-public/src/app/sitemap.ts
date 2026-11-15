import type { MetadataRoute } from 'next'
import { fetchSitemapPayload } from '@/lib/parcoursApi'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await fetchSitemapPayload()
  const entries: MetadataRoute.Sitemap = []
  const cities = data.cities || {}

  for (const city of Object.keys(cities).sort()) {
    entries.push({
      url: `https://waypop.co/pop/${city}`,
      changeFrequency: 'weekly',
      priority: 0.7,
    })
    for (const pop of cities[city] || []) {
      entries.push({
        url: `https://waypop.co/pop/${city}/${encodeURIComponent(pop.slug)}`,
        lastModified: pop.lastmod ? new Date(pop.lastmod) : undefined,
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }
  }
  return entries
}
