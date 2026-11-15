import Link from 'next/link'
import { isPublicImageSrc, PopImage } from '@/components/pop/PopImage'
import { cityFallbackStyle } from '@/lib/popHelpers'

/** Next-only Pop tile — photo then title. No random cityImageUrl fallback. */
export function WpPopCard({
  href,
  title,
  subtitle,
  image,
  fallbackLabel,
  colorKey,
}: {
  href: string
  title: string
  subtitle?: string | null
  image?: string | null
  fallbackLabel?: string
  citySlug?: string
  colorKey?: string | null
  tall?: boolean
}) {
  const resolved = isPublicImageSrc(image) ? String(image) : null

  return (
    <Link href={href} className="group block no-underline">
      {resolved ? (
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-sand">
          <PopImage
            src={resolved}
            alt=""
            variant="card"
            fill
            className="transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      ) : (
        <div
          className="flex aspect-[16/10] items-center justify-center rounded-2xl text-sm font-bold text-cream"
          style={cityFallbackStyle(colorKey, fallbackLabel)}
        >
          {fallbackLabel || 'Waypop'}
        </div>
      )}
      <p className="mt-3 line-clamp-2 text-base font-extrabold tracking-tight text-ink group-hover:underline sm:text-lg">
        {title}
      </p>
      {subtitle ? (
        <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{subtitle}</p>
      ) : null}
    </Link>
  )
}
