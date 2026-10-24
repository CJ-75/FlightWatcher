import React, { useEffect, useState } from 'react'
import { Text, StyleSheet } from 'react-native'
import { dateFromFlightIso, type HotelUpsellResult } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { colors, fonts } from '../theme'

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
    let timer: ReturnType<typeof setTimeout> | undefined

    ;(async () => {
      try {
        const { results } = await getApi().lookupHotelUpsell([
          { iata, checkin, checkout, participants },
        ])
        if (cancelled) return
        let first = results?.[0] || null
        setResult(first)

        if (first?.status === 'miss') {
          first = await getApi().fetchHotelUpsell({
            iata,
            checkin,
            checkout,
            participants,
          })
          if (cancelled) return
          setResult(first)

          if (first.status === 'pending') {
            const poll = async (n: number) => {
              if (cancelled || n > 10) return
              if (first?.job_id) {
                try {
                  const job = await getApi().getHotelUpsellJob(first.job_id)
                  if (job.done && job.status === 'ready' && job.hotel_pp != null) {
                    setResult({ ...first!, status: 'ready', hotel_pp: job.hotel_pp, hotel_name: job.hotel_name })
                    return
                  }
                  if (job.done) {
                    setResult({ ...first!, status: 'unavailable' })
                    return
                  }
                } catch {
                  /* ignore */
                }
              } else {
                try {
                  const again = await getApi().lookupHotelUpsell([
                    { iata, checkin, checkout, participants },
                  ])
                  const r = again.results?.[0]
                  if (r?.status === 'ready' || r?.status === 'unavailable') {
                    setResult(r)
                    return
                  }
                } catch {
                  /* ignore */
                }
              }
              timer = setTimeout(() => void poll(n + 1), 1500)
            }
            timer = setTimeout(() => void poll(0), 1200)
          }
        }
      } catch {
        if (!cancelled) setResult(null)
      }
    })()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [iata, checkin, checkout, participants])

  if (!result || result.status === 'unavailable' || result.status === 'rate_limited') {
    return null
  }
  if (result.status === 'pending' || result.status === 'miss') {
    return <Text style={styles.pending}>Hôtel en cours de calcul…</Text>
  }
  if (result.status !== 'ready' || result.hotel_pp == null) return null

  return (
    <Text style={styles.ready}>
      + hôtel dès {Math.round(result.hotel_pp)} € / pers.
      {result.hotel_name ? ` · ${result.hotel_name}` : ''}
    </Text>
  )
}

const styles = StyleSheet.create({
  pending: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  ready: {
    marginTop: 6,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#166534',
    backgroundColor: '#ecfdf5',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
})
