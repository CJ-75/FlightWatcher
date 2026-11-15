import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const expected = (process.env.POP_REVALIDATE_SECRET || '').trim()
  const got = (req.headers.get('x-revalidate-secret') || '').trim()
  if (expected && got !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: { city?: string; slug?: string } = {}
  try {
    body = (await req.json()) as { city?: string; slug?: string }
  } catch {
    body = {}
  }

  const city = String(body.city || '')
    .trim()
    .toLowerCase()
  const slug = String(body.slug || '')
    .trim()
    .toLowerCase()

  const tags: string[] = []
  if (slug) {
    tags.push(`pop-slug:${slug}`)
    revalidateTag(`pop-slug:${slug}`)
  }
  if (city) {
    tags.push(`pop-city:${city}`)
    revalidateTag(`pop-city:${city}`)
    tags.push(`pop-city-index:${city}`)
    revalidateTag(`pop-city-index:${city}`)
  }
  revalidateTag('pop-sitemap')
  tags.push('pop-sitemap')
  if (!tags.length) {
    revalidateTag('pop-all')
    tags.push('pop-all')
  }

  return NextResponse.json({ ok: true, revalidated: tags })
}
