import Image from 'next/image'

type Props = {
  src: string
  alt: string
  variant?: 'hero' | 'stop' | 'card'
  className?: string
  sizes?: string
  /** Absolute fill parent (hero full-bleed) */
  fill?: boolean
}

const VARIANTS = {
  hero: {
    width: 1600,
    height: 900,
    sizes: '100vw',
    className: 'h-full w-full object-cover',
    priority: true,
  },
  stop: {
    width: 800,
    height: 450,
    sizes: '(max-width: 768px) 100vw, 640px',
    className: 'h-48 w-full object-cover sm:h-56',
    priority: false,
  },
  card: {
    width: 640,
    height: 360,
    sizes: '(max-width: 640px) 100vw, 33vw',
    className: 'h-36 w-full object-cover sm:h-44',
    priority: false,
  },
} as const

/** Reject file://, blob:, and other non-web URLs (mobile picker leftovers). */
export function isPublicImageSrc(src: string | null | undefined): boolean {
  const s = String(src || '').trim()
  if (!s) return false
  if (s.startsWith('/')) return true
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function PopImage({
  src,
  alt,
  variant = 'card',
  className = '',
  sizes,
  fill,
}: Props) {
  if (!isPublicImageSrc(src)) return null

  const v = VARIANTS[variant]
  const useFill = fill || variant === 'hero'
  if (useFill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes || v.sizes}
        priority={v.priority}
        className={`object-cover ${className}`}
      />
    )
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={v.width}
      height={v.height}
      sizes={sizes || v.sizes}
      priority={v.priority}
      loading={v.priority ? undefined : 'lazy'}
      className={`${v.className} ${className}`}
    />
  )
}
