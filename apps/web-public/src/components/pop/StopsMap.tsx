type StopPin = {
  title: string
  lat?: number
  lng?: number
}

type Props = {
  stops: StopPin[]
  cityLabel: string
  mapsUrl?: string | null
  className?: string
}

/** Reliable SVG map — OSM staticmap.de is often unreachable. */
export function StopsMap({
  stops,
  cityLabel,
  mapsUrl,
  className = '',
}: Props) {
  const pins = stops.filter(
    (s) => typeof s.lat === 'number' && typeof s.lng === 'number',
  )
  if (pins.length === 0 && !mapsUrl) return null

  const pad = 0.012
  const lats = pins.map((p) => p.lat!)
  const lngs = pins.map((p) => p.lng!)
  const minLat = pins.length ? Math.min(...lats) - pad : 48.84
  const maxLat = pins.length ? Math.max(...lats) + pad : 48.87
  const minLng = pins.length ? Math.min(...lngs) - pad : 2.32
  const maxLng = pins.length ? Math.max(...lngs) + pad : 2.36
  const w = 560
  const h = 220

  const project = (lat: number, lng: number) => {
    const x = ((lng - minLng) / (maxLng - minLng || 1)) * w
    const y = (1 - (lat - minLat) / (maxLat - minLat || 1)) * h
    return { x, y }
  }

  const path =
    pins.length > 1
      ? pins
          .map((p, i) => {
            const { x, y } = project(p.lat!, p.lng!)
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
          })
          .join(' ')
      : ''

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-line bg-surface ${className}`}
    >
      {pins.length > 0 ? (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-40 w-full"
          role="img"
          aria-label={`Carte des stops à ${cityLabel}`}
        >
          <defs>
            <linearGradient id="mapWash" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFF9F5" />
              <stop offset="55%" stopColor="#FFE7DC" />
              <stop offset="100%" stopColor="#FFD4A8" />
            </linearGradient>
          </defs>
          <rect width={w} height={h} fill="url(#mapWash)" />
          {/* soft grid */}
          {[1, 2, 3, 4].map((i) => (
            <line
              key={`v${i}`}
              x1={(w / 5) * i}
              y1={0}
              x2={(w / 5) * i}
              y2={h}
              stroke="#F0E0D4"
              strokeWidth="1"
            />
          ))}
          {[1, 2, 3].map((i) => (
            <line
              key={`h${i}`}
              x1={0}
              y1={(h / 4) * i}
              x2={w}
              y2={(h / 4) * i}
              stroke="#F0E0D4"
              strokeWidth="1"
            />
          ))}
          {path ? (
            <path
              d={path}
              fill="none"
              stroke="#FF6B35"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
            />
          ) : null}
          {pins.map((p, i) => {
            const { x, y } = project(p.lat!, p.lng!)
            return (
              <g key={`${p.title}-${i}`}>
                <circle cx={x} cy={y} r="11" fill="#1D1B19" />
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fill="#FFF9F5"
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="system-ui,sans-serif"
                >
                  {i + 1}
                </text>
              </g>
            )
          })}
        </svg>
      ) : (
        <div className="flex h-28 items-center justify-center bg-accent-soft px-4 text-center text-sm font-semibold text-ink">
          Carte bientôt dispo pour {cityLabel}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-xs font-bold text-ink">
          {pins.length || stops.length} stops sur la carte
        </p>
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-ink no-underline hover:underline"
          >
            Ouvrir Maps →
          </a>
        ) : null}
      </div>
    </div>
  )
}
