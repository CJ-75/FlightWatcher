import { useMemo, useState } from 'react'
import { countryToFlagIso } from '@flightwatcher/shared'

export { countryToFlagIso }

type Props = {
  /** Country name (FR/EN) or ISO alpha-2 */
  country?: string | null
  /** Prefer when already resolved (IATA map / parse) */
  iso?: string | null
  className?: string
  title?: string
}

/** Raster flag via flagcdn — reliable on Windows (unlike regional-indicator emoji). */
export function CountryFlag({ country, iso: isoProp, className, title }: Props) {
  const iso = useMemo(
    () => (isoProp || countryToFlagIso(country) || '').toLowerCase() || null,
    [country, isoProp],
  )
  const [failed, setFailed] = useState(false)

  if (!iso || failed) {
    return (
      <span
        className={`inline-block rounded-[2px] bg-slate-200/80 ring-1 ring-black/10 shrink-0 ${className || 'w-[18px] h-3'}`}
        title={title || country || undefined}
        aria-hidden
      />
    )
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      srcSet={`https://flagcdn.com/w80/${iso}.png 2x`}
      alt=""
      title={title || country || undefined}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`inline-block object-cover rounded-[2px] shadow-sm ring-1 ring-black/10 shrink-0 ${
        className || 'w-[18px] h-3'
      }`}
      aria-hidden
    />
  )
}
