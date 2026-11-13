import { useEffect, useMemo, useState } from 'react'
import { parcoursWebCoverCandidates } from '../../utils/parcoursCover'

type Props = {
  coverImage?: string | null
  citySlug?: string | null
  slug?: string | null
  width?: number
  alt?: string
  className?: string
  style?: React.CSSProperties
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>['referrerPolicy']
}

/**
 * Cover image with candidate fallback (cover → Unsplash → city).
 * Advances on onError so a broken DB URL doesn't blank the card.
 */
export function ParcoursCoverImg({
  coverImage,
  citySlug,
  slug,
  width = 1200,
  alt = '',
  className,
  style,
  referrerPolicy = 'no-referrer',
}: Props) {
  const candidates = useMemo(
    () =>
      parcoursWebCoverCandidates({
        coverImage,
        citySlug,
        slug,
        width,
      }),
    [coverImage, citySlug, slug, width],
  )
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    setIdx(0)
  }, [candidates.join('|')])

  const src = candidates[idx] || null
  if (!src) return null

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      referrerPolicy={referrerPolicy}
      onError={() => {
        setIdx((i) => (i + 1 < candidates.length ? i + 1 : i))
      }}
    />
  )
}
