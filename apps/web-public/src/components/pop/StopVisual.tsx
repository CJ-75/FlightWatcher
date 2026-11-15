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

  if (layout === 'row') {
    return (
      <div
        className={`relative h-[128px] w-[176px] shrink-0 overflow-hidden rounded-xl ${className}`}
      >
        {hasPhoto ? (
          <>
            <PopImage
              src={photo!}
              alt={title}
              variant="card"
              fill
              className="object-cover"
              sizes="176px"
            />
            {credit}
          </>
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-white"
            style={cityFallbackStyle(colorKey, city)}
            role="img"
            aria-label={title}
          >
            <span aria-hidden>📍</span>
            <span className="text-[11px] font-extrabold leading-tight">
              {title}
            </span>
          </div>
        )}
      </div>
    )
  }

  if (hasPhoto) {
    return (
      <div className={`mt-4 overflow-hidden rounded-2xl ${className}`}>
        <PopImage
          src={photo!}
          alt={title}
          variant="stop"
          className="h-48 w-full object-cover sm:h-56"
        />
        {credit}
      </div>
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
