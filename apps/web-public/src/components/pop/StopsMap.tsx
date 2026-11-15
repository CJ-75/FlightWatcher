'use client'

import { useState } from 'react'

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

/** Full walking itinerary on Google Maps (all pins). Client-safe helper. */
function buildGoogleMapsRouteUrl(stops: StopPin[]): string | null {
  const pins = stops.filter(
    (s) => typeof s.lat === 'number' && typeof s.lng === 'number',
  )
  if (pins.length === 0) return null
  if (pins.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${pins[0]!.lat},${pins[0]!.lng}&travelmode=walking`
  }
  const path = pins.map((p) => `${p.lat},${p.lng}`).join('/')
  return `https://www.google.com/maps/dir/${path}`
}

function buildStaticMapUrl(pins: StopPin[]): string | null {
  if (pins.length === 0) return null
  const lats = pins.map((p) => p.lat!)
  const lngs = pins.map((p) => p.lng!)
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2
  const markers = pins
    .slice(0, 8)
    .map((p) => `${p.lat},${p.lng},red-pushpin`)
    .join('|')
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${centerLat},${centerLng}&zoom=13&size=560x220&maptype=mapnik&markers=${encodeURIComponent(markers)}`
}

/** OSM static map + Google Maps full route link. SVG fallback if OSM fails. */
export function StopsMap({
  stops,
  cityLabel,
  mapsUrl,
  className = '',
}: Props) {
  const pins = stops.filter(
    (s) => typeof s.lat === 'number' && typeof s.lng === 'number',
  )
  const routeUrl = mapsUrl || buildGoogleMapsRouteUrl(pins)
  if (pins.length === 0 && !routeUrl) return null

  const staticMap = buildStaticMapUrl(pins)
  const [mapFailed, setMapFailed] = useState(false)

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
      {staticMap && !mapFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={staticMap}
          alt={`Carte des stops à ${cityLabel}`}
          className="h-40 w-full object-cover"
          loading="lazy"
          onError={() => setMapFailed(true)}
        />
      ) : pins.length > 0 ? (
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
        {routeUrl ? (
          <a
            href={routeUrl}
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
