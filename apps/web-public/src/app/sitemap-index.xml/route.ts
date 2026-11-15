import { NextResponse } from 'next/server'
import { fetchSitemapPayload } from '@/lib/parcoursApi'

/** Sitemap index — one entry per open city. */
export async function GET() {
  const data = await fetchSitemapPayload()
  const cities = Object.keys(data.cities || {}).sort()
  const body = cities
    .map(
      (c) =>
        `<sitemap><loc>https://waypop.co/sitemaps/${encodeURIComponent(c)}</loc></sitemap>`,
    )
    .join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`
  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
