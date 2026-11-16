'use client'

import { useEffect, useMemo, useState } from 'react'
import { countryToFlagIso } from '@waypop/shared'

type Props = {
  country?: string | null
  iso?: string | null
  className?: string
  title?: string
}

/** Raster flag via flagcdn — same as Vite SPA. */
export function CountryFlag({ country, iso: isoProp, className, title }: Props) {
  const iso = useMemo(
    () => (isoProp || countryToFlagIso(country) || '').toLowerCase() || null,
    [country, isoProp],
  )
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [iso])

  if (!iso || failed) {
    return (
      <span
        className={`inline-block shrink-0 rounded-[1px] bg-ink/10 ring-1 ring-ink/10 ${className || 'h-3 w-[18px]'}`}
        title={title || country || undefined}
        aria-hidden
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={iso}
      src={`https://flagcdn.com/w40/${iso}.png`}
      srcSet={`https://flagcdn.com/w80/${iso}.png 2x`}
      alt=""
      title={title || country || undefined}
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
      className={`inline-block shrink-0 rounded-[1px] object-cover shadow-sm ring-1 ring-ink/10 ${
        className || 'h-3 w-[18px]'
      }`}
      aria-hidden
    />
  )
}
