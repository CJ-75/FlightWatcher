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
    let pollTimer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      try {
        const { results } = await getApiClient().lookupHotelUpsell([
          { iata, checkin, checkout, participants },
        ])
        if (cancelled) return
        const first = results?.[0] || null
        setResult(first)

        if (first?.status === 'miss') {
          const fetched = await getApiClient().fetchHotelUpsell({
            iata,
            checkin,
            checkout,
            participants,
          })
          if (cancelled) return
          setResult(fetched)
          if (fetched.status === 'pending' && fetched.job_id) {
            const poll = async (n: number) => {
              if (cancelled || n > 12) return
              try {
                const job = await getApiClient().getHotelUpsellJob(fetched.job_id!)
                if (job.done && job.status === 'ready' && job.hotel_pp != null) {
                  setResult({
                    ...fetched,
                    status: 'ready',
                    hotel_pp: job.hotel_pp,
                    hotel_name: job.hotel_name,
                    hotel_id: job.hotel_id,
                  })
                  return
                }
                if (job.done) {
                  setResult({ ...fetched, status: 'unavailable', reason: job.status })
                  return
                }
              } catch {
                /* ignore */
              }
              pollTimer = setTimeout(() => void poll(n + 1), 1500)
            }
            pollTimer = setTimeout(() => void poll(0), 1200)
          } else if (fetched.status === 'pending') {
            // DB pending — re-lookup a few times
            const pollLookup = async (n: number) => {
              if (cancelled || n > 10) return
              try {
                const again = await getApiClient().lookupHotelUpsell([
                  { iata, checkin, checkout, participants },
                ])
                const r = again.results?.[0]
                if (r?.status === 'ready') {
                  setResult(r)
                  return
                }
                if (r?.status === 'unavailable') {
                  setResult(r)
                  return
                }
              } catch {
                /* ignore */
              }
              pollTimer = setTimeout(() => void pollLookup(n + 1), 1500)
            }
            pollTimer = setTimeout(() => void pollLookup(0), 1200)
          }
        }
      } catch {
        if (!cancelled) setResult(null)
      }
    }

    void run()
    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
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
