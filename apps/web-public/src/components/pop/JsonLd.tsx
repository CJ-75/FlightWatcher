import { parseFaq } from '@/lib/popHelpers'
import type { PublicItinerary } from '@/lib/parcoursApi'

type Props = {
  itin: PublicItinerary
  city: string
  cityLabel: string
  h1: string
  description: string
  canonicalPath: string
}

function placeNode(step: NonNullable<PublicItinerary['itinerary_items']>[number], pos: number) {
  const lat = step.meta?.lat
  const lng = step.meta?.lng
  const name = step.title || step.places?.name || `Stop ${pos}`
  const node: Record<string, unknown> = {
    '@type': step.kind === 'activity' ? 'TouristAttraction' : 'Place',
    name,
    description: step.note ? String(step.note).slice(0, 300) : undefined,
  }
  if (typeof lat === 'number' && typeof lng === 'number') {
    node.geo = {
      '@type': 'GeoCoordinates',
      latitude: lat,
      longitude: lng,
    }
  }
  if (step.photo) node.image = step.photo
  return node
}

export function PopJsonLd({
  itin,
  city,
  cityLabel,
  h1,
  description,
  canonicalPath,
}: Props) {
  const items = [...(itin.itinerary_items || [])].sort(
    (a, b) => Number(a.day_offset || 0) - Number(b.day_offset || 0),
  )
  const faq = parseFaq(itin.faq)
  const base = 'https://waypop.co'
  const url = `${base}${canonicalPath}`

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Pops',
          item: `${base}/pop/${city}`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: cityLabel,
          item: `${base}/pop/${city}`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: h1,
          item: url,
        },
      ],
    },
    {
      '@type': 'TouristTrip',
      name: h1,
      description,
      url,
      image: itin.cover_image || undefined,
      touristType: (itin.ideal_for as string[] | undefined)?.length
        ? (itin.ideal_for as string[])
        : itin.occasions,
      itinerary: {
        '@type': 'ItemList',
        numberOfItems: items.length,
        itemListElement: items.map((step, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: placeNode(step, i + 1),
        })),
      },
    },
  ]

  if (faq.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.a,
        },
      })),
    })
  }

  const payload = {
    '@context': 'https://schema.org',
    '@graph': graph,
  }

  return (
    <script
      type="application/ld+json"
      // Editorial content already sanitized upstream
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  )
}
