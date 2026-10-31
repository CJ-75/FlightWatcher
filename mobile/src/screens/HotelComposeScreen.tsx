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
import { type HotelUpsellOption, type MyTripDraft } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { openInAppBrowser } from '../lib/openInApp'
import { HotelComposeDetailSheet } from '../components/HotelComposeDetailSheet'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../navigation/types'
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

/** Sort key: hotel_pp first, else public total / adults. Missing → end. */
function hotelPriceSortKey(h: HotelUpsellOption, adults = 2): number {
  if (h.hotel_pp != null && !Number.isNaN(Number(h.hotel_pp))) {
    return Number(h.hotel_pp)
  }
  if (h.public_hotel_price != null && !Number.isNaN(Number(h.public_hotel_price))) {
    return Number(h.public_hotel_price) / Math.max(1, adults)
  }
  return Number.POSITIVE_INFINITY
}

type EmptyKind = 'none' | 'catalogue' | 'dates' | 'rate_limit' | 'load' | 'fatal'

function emptyKindFromReason(reason: string, status?: string): EmptyKind {
  if (reason === 'not_in_catalogue') return 'catalogue'
  if (reason === 'bad_dates') return 'dates'
  if (
    reason === 'empty_pool' ||
    reason === 'no_rates' ||
    status === 'no_rates' ||
    status === 'unavailable'
  ) {
    return 'dates'
  }
  if (reason === 'rate_limited' || reason === 'too_many_fetches') return 'rate_limit'
  return 'none'
}

function emptyCopy(kind: EmptyKind, city?: string | null) {
  const place = city?.trim() ? city.trim() : 'cette destination'
  switch (kind) {
    case 'catalogue':
      return {
        title: `Hôtels bientôt à ${place}`,
        body: 'On n’a pas encore de chambres pour cette ville. Réessaie dans un instant, ou continue avec ton vol.',
      }
    case 'dates':
      return {
        title: 'Pas de chambre pour ces dates',
        body: `Aucun logement dispo à ${place} sur ce séjour. Réessaie, ou repars sur une autre offre.`,
      }
    case 'rate_limit':
      return {
        title: 'Un peu trop de recherches',
        body: 'Attends quelques secondes puis réessaie — ou continue sans hôtel pour l’instant.',
      }
    case 'load':
      return {
        title: 'Chargement interrompu',
        body: 'La recherche hôtel n’a pas abouti. Réessaie, ou reviens aux résultats.',
      }
    case 'fatal':
      return {
        title: 'Voyage introuvable',
        body: 'Ce brouillon a expiré ou est inaccessible. Repars depuis les résultats.',
      }
    default:
      return {
        title: `On cherche encore pour ${place}`,
        body: 'Pas de résultat pour l’instant. Réessaie, change d’offre, ou continue avec ton vol seul.',
      }
  }
}

export function HotelComposeScreen({ route, navigation }: Props) {
  const { draftToken } = route.params
  const insets = useSafeAreaInsets()

  const [draft, setDraft] = useState<MyTripDraft | null>(null)
  const [options, setOptions] = useState<HotelUpsellOption[]>([])
  const [selected, setSelected] = useState<HotelUpsellOption | null>(null)
  const [sort, setSort] = useState<SortKey>('price')
  const [loading, setLoading] = useState(true)
  const [revalidating, setRevalidating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [emptyKind, setEmptyKind] = useState<EmptyKind | null>(null)
  const [cityLabel, setCityLabel] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)

  const payload = (draft?.payload || {}) as Record<string, unknown>
  const flight = (payload.flight || {}) as Record<string, unknown>
  const flightPp = Number(flight.price_pp || 0)
  const flightUrl = String(flight.booking_url || payload.booking_url || '').trim()
  const checkin = String(
    draft?.out_date || (payload.dates as { outbound?: string } | undefined)?.outbound || '',
  ).slice(0, 10)
  const checkout = String(
    draft?.ret_date || (payload.dates as { inbound?: string } | undefined)?.inbound || '',
  ).slice(0, 10)
  const adults = Number(draft?.adults || payload.adults || 2)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setEmptyKind(null)
      try {
        const row = await getApi().getMyTrip(draftToken)
        if (cancelled) return
        setDraft(row)
      } catch {
        if (!cancelled) {
          setEmptyKind('fatal')
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
        setEmptyKind('dates')
        setLoading(false)
        return
      }

      setLoading(true)
      setEmptyKind(null)

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
        optsFlags?: { paint?: boolean; stillLive?: boolean },
      ) => {
        const byPrice = [...opts].sort(
          (a, b) => hotelPriceSortKey(a, pax) - hotelPriceSortKey(b, pax),
        )
        setOptions(byPrice)
        if (meta?.city) setCityLabel(String(meta.city))
        else if (cityHint) setCityLabel(cityHint)
        const curId = hotelIdOf(currentHotel)
        const match = byPrice.find((h) => hotelIdOf(h) === curId)
        setSelected(match || byPrice[0] || null)
        // Paint list ASAP (cache/snapshot) while live rates may still run
        if (optsFlags?.paint && byPrice.length) {
          setLoading(false)
          setRevalidating(Boolean(optsFlags.stillLive))
        }
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
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, i === 0 ? 600 : 1000))
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

        // Live in parallel with cache so first paint isn't blocked by job poll
        const livePromise = fetchLive()

        if (snapshot.length) {
          applyOpts(snapshot, { night_cap: snapCap, city: cityHint }, {
            paint: true,
            stillLive: true,
          })
        } else {
          const cached = await loadCached()
          if (cancelled) return
          if (cached.opts.length) {
            applyOpts(cached.opts, cached, { paint: true, stillLive: true })
          }
        }

        let result: Awaited<ReturnType<ReturnType<typeof getApi>['fetchHotelUpsell']>> | null =
          null
        try {
          result = await livePromise
        } catch (e) {
          if (snapshot.length) {
            if (!cancelled) {
              setLoading(false)
              setRevalidating(false)
            }
            return
          }
          const cached = await loadCached()
          if (cached.opts.length) {
            applyOpts(cached.opts, cached, { paint: true, stillLive: false })
            await persistSnapshot(cached.opts, cached)
            if (!cancelled) {
              setLoading(false)
              setRevalidating(false)
            }
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
          applyOpts(opts, meta, { paint: true, stillLive: false })
          setEmptyKind(null)
          await persistSnapshot(opts, meta)
        } else {
          setEmptyKind(
            emptyKindFromReason(
              String(result?.reason || result?.status || ''),
              result?.status,
            ),
          )
        }
      } catch {
        if (!cancelled) {
          if (snapshot.length) {
            applyOpts(
              snapshot,
              {
                night_cap:
                  pl.compose_night_cap != null ? Number(pl.compose_night_cap) : null,
                city: cityHint,
              },
              { paint: true, stillLive: false },
            )
            setEmptyKind(null)
          } else {
            const again = await loadCached()
            if (again.opts.length) {
              applyOpts(again.opts, again, { paint: true, stillLive: false })
              await persistSnapshot(again.opts, again)
              setEmptyKind(null)
            } else {
              setEmptyKind('load')
            }
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRevalidating(false)
        }
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
      return hotelPriceSortKey(a, adults) - hotelPriceSortKey(b, adults)
    })
    return list
  }, [options, sort, adults])

  const confirm = async () => {
    if (!selected) return
    setSaving(true)
    setEmptyKind(null)
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

  const openSheet = (item: HotelUpsellOption) => {
    setSelected(item)
    setSheetOpen(true)
  }

  const empty = emptyKind != null ? emptyCopy(emptyKind, cityLabel) : null
  const retryHotels = () => {
    setOptions([])
    setSelected(null)
    setEmptyKind(null)
    setDraft(null)
    setReloadKey((k) => k + 1)
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      {loading && !options.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.hint}>On cherche les meilleures chambres…</Text>
        </View>
      ) : emptyKind && !options.length ? (
        <View style={[styles.emptyWrap, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyKicker}>FlightWatcher</Text>
            <Text style={styles.emptyTitle}>{empty?.title}</Text>
            <Text style={styles.emptyBody}>{empty?.body}</Text>

            {emptyKind !== 'fatal' ? (
              <Pressable style={styles.emptyPrimary} onPress={retryHotels}>
                <Text style={styles.emptyPrimaryText}>Réessayer</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={styles.emptySecondary}
              onPress={() =>
                emptyKind === 'fatal'
                  ? navigation.goBack()
                  : navigation.replace('TripSummary', { draftToken })
              }
            >
              <Text style={styles.emptySecondaryText}>
                {emptyKind === 'fatal' ? 'Retour aux résultats' : 'Continuer sans hôtel'}
              </Text>
            </Pressable>

            {flightUrl && emptyKind !== 'fatal' ? (
              <Pressable
                style={styles.emptyLink}
                onPress={() =>
                  openInAppBrowser(navigation, flightUrl, 'Réserver le vol')
                }
              >
                <Text style={styles.emptyLinkText}>Ouvrir la réservation vol</Text>
              </Pressable>
            ) : null}
          </View>
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

          {revalidating ? (
            <View style={styles.revalBar}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.revalText}>On actualise les tarifs…</Text>
            </View>
          ) : null}

          <FlatList
            data={sorted}
            keyExtractor={(item, idx) => hotelIdOf(item) || `h-${idx}`}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: insets.bottom + 100,
            }}
            ListHeaderComponent={
              cityLabel ? (
                <Text style={styles.city}>Hôtels à {cityLabel}</Text>
              ) : (
                <Text style={styles.city}>Touche un hôtel pour voir la fiche</Text>
              )
            }
            renderItem={({ item }) => {
              const id = hotelIdOf(item)
              const on = id === selectedId
              const dist = formatDistance(item.distance_m)
              const thumb = item.photo || item.thumbnail
              return (
                <Pressable
                  onPress={() => openSheet(item)}
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
            <Pressable
              style={styles.later}
              onPress={() => navigation.replace('TripSummary', { draftToken })}
            >
              <Text style={styles.laterText}>Plus tard</Text>
            </Pressable>
          </View>

          <HotelComposeDetailSheet
            visible={sheetOpen && !!selected}
            hotel={selected}
            cityLabel={cityLabel}
            checkin={checkin || null}
            checkout={checkout || null}
            adults={adults}
            saving={saving}
            onClose={() => setSheetOpen(false)}
            onConfirm={() => void confirm()}
          />
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
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 10,
  },
  emptyKicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  emptyTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 21,
    marginBottom: 6,
  },
  emptyPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPrimaryText: { fontFamily: fonts.bold, color: colors.white, fontSize: 15 },
  emptySecondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  emptySecondaryText: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 15 },
  emptyLink: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLinkText: { fontFamily: fonts.bold, fontSize: 13, color: colors.primary },
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
  revalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  revalText: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
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
  later: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterText: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft },
})
