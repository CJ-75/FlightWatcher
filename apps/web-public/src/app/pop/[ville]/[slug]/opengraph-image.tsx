import { ImageResponse } from 'next/og'
import { citySlugDisplayNameFr } from '@waypop/shared'
import { fetchPublishedBySlug } from '@/lib/parcoursApi'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

type Props = { params: Promise<{ ville: string; slug: string }> }

export default async function OgImage({ params }: Props) {
  const { ville, slug } = await params
  const city = decodeURIComponent(ville).toLowerCase()
  const itin = await fetchPublishedBySlug(decodeURIComponent(slug).toLowerCase())
  const title = itin?.title || 'Waypop'
  const label = citySlugDisplayNameFr(city) || city

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: 64,
          background: 'linear-gradient(145deg, #1D1B19 0%, #8B2E0E 45%, #FF6B35 100%)',
          color: '#F5EFEA',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: 'uppercase',
            opacity: 0.85,
            marginBottom: 16,
          }}
        >
          Waypop · {label}
        </div>
        <div
          style={{
            fontSize: title.length > 48 ? 44 : 56,
            fontWeight: 800,
            lineHeight: 1.15,
            maxWidth: 1000,
          }}
        >
          {title.slice(0, 90)}
        </div>
      </div>
    ),
    { ...size },
  )
}
