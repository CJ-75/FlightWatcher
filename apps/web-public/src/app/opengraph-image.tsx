import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
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
          background:
            'linear-gradient(145deg, #FFF9F5 0%, #FFDCC8 40%, #FF6B35 100%)',
          color: '#1D1B19',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            letterSpacing: -1,
            marginBottom: 12,
          }}
        >
          Waypop
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, maxWidth: 900, lineHeight: 1.2 }}>
          Week-ends déjà organisés, pas chers
        </div>
      </div>
    ),
    { ...size },
  )
}
