'use client'

import { cityFallbackStyle } from '@/lib/popHelpers'
import { isPublicImageSrc, PopImage } from '@/components/pop/PopImage'

type Props = {
  photo?: string | null
  title: string
  colorKey?: string | null
  city?: string
  className?: string
  layout?: 'stack' | 'row'
  photoSource?: string | null
  photoLicense?: string | null
  onOpen?: () => void
}

export function StopVisual({
  photo,
  title,
  colorKey,
  city,
  className = '',
  layout = 'stack',
  photoSource,
  photoLicense,
  onOpen,
}: Props) {
  const hasPhoto = isPublicImageSrc(photo)
  const credit =
    photoSource || photoLicense ? (
      <span className="sr-only">
        Photo
        {photoSource ? ` · ${photoSource}` : ''}
        {photoLicense ? ` · ${photoLicense}` : ''}
      </span>
    ) : null

  const openable = hasPhoto && !!onOpen

  if (layout === 'row') {
    const inner = hasPhoto ? (
      <>
        <PopImage
          src={photo!}
          alt={title}
          variant="card"
          fill
          className="object-cover transition duration-300 group-hover:scale-[1.03]"
          sizes="176px"
        />
        {credit}
        {openable ? (
          <span className="pointer-events-none absolute inset-0 bg-ink/0 transition group-hover:bg-ink/10" />
        ) : null}
      </>
    ) : (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-white"
        style={cityFallbackStyle(colorKey, city)}
        role="img"
        aria-label={title}
      >
        <span aria-hidden>📍</span>
        <span className="text-[11px] font-extrabold leading-tight">{title}</span>
      </div>
    )

    const shell =
      'relative h-[128px] w-[176px] shrink-0 overflow-hidden rounded-xl'

    if (openable) {
      return (
        <button
          type="button"
          onClick={onOpen}
          className={`group ${shell} cursor-zoom-in border-0 bg-transparent p-0 text-left ${className}`}
          aria-label={`Agrandir la photo — ${title}`}
        >
          {inner}
        </button>
      )
    }

    return <div className={`${shell} ${className}`}>{inner}</div>
  }

  if (hasPhoto) {
    const img = (
      <>
        <PopImage
          src={photo!}
          alt={title}
          variant="stop"
          className={`h-48 w-full object-cover sm:h-56 ${
            openable ? 'transition duration-300 group-hover:scale-[1.02]' : ''
          }`}
        />
        {credit}
      </>
    )
    if (openable) {
      return (
        <button
          type="button"
          onClick={onOpen}
          className={`group mt-4 block w-full overflow-hidden rounded-2xl border-0 bg-transparent p-0 text-left cursor-zoom-in ${className}`}
          aria-label={`Agrandir la photo — ${title}`}
        >
          {img}
        </button>
      )
    }
    return (
      <div className={`mt-4 overflow-hidden rounded-2xl ${className}`}>{img}</div>
    )
  }

  return (
    <div
      className={`mt-4 flex min-h-[12rem] items-center justify-center gap-3 rounded-2xl px-4 text-white ${className}`}
      style={cityFallbackStyle(colorKey, city)}
      role="img"
      aria-label={title}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg"
        aria-hidden
      >
        📍
      </span>
      <span className="max-w-[12rem] text-sm font-extrabold leading-snug">
        {title}
      </span>
    </div>
  )
}
