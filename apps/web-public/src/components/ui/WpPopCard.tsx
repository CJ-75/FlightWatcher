import Link from 'next/link'
import { isPublicImageSrc, PopImage } from '@/components/pop/PopImage'

/** Next-only Pop tile — photo then title (editorial, not overlay). */
export function WpPopCard({
  href,
  title,
  subtitle,
  image,
  fallbackLabel,
}: {
  href: string
  title: string
  subtitle?: string | null
  image?: string | null
  fallbackLabel?: string
  tall?: boolean
}) {
  return (
    <Link href={href} className="group block no-underline">
      {isPublicImageSrc(image) ? (
        <div className="overflow-hidden rounded-2xl">
          <PopImage
            src={image!}
            alt=""
            variant="card"
            className="transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      ) : (
        <div className="flex h-36 items-center justify-center rounded-2xl bg-night text-sm font-bold text-night-fg sm:h-44">
          {fallbackLabel || 'Waypop'}
        </div>
      )}
      <p className="mt-3 text-base font-extrabold tracking-tight text-ink group-hover:underline sm:text-lg">
        {title}
      </p>
      {subtitle ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted">{subtitle}</p>
      ) : null}
    </Link>
  )
}
