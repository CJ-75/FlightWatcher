import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { HotelGalleryPhoto } from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'

export interface HotelPhotoGalleryProps {
  hotelId?: string | null
  /** Instant seed while gallery loads */
  seedPhoto?: string | null
  seedPhotos?: string[]
  alt: string
  hotelName?: string
  cityLabel?: string
  language?: string
  /** Compact mosaic for Mon voyage / nested cards (no outer padding) */
  embedded?: boolean
  /** Overlay controls (like / close) rendered top-right */
  topRight?: ReactNode
  /** Bottom-left overlay (badge / city) — mobile hero only */
  bottomLeft?: ReactNode
}

function toPhotos(urls: string[]): HotelGalleryPhoto[] {
  return urls
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter(Boolean)
    .map((url, i) => ({ url, thumb: url, order: i }))
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      {dir === 'left' ? (
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function HotelPhotoGallery({
  hotelId,
  seedPhoto,
  seedPhotos,
  alt,
  hotelName,
  cityLabel,
  language = 'fr',
  embedded = false,
  topRight,
  bottomLeft,
}: HotelPhotoGalleryProps) {
  const labelId = useId()
  const [photos, setPhotos] = useState<HotelGalleryPhoto[]>(() => {
    const seeds = seedPhotos?.length
      ? toPhotos(seedPhotos)
      : seedPhoto
        ? toPhotos([seedPhoto])
        : []
    return seeds
  })
  const [loading, setLoading] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [mobileIdx, setMobileIdx] = useState(0)
  const thumbStripRef = useRef<HTMLDivElement>(null)
  const mobileScrollerRef = useRef<HTMLDivElement>(null)
  const touchX = useRef<number | null>(null)

  const seedKey = (seedPhotos || []).join('|')

  useEffect(() => {
    const seeds = seedPhotos?.length
      ? toPhotos(seedPhotos)
      : seedPhoto
        ? toPhotos([seedPhoto])
        : []
    setPhotos(seeds)
    setLightbox(null)
    setMobileIdx(0)
    if (mobileScrollerRef.current) mobileScrollerRef.current.scrollLeft = 0

    const hid = (hotelId || '').trim()
    if (!hid || hid === 'primary') return

    let cancelled = false
    setLoading(true)
    void getApiClient()
      .getHotelGallery(hid, {
        language,
        fallback: seedPhoto || seeds[0]?.url,
      })
      .then((res) => {
        if (cancelled) return
        const next = Array.isArray(res.photos) ? res.photos.filter((p) => p?.url) : []
        if (next.length) setPhotos(next)
        else if (seeds.length) setPhotos(seeds)
      })
      .catch(() => {
        if (!cancelled && seeds.length) setPhotos(seeds)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [hotelId, seedPhoto, language, seedKey])

  const openAt = useCallback((idx: number) => {
    if (!photos.length) return
    setLightbox(Math.max(0, Math.min(idx, photos.length - 1)))
  }, [photos.length])

  const closeLightbox = useCallback(() => setLightbox(null), [])

  const go = useCallback(
    (delta: number) => {
      setLightbox((cur) => {
        if (cur == null || !photos.length) return cur
        return (cur + delta + photos.length) % photos.length
      })
    },
    [photos.length],
  )

  useEffect(() => {
    if (lightbox == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [lightbox, closeLightbox, go])

  useEffect(() => {
    if (lightbox == null || !thumbStripRef.current) return
    const el = thumbStripRef.current.querySelector(`[data-thumb="${lightbox}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [lightbox])

  if (!photos.length) return null

  const count = photos.length
  const showMosaic = count >= 3
  const mosaicSlots = photos.slice(0, 5)
  const extra = Math.max(0, count - 5)
  const mobileSlides = photos.slice(0, 20)

  return (
    <>
      {/* Mobile: full-bleed paging carousel */}
      <div className={`relative sm:hidden ${embedded ? 'rounded-xl overflow-hidden' : ''}`}>
        <div
          ref={mobileScrollerRef}
          className="flex w-full overflow-x-auto snap-x snap-mandatory scrollbar-none overscroll-x-contain touch-pan-x"
          style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
          onScroll={(e) => {
            const el = e.currentTarget
            const w = el.clientWidth || 1
            const i = Math.round(el.scrollLeft / w)
            if (i !== mobileIdx) setMobileIdx(Math.max(0, Math.min(i, mobileSlides.length - 1)))
          }}
        >
          {mobileSlides.map((p, i) => (
            <button
              key={`${p.url}-${i}`}
              type="button"
              className={`relative shrink-0 grow-0 basis-full min-w-full w-full snap-center snap-always focus:outline-none ${
                embedded ? 'aspect-[16/10] max-h-[220px]' : 'aspect-[5/4] max-h-[42vh]'
              }`}
              onClick={() => openAt(i)}
            >
              <img
                src={p.url}
                alt={`${alt} ${i + 1}`}
                className="absolute inset-0 w-full h-full object-cover"
                loading={i === 0 ? 'eager' : 'lazy'}
                draggable={false}
              />
            </button>
          ))}
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-transparent to-ink/30 pointer-events-none" />

        <div className="absolute top-3 right-3 z-10 flex gap-2 pointer-events-auto">{topRight}</div>

        {bottomLeft ? (
          <div className="absolute bottom-12 left-4 right-24 z-10 pointer-events-none">{bottomLeft}</div>
        ) : null}

        {/* Dots + counter */}
        <div className="absolute bottom-3 left-0 right-0 z-10 flex flex-col items-center gap-2 pointer-events-none">
          {mobileSlides.length > 1 ? (
            <div className="flex items-center gap-1.5">
              {mobileSlides.slice(0, 8).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === mobileIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/45'
                  }`}
                />
              ))}
              {mobileSlides.length > 8 ? (
                <span className="text-white/80 text-[10px] font-bold ml-0.5">
                  +{mobileSlides.length - 8}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => openAt(mobileIdx)}
          className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 text-ink text-xs font-bold px-3 py-1.5 shadow-md active:scale-95 transition-transform"
        >
          <GridIcon />
          {count} photo{count > 1 ? 's' : ''}
        </button>

        {loading ? (
          <span className="absolute top-3 left-3 z-10 rounded-full bg-ink/50 text-white text-[10px] font-semibold px-2 py-1">
            …
          </span>
        ) : (
          <span className="absolute top-3 left-3 z-10 rounded-full bg-ink/45 text-white text-[11px] font-bold tabular-nums px-2.5 py-1">
            {mobileIdx + 1}/{Math.min(count, mobileSlides.length)}
          </span>
        )}
      </div>

      {/* Desktop: Booking / Airbnb mosaic */}
      <div
        className={`relative hidden sm:block ${embedded ? '' : 'px-4 pt-4'}`}
      >
        <div
          className={`grid gap-1.5 overflow-hidden rounded-2xl ${
            showMosaic
              ? embedded
                ? 'grid-cols-4 grid-rows-2 h-[200px]'
                : 'grid-cols-4 grid-rows-2 h-[320px] lg:h-[380px]'
              : embedded
                ? 'grid-cols-1 h-[180px]'
                : 'grid-cols-1 h-[280px]'
          }`}
        >
          <button
            type="button"
            onClick={() => openAt(0)}
            className={`relative group overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
              showMosaic ? 'col-span-2 row-span-2' : 'col-span-1'
            }`}
          >
            <img
              src={mosaicSlots[0].url}
              alt={alt}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </button>

          {showMosaic
            ? mosaicSlots.slice(1, 5).map((p, i) => {
                const idx = i + 1
                const isLast = idx === mosaicSlots.length - 1 && extra > 0
                return (
                  <button
                    key={`${p.url}-${idx}`}
                    type="button"
                    onClick={() => openAt(idx)}
                    className="relative group overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                  >
                    <img
                      src={p.thumb || p.url}
                      alt={`${alt} ${idx + 1}`}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
                    {isLast ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-white text-sm font-bold tracking-wide">
                        +{extra} photos
                      </span>
                    ) : null}
                  </button>
                )
              })
            : null}
        </div>

        <div
          className={`absolute z-10 flex gap-2 ${
            embedded ? 'top-3 right-3' : 'top-7 right-7'
          }`}
        >
          {topRight}
        </div>

        <button
          type="button"
          onClick={() => openAt(0)}
          className={`absolute z-10 inline-flex items-center gap-2 rounded-xl bg-white text-ink font-bold shadow-lg border border-line/80 hover:bg-slate-50 transition-colors ${
            embedded
              ? 'bottom-3 right-3 text-xs px-2.5 py-1.5'
              : 'bottom-5 right-7 text-sm px-3.5 py-2'
          }`}
        >
          <GridIcon />
          Voir les {count} photos
        </button>
      </div>

      {/* Fullscreen lightbox — mobile-first */}
      <AnimatePresence>
        {lightbox != null ? (
          <motion.div
            className="fixed inset-0 z-[80] flex flex-col bg-ink"
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <div className="flex items-center justify-between gap-3 px-3 sm:px-6 py-2.5 text-white shrink-0">
              <div className="min-w-0 flex-1">
                <p id={labelId} className="font-bold truncate text-sm sm:text-base">
                  {hotelName || alt}
                </p>
                {cityLabel ? <p className="text-white/65 text-xs truncate">{cityLabel}</p> : null}
              </div>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <span className="text-sm font-semibold tabular-nums text-white/90">
                  {lightbox + 1} / {count}
                </span>
                <button
                  type="button"
                  onClick={closeLightbox}
                  className="w-11 h-11 rounded-full bg-white/15 active:bg-white/25 text-white text-2xl font-bold transition-colors flex items-center justify-center"
                  aria-label="Fermer la galerie"
                >
                  ×
                </button>
              </div>
            </div>

            <div
              className="relative flex-1 flex items-center justify-center min-h-0 px-1 sm:px-16 touch-pan-y"
              onTouchStart={(e) => {
                touchX.current = e.changedTouches[0]?.clientX ?? null
              }}
              onTouchEnd={(e) => {
                const start = touchX.current
                const end = e.changedTouches[0]?.clientX
                touchX.current = null
                if (start == null || end == null) return
                const dx = end - start
                if (Math.abs(dx) < 40) return
                go(dx > 0 ? -1 : 1)
              }}
            >
              {/* Chevrons desktop only — mobile uses swipe */}
              {count > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    className="hidden sm:flex absolute left-4 z-10 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white items-center justify-center transition-colors"
                    aria-label="Photo précédente"
                  >
                    <Chevron dir="left" />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    className="hidden sm:flex absolute right-4 z-10 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white items-center justify-center transition-colors"
                    aria-label="Photo suivante"
                  >
                    <Chevron dir="right" />
                  </button>
                </>
              ) : null}

              <AnimatePresence mode="wait">
                <motion.img
                  key={photos[lightbox].url}
                  src={photos[lightbox].url}
                  alt={`${alt} ${lightbox + 1}`}
                  className="max-h-full max-w-full object-contain select-none"
                  initial={{ opacity: 0.4, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0.4, x: -12 }}
                  transition={{ duration: 0.15 }}
                  draggable={false}
                />
              </AnimatePresence>
            </div>

            {photos[lightbox].caption ? (
              <p className="text-center text-white/75 text-xs sm:text-sm px-4 py-1.5 shrink-0">
                {photos[lightbox].caption}
              </p>
            ) : (
              <p className="sm:hidden text-center text-white/40 text-[11px] px-4 pb-1 shrink-0">
                Glisse pour changer de photo
              </p>
            )}

            <div
              ref={thumbStripRef}
              className="shrink-0 flex gap-2 overflow-x-auto px-3 sm:px-6 py-3 scrollbar-none touch-pan-x"
            >
              {photos.map((p, i) => (
                <button
                  key={`thumb-${p.url}-${i}`}
                  type="button"
                  data-thumb={i}
                  onClick={() => setLightbox(i)}
                  className={`relative shrink-0 w-[72px] h-[54px] sm:w-20 sm:h-14 rounded-lg overflow-hidden ring-2 transition-all ${
                    i === lightbox
                      ? 'ring-white opacity-100 scale-105'
                      : 'ring-transparent opacity-50'
                  }`}
                >
                  <img
                    src={p.thumb || p.url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
