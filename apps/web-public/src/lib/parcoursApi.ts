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
  itinerary_items?: Array<{
    id?: string
    title?: string | null
    note?: string | null
    photo?: string | null
    day_offset?: number | null
    moment?: string | null
    kind?: string | null
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
