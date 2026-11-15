/** Content via Render API (service_role stays on API — no anon RLS yet). */

function apiBase(): string {
  return (
    process.env.WAYPOP_API_URL ||
    process.env.NEXT_PUBLIC_WAYPOP_API_URL ||
    'https://api.waypop.co'
  ).replace(/\/$/, '')
}

export type PublicItinerary = {
  id: string
  slug?: string | null
  title: string
  subtitle?: string | null
  intro?: string | null
  cover_image?: string | null
  city_slug?: string | null
  status?: string
  is_demo?: boolean
  duration_kind?: string | null
  occasions?: string[]
  budget_estimate_eur?: number | null
  photo_license?: string | null
  verified_at?: string | null
  pace?: string | null
  transport_modes?: string[] | null
  ideal_for?: string[] | null
  faq?: unknown
  tips?: unknown
  stay?: unknown
  color_key?: string | null
  target_query?: string | null
  featured?: boolean
  indexable_override?: boolean | null
  canonical_itinerary_id?: string | null
  itinerary_items?: Array<{
    id?: string
    title?: string | null
    note?: string | null
    photo?: string | null
    place_id?: string | null
    photo_source?: string | null
    photo_license?: string | null
    photo_author?: string | null
    day_offset?: number | null
    moment?: string | null
    kind?: string | null
    position?: number | null
    meta?: {
      maps_url?: string
      lat?: number
      lng?: number
      travel_minutes?: number
      [key: string]: unknown
    } | null
    places?: {
      name?: string
      meta?: Record<string, unknown> | null
    } | null
  }>
  [key: string]: unknown
}

export async function fetchPublishedBySlug(
  slug: string,
): Promise<PublicItinerary | null> {
  const res = await fetch(
    `${apiBase()}/api/parcours/by-slug/${encodeURIComponent(slug)}`,
    { next: { tags: [`pop-slug:${slug}`], revalidate: 86400 } },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`parcours ${res.status}`)
  const data = (await res.json()) as { ok?: boolean; itinerary?: PublicItinerary }
  return data.itinerary || null
}

export async function fetchPublishedByCity(
  city: string,
): Promise<PublicItinerary[]> {
  const res = await fetch(
    `${apiBase()}/api/parcours?city=${encodeURIComponent(city)}&limit=50`,
    { next: { tags: [`pop-city:${city}`], revalidate: 86400 } },
  )
  if (!res.ok) return []
  const data = (await res.json()) as {
    ok?: boolean
    itineraries?: PublicItinerary[]
  }
  return data.itineraries || []
}

export async function fetchCityIndexable(city: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${apiBase()}/api/pop/city-indexable/${encodeURIComponent(city)}`,
      { next: { tags: [`pop-city-index:${city}`], revalidate: 3600 } },
    )
    if (!res.ok) return false
    const data = (await res.json()) as { indexable?: boolean }
    return data.indexable === true
  } catch {
    return false
  }
}

export async function fetchSlugRedirect(
  city: string,
  slug: string,
): Promise<{ city_slug: string; slug: string } | null> {
  try {
    const q = new URLSearchParams({ city, slug })
    const res = await fetch(`${apiBase()}/api/pop/slug-redirect?${q}`, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      ok?: boolean
      city_slug?: string
      slug?: string
    }
    if (!data.ok || !data.slug) return null
    return {
      city_slug: String(data.city_slug || city),
      slug: String(data.slug),
    }
  } catch {
    return null
  }
}

export type PopStatus =
  | { status: 'published'; city_slug?: string; slug?: string; id?: string }
  | { status: 'retired'; city_slug?: string; slug?: string; id?: string }
  | { status: 'missing' }

export async function fetchPopStatus(slug: string): Promise<PopStatus> {
  try {
    const res = await fetch(
      `${apiBase()}/api/pop/status/${encodeURIComponent(slug)}`,
      { next: { revalidate: 3600 } },
    )
    if (res.status === 404) return { status: 'missing' }
    if (!res.ok) return { status: 'missing' }
    const data = (await res.json()) as {
      status?: string
      city_slug?: string
      slug?: string
      id?: string
    }
    if (data.status === 'published' || data.status === 'retired') {
      return {
        status: data.status,
        city_slug: data.city_slug,
        slug: data.slug,
        id: data.id,
      }
    }
    return { status: 'missing' }
  } catch {
    return { status: 'missing' }
  }
}

export type SitemapPayload = {
  ok?: boolean
  cities?: Record<string, Array<{ slug: string; lastmod?: string | null }>>
  open_cities?: string[]
}

export async function fetchSitemapPayload(): Promise<SitemapPayload> {
  try {
    const res = await fetch(`${apiBase()}/api/pop/sitemap`, {
      next: { tags: ['pop-sitemap'], revalidate: 3600 },
    })
    if (!res.ok) return { ok: false, cities: {} }
    return (await res.json()) as SitemapPayload
  } catch {
    return { ok: false, cities: {} }
  }
}
