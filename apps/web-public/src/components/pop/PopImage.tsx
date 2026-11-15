import Image from 'next/image'

type Props = {
  src: string
  alt: string
  /** hero = LCP priority */
  variant?: 'hero' | 'stop' | 'card'
  className?: string
  sizes?: string
}

const VARIANTS = {
  hero: {
    width: 1600,
    height: 900,
    sizes: '100vw',
    className: 'h-[42vh] min-h-[220px] max-h-[420px] w-full object-cover sm:h-[48vh]',
    priority: true,
  },
  stop: {
    width: 800,
    height: 450,
    sizes: '(max-width: 768px) 100vw, 640px',
    className: 'h-40 w-full object-cover',
    priority: false,
  },
  card: {
    width: 640,
    height: 360,
    sizes: '(max-width: 640px) 100vw, 33vw',
    className: 'h-36 w-full object-cover',
    priority: false,
  },
} as const

/**
 * next/image wrapper — AVIF/WebP via next.config formats.
 * Fixed aspect via width/height to limit CLS.
 */
export function PopImage({
  src,
  alt,
  variant = 'card',
  className = '',
  sizes,
}: Props) {
  const v = VARIANTS[variant]
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
