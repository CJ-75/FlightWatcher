'use client'

import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { isPublicImageSrc, PopImage } from '@/components/pop/PopImage'

export type PopGalleryItem = {
  src: string
  title: string
}

type Props = {
  items: PopGalleryItem[]
  index: number
  open: boolean
  onClose: () => void
  onIndexChange: (i: number) => void
}

export function PopPhotoLightbox({
  items,
  index,
  open,
  onClose,
  onIndexChange,
}: Props) {
  const safe = items.filter((it) => isPublicImageSrc(it.src))
  const current = safe[index] || null
  const hasMany = safe.length > 1

  const go = useCallback(
    (delta: number) => {
      if (!safe.length) return
      const next = (index + delta + safe.length) % safe.length
      onIndexChange(next)
    },
    [index, onIndexChange, safe.length],
  )

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, go])

  if (!open || !current || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] flex flex-col bg-[rgba(18,16,14,0.92)]"
      role="dialog"
      aria-modal="true"
      aria-label={current.title || 'Photo'}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-cream sm:px-6">
        <p className="min-w-0 truncate text-sm font-bold tracking-tight">
          {current.title}
          {hasMany ? (
            <span className="ml-2 font-semibold text-cream/55">
              {index + 1} / {safe.length}
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-cream transition hover:bg-white/20"
          aria-label="Fermer"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-6 sm:px-10">
        {hasMany ? (
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-cream transition hover:bg-white/20 sm:left-4"
            aria-label="Photo précédente"
          >
            <Chevron dir="left" />
          </button>
        ) : null}

        <button
          type="button"
          className="relative mx-auto h-[min(78vh,820px)] w-full max-w-5xl cursor-zoom-out border-0 bg-transparent p-0"
          onClick={onClose}
          aria-label="Fermer la photo"
        >
          <PopImage
            src={current.src}
            alt={current.title}
            variant="hero"
            fill
            className="!object-contain rounded-xl"
            sizes="(max-width: 1024px) 94vw, 1024px"
          />
        </button>

        {hasMany ? (
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-cream transition hover:bg-white/20 sm:right-4"
            aria-label="Photo suivante"
          >
            <Chevron dir="right" />
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={dir === 'left' ? 'M14 6l-6 6 6 6' : 'M10 6l6 6-6 6'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
