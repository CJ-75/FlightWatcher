import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
  AppState,
  type AppStateStatus,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EnrichedTripResponse, SavedFavorite, ScanRequest } from '@flightwatcher/shared'
import {
  STORAGE_KEYS,
  cityDisplayNameFr,
  createAsyncKVStore,
  dateFromFlightIso,
  formatDateFr,
  kvSetJson,
  parseAirportCodes,
  translate,
  tripFavoriteKey,
} from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { RootStackParamList } from '../../App'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import { DestinationCard } from '../components/DestinationCard'
import { SaveSearchModal } from '../components/SaveSearchModal'
import { RouletteModal } from '../components/RouletteModal'
import { ScreenBackground } from '../components/ScreenBackground'
import { colors, fonts, shadow, spacing, type } from '../theme'
import {
  clearPendingHotelUpsell,
  createMyTripComposeFromTrip,
  openPartnerBookSync,
  readPendingHotelUpsell,
  trackPartnerEvent,
  type PendingHotelUpsell,
} from '../lib/partnerBook'
import { peekInspireLive, subscribeInspireLive } from '../lib/inspireLive'

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>
const kv = createAsyncKVStore(AsyncStorage)

const PRESET_LABELS: Record<string, string> = {
  weekend: 'Ce weekend',
  'next-weekend': 'Weekend prochain',
  'next-week': '3 jours semaine pro',
  flexible: 'Dates flexibles',
}

export function ResultsScreen({ route, navigation }: Props) {
  const searchInfo = route.params.searchInfo
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const [trips, setTrips] = useState<EnrichedTripResponse[]>(
    () => route.params.trips || [],
  )
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set())
  const [hotelUpsell, setHotelUpsell] = useState<PendingHotelUpsell | null>(null)
  const [hotelUpsellBusy, setHotelUpsellBusy] = useState(false)
  const leftForPartnerRef = React.useRef(false)
  const [showSave, setShowSave] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showRoulette, setShowRoulette] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [originFilter, setOriginFilter] = useState<Set<string> | null>(null)
  const [streaming, setStreaming] = useState(false)

  // Progressive inspire — same as web: Ryanair/TP batches append after first paint
  useEffect(() => {
    const initial = route.params.trips || []
    setTrips(initial)
    const session = peekInspireLive()
    if (session.trips.length > initial.length) {
      setTrips(session.trips)
    }
    let quietTimer: ReturnType<typeof setTimeout> | null = null
    const unsub = subscribeInspireLive((live) => {
      if (!live.length) return
      setTrips(live)
      setStreaming(true)
      if (quietTimer) clearTimeout(quietTimer)
      quietTimer = setTimeout(() => setStreaming(false), 2500)
    })
    return () => {
      unsub()
      if (quietTimer) clearTimeout(quietTimer)
      setStreaming(false)
    }
  }, [route.params.trips])

  const loadFavorites = useCallback(async () => {
    try {
      const list = (await getApi().getFavorites()) as SavedFavorite[]
      setFavoriteKeys(new Set(list.map((f) => tripFavoriteKey(f.trip))))
    } catch {
      const raw = await kv.getItem(STORAGE_KEYS.FAVORITES)
      const list = raw ? (JSON.parse(raw) as { trip: EnrichedTripResponse }[]) : []
      setFavoriteKeys(new Set(list.map((f) => tripFavoriteKey(f.trip))))
    }
  }, [])

  useEffect(() => {
    void loadFavorites()
  }, [loadFavorites])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(id)
  }, [toast])

  // Après paint vols : warm cache hôtel (lookup only — pas de LiteAPI)
  useEffect(() => {
    if (!trips.length) return
    const seen = new Set<string>()
    const items: {
      iata: string
      checkin: string
      checkout: string
      participants: number
      flight_pp: number
    }[] = []
    const pax = searchInfo?.passengers || 1
    for (const t of trips) {
      if (items.length >= 6) break
      const iata = (t.destination_code || '').trim().toUpperCase()
      const checkin = dateFromFlightIso(t.aller?.departureTime)
      const checkout = dateFromFlightIso(t.retour?.departureTime)
      if (!iata || !checkin || !checkout || checkout <= checkin) continue
      const key = `${iata}|${checkin}|${checkout}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({
        iata,
        checkin,
        checkout,
        participants: Math.max(1, pax),
        flight_pp: Number(t.prix_total) || 0,
      })
    }
    if (!items.length) return
    void getApi().lookupHotelUpsell(items).catch(() => undefined)
  }, [trips, searchInfo?.passengers])

  const isFavorite = (trip: EnrichedTripResponse) => favoriteKeys.has(tripFavoriteKey(trip))

  const passengers = searchInfo?.passengers || 1

  const handlePartnerBook = (trip: EnrichedTripResponse) => {
    leftForPartnerRef.current = true
    void openPartnerBookSync({
      trip,
      passengers,
      searchEventId: searchInfo?.searchEventId,
    }).then(async () => {
      const pending = await readPendingHotelUpsell()
      if (pending) setHotelUpsell(pending)
    })
  }

  const handleAddHotel = async (trip: EnrichedTripResponse) => {
    await clearPendingHotelUpsell()
    setHotelUpsell(null)
    setHotelUpsellBusy(true)
    try {
      const draft = await createMyTripComposeFromTrip({
        trip,
        passengers,
        markFlightBooked: false,
      })
      navigation.navigate('HotelCompose', { draftToken: draft.draft_token })
    } catch {
      Alert.alert('Erreur', 'Impossible de créer le voyage — réessaie')
    } finally {
      setHotelUpsellBusy(false)
    }
  }

  const showUpsellIfPending = useCallback(async () => {
    if (!leftForPartnerRef.current) return
    const pending = await readPendingHotelUpsell()
    if (!pending || pending.skippedBanner) return
    if (Date.now() - pending.createdAt < 600) return
    leftForPartnerRef.current = false
    setHotelUpsell(pending)
  }, [])

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        leftForPartnerRef.current = true
      }
      if (state === 'active') void showUpsellIfPending()
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [showUpsellIfPending])

  const handleHotelUpsellYes = async () => {
    const pending = hotelUpsell || (await readPendingHotelUpsell())
    if (!pending?.trip) return
    setHotelUpsellBusy(true)
    trackPartnerEvent({
      trip: pending.trip,
      partner_id: pending.partnerId,
      partner_name: pending.partnerName,
      redirect_url: pending.primaryUrl,
      action_type: 'hotel_upsell_yes',
      search_event_id: pending.searchEventId || null,
    })
    try {
      const draft = await createMyTripComposeFromTrip({
        trip: pending.trip,
        passengers: pending.passengers || passengers,
        markFlightBooked: true,
      })
      await clearPendingHotelUpsell()
      setHotelUpsell(null)
      navigation.navigate('HotelCompose', { draftToken: draft.draft_token })
    } catch {
      Alert.alert('Erreur', 'Impossible de créer le voyage — réessaie')
    } finally {
      setHotelUpsellBusy(false)
    }
  }

  const handleHotelUpsellNo = async () => {
    const pending = hotelUpsell || (await readPendingHotelUpsell())
    if (pending?.trip) {
      trackPartnerEvent({
        trip: pending.trip,
        partner_id: pending.partnerId,
        partner_name: pending.partnerName,
        redirect_url: pending.primaryUrl,
        action_type: 'hotel_upsell_no',
        search_event_id: pending.searchEventId || null,
      })
    }
    await clearPendingHotelUpsell()
    setHotelUpsell(null)
  }

  const availableOrigins = useMemo(() => {
    const set = new Set<string>()
    for (const t of trips) {
      const o = (t.aller?.origin || '').trim().toUpperCase()
      if (o.length === 3) set.add(o)
    }
    return [...set].sort()
  }, [trips])

  useEffect(() => {
    // Reset filter when results change; default = all origins visible
    setOriginFilter(null)
  }, [trips])

  const visibleTrips = useMemo(() => {
    if (!originFilter || originFilter.size === 0) return trips
    return trips.filter((t) => originFilter.has((t.aller?.origin || '').toUpperCase()))
  }, [trips, originFilter])

  const toggleOriginFilter = (code: string) => {
    setOriginFilter((prev) => {
      const base = prev ?? new Set(availableOrigins)
      const next = new Set(base)
      if (next.has(code)) {
        if (next.size <= 1) return next
        next.delete(code)
      } else {
        next.add(code)
      }
      // If all selected → null (no filter)
      if (next.size === availableOrigins.length) return null
      return next
    })
  }

  const buildScanRequest = (): ScanRequest | null => {
    if (!searchInfo) return null
    return {
      aeroport_depart: searchInfo.airport,
      dates_depart: searchInfo.datesDepart,
      dates_retour: searchInfo.datesRetour,
      budget_max: searchInfo.budget,
      passengers,
      destinations_exclues:
        searchInfo.excludedDestinations.length > 0
          ? searchInfo.excludedDestinations
          : undefined,
    }
  }

  const toggleFavorite = async (trip: EnrichedTripResponse) => {
    const key = tripFavoriteKey(trip)
    if (favoriteKeys.has(key)) {
      try {
        const list = (await getApi().getFavorites()) as SavedFavorite[]
        const found = list.find((f) => tripFavoriteKey(f.trip) === key)
        if (found) await getApi().deleteFavorite(found.id)
        setFavoriteKeys((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
        setToast('Retiré des favoris')
      } catch {
        Alert.alert('Erreur', 'Impossible de retirer le favori')
      }
      return
    }

    if (!user) {
      Alert.alert('Connexion requise', 'Connecte-toi pour sauver des favoris.')
      return
    }

    try {
      await getApi().saveFavorite({
        trip,
        search_request: buildScanRequest() || {
          aeroport_depart: trip.aller.origin,
          dates_depart: [{ date: trip.aller.departureTime.slice(0, 10) }],
          dates_retour: [{ date: trip.retour.departureTime.slice(0, 10) }],
          budget_max: Math.ceil(trip.prix_total),
        },
      })
      setFavoriteKeys((prev) => new Set(prev).add(key))
      setToast('Ajouté aux favoris')
    } catch {
      const raw = await kv.getItem(STORAGE_KEYS.FAVORITES)
      const list = raw ? JSON.parse(raw) : []
      list.push({ id: `${Date.now()}`, trip, createdAt: new Date().toISOString() })
      await kvSetJson(kv, STORAGE_KEYS.FAVORITES, list)
      setFavoriteKeys((prev) => new Set(prev).add(key))
      setToast('Favori sauvé localement')
    }
  }

  const onConfirmSave = async (name: string) => {
    const request = buildScanRequest()
    if (!request) throw new Error('Aucune recherche à sauvegarder')
    if (!user) throw new Error('Connecte-toi pour sauvegarder')
    setSaving(true)
    try {
      await getApi().saveSearch({
        name,
        request,
        lastCheckResults: trips,
        lastCheckedAt: new Date().toISOString(),
      })
      setToast('Recherche sauvegardée')
    } finally {
      setSaving(false)
    }
  }

  const departureDisplay = useMemo(() => {
    if (!searchInfo?.airport) return ''
    const codes = parseAirportCodes(searchInfo.airport)
    if (!codes.length) return searchInfo.airport
    const city = cityDisplayNameFr(codes[0])
    if (codes.length === 1) return city ? `${city} · ${codes[0]}` : codes[0]
    return city ? `${city} · ${codes.join(' · ')}` : codes.join(' · ')
  }, [searchInfo])

  const summary = useMemo(() => {
    if (!searchInfo) return null
    return {
      airport: departureDisplay || searchInfo.airport,
      budget: searchInfo.budget,
      passengers: searchInfo.passengers || 1,
      preset: PRESET_LABELS[searchInfo.datePreset] || searchInfo.datePreset,
      datesCount: searchInfo.datesDepart.length + searchInfo.datesRetour.length,
      excluded: searchInfo.excludedDestinations.length,
      firstDepart: searchInfo.datesDepart[0]?.date,
      firstRetour: searchInfo.datesRetour[0]?.date,
    }
  }, [searchInfo, departureDisplay])

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <FlatList
        style={styles.list}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.xxxl,
        }}
        data={visibleTrips}
        keyExtractor={(item, i) =>
          `${item.aller.origin}-${item.destination_code}-${item.aller.departureTime}-${i}`
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {hotelUpsell ? (
              <View style={styles.upsellBanner}>
                <Text style={styles.upsellTitle}>
                  Ton vol pour {hotelUpsell.city} est réservé ?
                </Text>
                <View style={styles.upsellRow}>
                  <Pressable
                    onPress={() => void handleHotelUpsellYes()}
                    disabled={hotelUpsellBusy}
                    style={[styles.upsellYes, hotelUpsellBusy && { opacity: 0.6 }]}
                  >
                    <Text style={styles.upsellYesText}>
                      {hotelUpsellBusy ? '…' : 'Oui, trouver mon hôtel'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleHotelUpsellNo()}
                    disabled={hotelUpsellBusy}
                    style={styles.upsellNo}
                  >
                    <Text style={styles.upsellNoText}>Pas encore</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            <Text style={styles.title}>{translate('fr', 'results.title')}</Text>
            <Text style={styles.count}>
              {visibleTrips.length} destination{visibleTrips.length > 1 ? 's' : ''}
              {visibleTrips.length !== trips.length ? ` / ${trips.length}` : ''}
              {streaming ? ' · nouvelles offres…' : ''}
            </Text>

            {availableOrigins.length > 1 ? (
              <View style={styles.originFilter}>
                <Text style={styles.originFilterLabel}>Filtrer par aéroport de départ</Text>
                <View style={styles.originChips}>
                  {availableOrigins.map((code) => {
                    const active = !originFilter || originFilter.has(code)
                    return (
                      <Pressable
                        key={code}
                        onPress={() => toggleOriginFilter(code)}
                        style={[styles.originChip, active && styles.originChipOn]}
                      >
                        <Text style={[styles.originChipText, active && styles.originChipTextOn]}>
                          {code}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            ) : null}

            {summary ? (
              <View style={[styles.summary, shadow.soft]}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Départ</Text>
                  <Text style={styles.summaryValue}>{summary.airport}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Budget / pers.</Text>
                  <Text style={styles.summaryValue}>{summary.budget}€</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Voyageurs</Text>
                  <Text style={styles.summaryValue}>{summary.passengers}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Période</Text>
                  <Text style={styles.summaryValue}>{summary.preset}</Text>
                </View>
                {summary.firstDepart && summary.firstRetour ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Dates</Text>
                    <Text style={styles.summaryValue}>
                      {formatDateFr(summary.firstDepart)} → {formatDateFr(summary.firstRetour)}
                      {summary.datesCount > 2 ? ` · ${summary.datesCount} j` : ''}
                    </Text>
                  </View>
                ) : null}
                {summary.excluded > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Exclues</Text>
                    <Text style={styles.summaryValue}>{summary.excluded}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                onPress={() => {
                  if (!user) {
                    Alert.alert('Connexion requise', 'Connecte-toi pour sauvegarder une recherche.')
                    return
                  }
                  if (!searchInfo) {
                    Alert.alert('Erreur', 'Impossible de sauvegarder cette recherche.')
                    return
                  }
                  setShowSave(true)
                }}
                style={styles.actionBtn}
              >
                <Text style={styles.actionText}>Sauvegarder</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowRoulette(true)}
                style={[styles.actionBtn, styles.actionPrimary]}
              >
                <Text style={[styles.actionText, styles.actionTextPrimary]}>Roulette</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>{translate('fr', 'results.noResults')}</Text>
            <Text style={styles.emptyHint}>
              Essaie d’augmenter le budget ou de changer de dates.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <DestinationCard
            trip={item}
            passengers={passengers}
            isFavorite={isFavorite(item)}
            onFavorite={() => void toggleFavorite(item)}
            onBook={() => handlePartnerBook(item)}
            onAddHotel={() => void handleAddHotel(item)}
            addHotelBusy={hotelUpsellBusy}
          />
        )}
        showsVerticalScrollIndicator={false}
      />

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 16 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <SaveSearchModal
        visible={showSave}
        loading={saving}
        defaultName={
          searchInfo
            ? `${departureDisplay || searchInfo.airport} · ${searchInfo.budget}€ · ${PRESET_LABELS[searchInfo.datePreset] || ''}`
            : undefined
        }
        onClose={() => setShowSave(false)}
        onSave={onConfirmSave}
      />

      <RouletteModal
        visible={showRoulette}
        trips={visibleTrips}
        budget={searchInfo?.budget || 9999}
        onClose={() => setShowRoulette(false)}
        onBook={(t) => {
          setShowRoulette(false)
          handlePartnerBook(t)
        }}
        onFavorite={(t) => void toggleFavorite(t)}
        isFavorite={isFavorite}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  list: { flex: 1, backgroundColor: 'transparent' },
  header: { marginBottom: spacing.lg },
  title: { ...type.title },
  count: { ...type.caption, marginTop: 6, fontFamily: fonts.semibold },
  originFilter: { marginTop: 14 },
  originFilterLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
    includeFontPadding: false,
  },
  originChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  originChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  originChipOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  originChipText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.inkSoft,
    includeFontPadding: false,
  },
  originChipTextOn: { color: colors.primary },
  summary: {
    marginTop: 14,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 8,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  summaryLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
    includeFontPadding: false,
  },
  summaryValue: {
    flexShrink: 1,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'right',
    includeFontPadding: false,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  actionText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
    includeFontPadding: false,
  },
  actionTextPrimary: { color: colors.white },
  emptyWrap: { marginTop: 56, alignItems: 'center', paddingHorizontal: spacing.xl },
  empty: { ...type.section, textAlign: 'center', color: colors.ink },
  emptyHint: { ...type.caption, textAlign: 'center', marginTop: spacing.sm },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: colors.ink,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  toastText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.white,
    textAlign: 'center',
    includeFontPadding: false,
  },
  upsellBanner: {
    marginBottom: 14,
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    padding: 14,
    gap: 10,
  },
  upsellTitle: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
    includeFontPadding: false,
  },
  upsellRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  upsellYes: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  upsellYesText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
    includeFontPadding: false,
  },
  upsellNo: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  upsellNoText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
    includeFontPadding: false,
  },
})
