import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  hotelCancelLabel,
  type HotelUpsellOption,
  type MyTripDraft,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { HotelPhotoGallery } from '../components/HotelPhotoGallery'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
import { colors, fonts, radius, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'HotelCompose'>
type SortKey = 'price' | 'rating' | 'distance'

function hotelIdOf(h: HotelUpsellOption | Record<string, unknown> | null | undefined) {
  if (!h) return ''
  return String((h as HotelUpsellOption).id || (h as HotelUpsellOption).hotel_id || '')
}

function revalidateSnapshot(
  snapshot: HotelUpsellOption[],
  live: HotelUpsellOption[],
): HotelUpsellOption[] {
  if (!snapshot.length) return live
  const byId = new Map<string, HotelUpsellOption>()
  for (const h of live) {
    const id = hotelIdOf(h)
    if (id) byId.set(id, h)
  }
  const kept: HotelUpsellOption[] = []
  for (const h of snapshot) {
    const id = hotelIdOf(h)
    const fresh = id ? byId.get(id) : undefined
    if (fresh) kept.push({ ...h, ...fresh })
  }
  return kept
}

function readSnapshot(payload: Record<string, unknown>): HotelUpsellOption[] {
  const raw = payload.compose_options
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is HotelUpsellOption => Boolean(x && typeof x === 'object'))
    .filter((h) => hotelIdOf(h))
    .slice(0, 12)
}

function formatDistance(m?: number | null) {
  if (m == null || Number.isNaN(Number(m))) return null
  const n = Number(m)
  if (n < 1000) return `${Math.round(n)} m`
  return `${(n / 1000).toFixed(1)} km`
}

function reasonError(reason: string, status?: string) {
  return reason === 'not_in_catalogue'
    ? 'Cette destination n’a pas encore d’hôtels — réessaie dans un instant'
    : reason === 'bad_dates'
      ? 'Dates invalides pour l’hôtel'
      : reason === 'empty_pool' || reason === 'no_rates' || status === 'no_rates'
        ? 'Pas de dispo hôtel pour ces dates'
        : reason === 'rate_limited' || reason === 'too_many_fetches'
          ? 'Trop de recherches hôtel — réessaie dans un moment'
          : 'Aucun hôtel disponible pour cette ville / ces dates'
}

export function HotelComposeScreen({ route, navigation }: Props) {
  const { draftToken } = route.params
  const insets = useSafeAreaInsets()

  const [draft, setDraft] = useState<MyTripDraft | null>(null)
  const [options, setOptions] = useState<HotelUpsellOption[]>([])
  const [selected, setSelected] = useState<HotelUpsellOption | null>(null)
  const [sort, setSort] = useState<SortKey>('price')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cityLabel, setCityLabel] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const payload = (draft?.payload || {}) as Record<string, unknown>
  const flight = (payload.flight || {}) as Record<string, unknown>
  const flightPp = Number(flight.price_pp || 0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const row = await getApi().getMyTrip(draftToken)
        if (cancelled) return
        setDraft(row)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Voyage introuvable')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [draftToken, reloadKey])

  useEffect(() => {
    if (!draft) return
    let cancelled = false
    ;(async () => {
      const pl = (draft.payload || {}) as Record<string, unknown>
      const fl = (pl.flight || {}) as Record<string, unknown>
      const dest = String(
        draft.dest_iata || pl.destination || fl.destination_iata || '',
      ).toUpperCase()
      const cin = String(
        draft.out_date || (pl.dates as { outbound?: string } | undefined)?.outbound || '',
      ).slice(0, 10)
      const cout = String(
        draft.ret_date || (pl.dates as { inbound?: string } | undefined)?.inbound || '',
      ).slice(0, 10)
      const pax = Number(draft.adults || pl.adults || 2)
      const fPp = Number(fl.price_pp || 0)
      const cityHint =
        String(draft.city_name || pl.compose_city || (pl as { city?: string }).city || '').trim() ||
        undefined
      const currentHotel = (pl.hotel || draft.hotel) as Record<string, unknown> | null
      const snapshot = readSnapshot(pl)

      if (!dest || !cin || !cout) {
        setError('Destination ou dates manquantes')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      const lookupItem = {
        iata: dest,
        checkin: cin,
        checkout: cout,
        participants: pax,
        flight_pp: fPp || undefined,
        city: cityHint,
      }
      const liveItem = { ...lookupItem, live: true as const }

      const pickOpts = (r: {
        options?: HotelUpsellOption[] | null
        hotel?: HotelUpsellOption | null
      }) => (r?.options?.length ? r.options : r?.hotel ? [r.hotel] : [])

      const applyOpts = (
        opts: HotelUpsellOption[],
        meta?: { night_cap?: number | null; city?: string | null },
      ) => {
        setOptions(opts)
        if (meta?.city) setCityLabel(String(meta.city))
        else if (cityHint) setCityLabel(cityHint)
        const curId = hotelIdOf(currentHotel)
        const match = opts.find((h) => hotelIdOf(h) === curId)
        setSelected(match || opts[0] || null)
      }

      const persistSnapshot = async (
        opts: HotelUpsellOption[],
        meta?: { night_cap?: number | null; city?: string | null },
      ) => {
        if (!opts.length) return
        try {
          const row = await getApi().saveMyTripComposeOptions(draftToken, {
            options: opts,
            night_cap: meta?.night_cap ?? null,
            city: meta?.city ?? cityHint ?? null,
          })
          if (!cancelled) setDraft(row)
        } catch {
          /* non-blocking */
        }
      }

      const loadCached = async () => {
        try {
          const cached = (await getApi().lookupHotelUpsell([lookupItem])).results?.[0]
          return {
            opts: pickOpts(cached || {}),
            night_cap: cached?.night_cap ?? null,
            city: cached?.city ?? null,
            status: cached?.status,
            reason: cached?.reason,
          }
        } catch {
          return {
            opts: [] as HotelUpsellOption[],
            night_cap: null as number | null,
            city: null as string | null,
            status: undefined as string | undefined,
            reason: undefined as string | undefined,
          }
        }
      }

      const pollJob = async (jobId: string) => {
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 1200))
          if (cancelled) return null
          try {
            const job = await getApi().getHotelUpsellJob(jobId)
            if (
              job.status === 'ready' ||
              job.status === 'error' ||
              job.status === 'no_rates'
            ) {
              return job
            }
          } catch {
            return null
          }
        }
        return null
      }

      const fetchLive = async () => {
        let result = await getApi().fetchHotelUpsell(liveItem)
        if (result?.status === 'pending' && result.job_id) {
          const job = await pollJob(result.job_id)
          if (job) {
            result = {
              ...result,
              status: job.status,
              options: job.options,
              night_cap: job.night_cap ?? result.night_cap,
              reason: (job as { error?: string }).error || result.reason,
            }
          }
        }
        return result
      }

      try {
        const snapCap =
          pl.compose_night_cap != null ? Number(pl.compose_night_cap) : null
        if (snapshot.length) {
          applyOpts(snapshot, { night_cap: snapCap, city: cityHint })
        } else {
          const cached = await loadCached()
          if (cancelled) return
          if (cached.opts.length) applyOpts(cached.opts, cached)
        }

        let result: Awaited<ReturnType<ReturnType<typeof getApi>['fetchHotelUpsell']>> | null =
          null
        try {
          result = await fetchLive()
        } catch (e) {
          if (snapshot.length) {
            if (!cancelled) setLoading(false)
            return
          }
          const cached = await loadCached()
          if (cached.opts.length) {
            applyOpts(cached.opts, cached)
            await persistSnapshot(cached.opts, cached)
            if (!cancelled) setLoading(false)
            return
          }
          throw e
        }

        if (cancelled) return
        const liveOpts = pickOpts(result || {})
        let opts: HotelUpsellOption[] = []
        if (snapshot.length && liveOpts.length) {
          opts = revalidateSnapshot(snapshot, liveOpts)
          if (!opts.length) opts = liveOpts
        } else if (liveOpts.length) {
          opts = liveOpts
        } else if (snapshot.length) {
          opts = snapshot
        } else {
          const again = await loadCached()
          opts = again.opts
        }

        if (opts.length) {
          const meta = {
            night_cap: result?.night_cap ?? snapCap,
            city: result?.city ?? cityHint,
          }
          applyOpts(opts, meta)
          setError(null)
          await persistSnapshot(opts, meta)
        } else {
          setError(
            reasonError(String(result?.reason || result?.status || ''), result?.status),
          )
        }
      } catch {
        if (!cancelled) {
          if (snapshot.length) {
            applyOpts(snapshot, {
              night_cap:
                pl.compose_night_cap != null ? Number(pl.compose_night_cap) : null,
              city: cityHint,
            })
            setError(null)
          } else {
            const again = await loadCached()
            if (again.opts.length) {
              applyOpts(again.opts, again)
              await persistSnapshot(again.opts, again)
              setError(null)
            } else {
              setError('Impossible de charger les hôtels')
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [draft, draftToken])

  const sorted = useMemo(() => {
    const list = [...options]
    list.sort((a, b) => {
      if (sort === 'rating') return (Number(b.rating) || 0) - (Number(a.rating) || 0)
      if (sort === 'distance') {
        const da = a.distance_m == null ? 1e9 : Number(a.distance_m)
        const db = b.distance_m == null ? 1e9 : Number(b.distance_m)
        return da - db
      }
      return (Number(a.hotel_pp) || 0) - (Number(b.hotel_pp) || 0)
    })
    return list
  }, [options, sort])

  const confirm = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const hotelPp = Number(selected.hotel_pp || 0)
      const totalPp = Math.round(flightPp + hotelPp)
      await getApi().updateMyTripHotel(draftToken, {
        hotel: {
          id: selected.id || selected.hotel_id,
          hotel_id: selected.hotel_id || selected.id,
          name: selected.name,
          stars: selected.stars,
          rating: selected.rating,
          photo: selected.photo || selected.thumbnail,
          board: selected.board,
          public_hotel_price: selected.public_hotel_price,
          hotel_pp: selected.hotel_pp,
          distance_m: selected.distance_m,
          refundable: selected.refundable,
          cancel_deadline: selected.cancel_deadline ?? null,
        },
        price_per_person: totalPp,
      })
      navigation.navigate('DealCheckout', {
        draftToken,
        hotelId: hotelIdOf(selected) || undefined,
      })
    } catch {
      Alert.alert('Erreur', 'Impossible d’enregistrer l’hôtel')
    } finally {
      setSaving(false)
    }
  }

  const selectedId = hotelIdOf(selected)
  const cancelLabel = selected
    ? hotelCancelLabel(
        {
          refundable: selected.refundable,
          cancel_deadline: selected.cancel_deadline,
        },
        { short: true },
      )
    : null

  return (
    <View style={styles.root}>
      <ScreenBackground />
      {loading && !options.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.hint}>Recherche d’hôtels…</Text>
        </View>
      ) : error && !options.length ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            style={styles.retry}
            onPress={() => {
              setDraft(null)
              setReloadKey((k) => k + 1)
            }}
          >
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.sortRow}>
            {(
              [
                ['price', 'Prix'],
                ['rating', 'Note'],
                ['distance', 'Distance'],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setSort(key)}
                style={[styles.sortChip, sort === key && styles.sortChipOn]}
              >
                <Text style={[styles.sortText, sort === key && styles.sortTextOn]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {selected ? (
            <View style={styles.heroWrap}>
              <HotelPhotoGallery
                hotelId={selectedId}
                seedPhoto={selected.photo || selected.thumbnail}
                alt={selected.name || 'Hôtel'}
                hotelName={selected.name}
                cityLabel={cityLabel || undefined}
                height={180}
              />
            </View>
          ) : null}

          <FlatList
            data={sorted}
            keyExtractor={(item, idx) => hotelIdOf(item) || `h-${idx}`}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: insets.bottom + 120,
            }}
            ListHeaderComponent={
              cityLabel ? (
                <Text style={styles.city}>Hôtels à {cityLabel}</Text>
              ) : null
            }
            renderItem={({ item }) => {
              const id = hotelIdOf(item)
              const on = id === selectedId
              const dist = formatDistance(item.distance_m)
              const thumb = item.photo || item.thumbnail
              return (
                <Pressable
                  onPress={() => setSelected(item)}
                  style={[styles.row, on && styles.rowOn]}
                >
                  {thumb ? (
                    <Image source={{ uri: String(thumb) }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]} />
                  )}
                  <View style={styles.rowBody}>
                    <Text style={styles.name} numberOfLines={2}>
                      {item.name || 'Hôtel'}
                      {item.stars ? ` · ${item.stars}★` : ''}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[
                        item.rating != null ? `${Number(item.rating).toFixed(1)}/10` : null,
                        dist,
                        item.refundable ? 'Remboursable' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.price}>
                    {item.hotel_pp != null ? `${Math.round(Number(item.hotel_pp))} €` : '—'}
                    <Text style={styles.priceUnit}> /pers</Text>
                  </Text>
                </Pressable>
              )
            }}
          />

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {error ? <Text style={styles.footerError}>{error}</Text> : null}
            {selected && cancelLabel ? (
              <Text style={styles.cancelHint}>{cancelLabel}</Text>
            ) : null}
            <Pressable
              style={[styles.cta, (!selected || saving) && styles.ctaDisabled]}
              disabled={!selected || saving}
              onPress={() => void confirm()}
            >
              <Text style={styles.ctaText}>
                {saving ? '…' : 'Réserver cet hôtel'}
              </Text>
            </Pressable>
            <Pressable style={styles.later} onPress={() => navigation.goBack()}>
              <Text style={styles.laterText}>Plus tard</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: 12,
  },
  hint: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  error: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.danger,
    textAlign: 'center',
  },
  retry: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  retryText: { fontFamily: fonts.bold, color: colors.white },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  sortChipOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryMuted,
  },
  sortText: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  sortTextOn: { color: colors.primaryInk, fontFamily: fonts.bold },
  heroWrap: { marginBottom: spacing.sm },
  city: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  rowOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  thumb: { width: 64, height: 64, borderRadius: radius.sm },
  thumbEmpty: { backgroundColor: colors.line },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  meta: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  price: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  priceUnit: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    backgroundColor: colors.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  footerError: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.danger,
    marginBottom: 6,
  },
  cancelHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: colors.line },
  ctaText: { fontFamily: fonts.bold, color: colors.white, fontSize: 15 },
  later: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  laterText: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft },
})
