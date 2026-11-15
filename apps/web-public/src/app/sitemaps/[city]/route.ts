import { NextResponse } from 'next/server'
import { fetchSitemapPayload } from '@/lib/parcoursApi'

type Ctx = { params: Promise<{ city: string }> }

/** Per-city sitemap — lastmod only from content updates (API). */
export async function GET(_req: Request, ctx: Ctx) {
  const { city: raw } = await ctx.params
  const city = decodeURIComponent(raw).toLowerCase()
  const data = await fetchSitemapPayload()
  const pops = data.cities?.[city] || []

  const urls = pops
    .map((p) => {
      const loc = `https://waypop.co/pop/${city}/${encodeURIComponent(p.slug)}`
      const last = p.lastmod
        ? `<lastmod>${p.lastmod}</lastmod>`
        : ''
      return `<url><loc>${loc}</loc>${last}<changefreq>weekly</changefreq></url>`
    })
    .join('')

  const hub = `<url><loc>https://waypop.co/pop/${city}</loc><changefreq>weekly</changefreq></url>`
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${hub}${urls}</urlset>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
