import { useEffect, useState } from 'react'
import type { HotelUpsellResult } from '../types'
import { getApiClient } from '../utils/apiClient'
import { dateFromFlightIso } from '@flightwatcher/shared'

interface Props {
  iata?: string | null
  outboundIso?: string | null
  returnIso?: string | null
  participants?: number
}

export function HotelUpsellLine({
  iata,
  outboundIso,
  returnIso,
  participants = 2,
}: Props) {
  const [result, setResult] = useState<HotelUpsellResult | null>(null)

  const checkin = dateFromFlightIso(outboundIso)
  const checkout = dateFromFlightIso(returnIso)

  useEffect(() => {
    if (!iata || !checkin || !checkout) {
      setResult(null)
      return
    }
    let cancelled = false

    const run = async () => {
      // Cache-only — never start LiteAPI fetch on Search/booking teaser.
      // Hotel rates are generated when the user opens « ajouter un hôtel ».
      try {
        const { results } = await getApiClient().lookupHotelUpsell([
          { iata, checkin, checkout, participants },
        ])
        if (cancelled) return
        const first = results?.[0] || null
        if (first?.status === 'ready') setResult(first)
        else setResult(null)
      } catch {
        if (!cancelled) setResult(null)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [iata, checkin, checkout, participants])

  if (!result || result.status === 'unavailable' || result.status === 'rate_limited') {
    return null
  }
  if (result.status === 'pending' || result.status === 'miss') {
    return (
      <p className="text-xs font-semibold text-muted mt-2">
        Hôtel en cours de calcul…
      </p>
    )
  }
  if (result.status !== 'ready' || result.hotel_pp == null) return null

  return (
    <p className="text-xs sm:text-sm font-bold text-emerald-800 mt-2 bg-emerald-50 rounded-xl px-2.5 py-1.5 inline-block">
      + hôtel dès {Math.round(result.hotel_pp)} € / pers.
      {result.hotel_name ? (
        <span className="font-medium text-emerald-700/80"> · {result.hotel_name}</span>
      ) : null}
    </p>
  )
}
