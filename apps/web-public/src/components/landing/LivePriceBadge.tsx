'use client'

import { useEffect, useState } from 'react'

type Props = {
  destCity: string
  origin?: string
  className?: string
}

function apiBase(): string {
  return (
    process.env.NEXT_PUBLIC_WAYPOP_API_URL ||
    process.env.WAYPOP_API_URL ||
    'https://api.waypop.co'
  ).replace(/\/$/, '')
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
}

/** Live deal badge — hidden when no recent price. */
export function LivePriceBadge({
  destCity,
  origin = 'LYS',
  className = '',
}: Props) {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const q = new URLSearchParams({ origin, dest_city: destCity })
    void fetch(`${apiBase()}/api/pop/price?${q}`, { credentials: 'omit' })
      .then((r) => r.json())
      .then(
        (json: {
          price_pp?: number | null
          priced_at?: string | null
        }) => {
          if (cancelled) return
          if (json.price_pp == null) {
            setLabel(null)
            return
          }
          let when = ''
          if (json.priced_at) {
            try {
              when = new Date(json.priced_at).toLocaleString('fr-FR', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            } catch {
              /* ignore */
            }
          }
          setLabel(
            when
              ? `dès ${formatEuro(json.price_pp)} · ${when}`
              : `dès ${formatEuro(json.price_pp)}`,
          )
        },
      )
      .catch(() => {
        if (!cancelled) setLabel(null)
      })
    return () => {
      cancelled = true
    }
  }, [destCity, origin])

  if (!label) return null
  return (
    <span
      className={`rounded-full bg-cream px-3 py-1 text-xs font-extrabold text-ink shadow-soft ${className}`}
    >
      {label}
    </span>
  )
}
