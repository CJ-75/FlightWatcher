import { useCallback, useRef, useState } from 'react'
import { getApiClient } from '../utils/apiClient'

type Props = {
  hotelId?: string | null
  seedPhotos: string[]
  alt: string
  /** Open deal detail (tap without swipe) */
  onOpen: () => void
}

function uniqueUrls(urls: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const u of urls) {
    const s = (u || '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

export function DealCardGallery({ hotelId, seedPhotos, alt, onOpen }: Props) {
  const [photos, setPhotos] = useState(() => uniqueUrls(seedPhotos).slice(0, 12))
  const [idx, setIdx] = useState(0)
  const [failed, setFailed] = useState(false)
  const fetchedRef = useRef(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ x: 0, moved: false })

  const loadGallery = useCallback(() => {
    const hid = (hotelId || '').trim()
    if (fetchedRef.current || !hid || hid === 'primary') return
    fetchedRef.current = true
    void getApiClient()
      .getHotelGallery(hid, { language: 'fr', fallback: photos[0] })
      .then((res) => {
        const next = uniqueUrls((res.photos || []).map((p) => p.url)).slice(0, 16)
        if (next.length > 1) setPhotos(next)
      })
      .catch(() => {
        fetchedRef.current = false
      })
  }, [hotelId, photos])

  if (!photos.length || failed) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="relative w-full h-52 sm:h-56 bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center"
      >
        <span className="text-white text-2xl font-extrabold px-4 text-center">{alt}</span>
      </button>
    )
  }

  const count = photos.length
  const multi = count > 1

  return (
    <div
      className="relative w-full h-52 sm:h-56 bg-line shrink-0 overflow-hidden"
      onMouseEnter={loadGallery}
      onTouchStart={loadGallery}
    >
      <div
        ref={scrollerRef}
        className="flex h-full w-full overflow-x-auto snap-x snap-mandatory scrollbar-none touch-pan-x"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
        onScroll={(e) => {
          const el = e.currentTarget
          const w = el.clientWidth || 1
          const i = Math.round(el.scrollLeft / w)
          if (i !== idx) setIdx(Math.max(0, Math.min(i, count - 1)))
        }}
        onPointerDown={(e) => {
          dragRef.current = { x: e.clientX, moved: false }
        }}
        onPointerMove={(e) => {
          if (Math.abs(e.clientX - dragRef.current.x) > 8) dragRef.current.moved = true
        }}
        onClick={(e) => {
          // Swipe = don't open; tap = open detail
          if (dragRef.current.moved) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          onOpen()
        }}
      >
        {photos.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="relative shrink-0 grow-0 basis-full min-w-full w-full h-full snap-center"
          >
            <img
              src={url}
              alt={`${alt} ${i + 1}`}
              className="absolute inset-0 h-full w-full object-cover object-center"
              loading={i === 0 ? 'eager' : 'lazy'}
              draggable={false}
              onError={() => {
                if (i === 0 && count === 1) setFailed(true)
              }}
            />
          </div>
        ))}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/10 to-transparent pointer-events-none" />

      {multi ? (
        <>
          {/* Dots above city caption; counter top-center (clear of badge/like) */}
          <div className="absolute bottom-[3.25rem] sm:bottom-12 left-0 right-0 z-[1] flex justify-center gap-1 pointer-events-none">
            {photos.slice(0, 5).map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === Math.min(idx, 4) ? 'w-3 bg-white' : 'w-1 bg-white/45'
                }`}
              />
            ))}
          </div>
          <span className="absolute top-3 left-1/2 -translate-x-1/2 z-[1] rounded-full bg-ink/45 text-white text-[10px] font-bold tabular-nums px-2 py-0.5 pointer-events-none">
            {idx + 1}/{count}
          </span>
          <button
            type="button"
            aria-label="Photo précédente"
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-[2] w-8 h-8 rounded-full bg-white/90 text-ink items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              loadGallery()
              const el = scrollerRef.current
              if (!el) return
              const next = (idx - 1 + count) % count
              el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
            }}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Photo suivante"
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-[2] w-8 h-8 rounded-full bg-white/90 text-ink items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              loadGallery()
              const el = scrollerRef.current
              if (!el) return
              const next = (idx + 1) % count
              el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
            }}
          >
            ›
          </button>
        </>
      ) : null}
    </div>
  )
}
