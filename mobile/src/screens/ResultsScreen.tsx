import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EnrichedTripResponse, SavedFavorite, ScanRequest } from '@flightwatcher/shared'
import {
  STORAGE_KEYS,
  createAsyncKVStore,
  kvSetJson,
  translate,
  tripFavoriteKey,
  formatDateFr,
} from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { RootStackParamList } from '../../App'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import { DestinationCard } from '../components/DestinationCard'
import { BookingSheet } from '../components/BookingSheet'
import { SaveSearchModal } from '../components/SaveSearchModal'
import { RouletteModal } from '../components/RouletteModal'
import { colors, fonts, shadow, spacing, type } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>
const kv = createAsyncKVStore(AsyncStorage)

const PRESET_LABELS: Record<string, string> = {
  weekend: 'Ce weekend',
  'next-weekend': 'Weekend prochain',
  'next-week': '3 jours semaine pro',
  flexible: 'Dates flexibles',
}

export function ResultsScreen({ route }: Props) {
  const trips = route.params.trips || []
  const searchInfo = route.params.searchInfo
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set())
  const [bookingTrip, setBookingTrip] = useState<EnrichedTripResponse | null>(null)
  const [showSave, setShowSave] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showRoulette, setShowRoulette] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

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

  const isFavorite = (trip: EnrichedTripResponse) => favoriteKeys.has(tripFavoriteKey(trip))

  const passengers = searchInfo?.passengers || 1

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

  const summary = useMemo(() => {
    if (!searchInfo) return null
    return {
      airport: searchInfo.airport,
      budget: searchInfo.budget,
      passengers: searchInfo.passengers || 1,
      preset: PRESET_LABELS[searchInfo.datePreset] || searchInfo.datePreset,
      datesCount: searchInfo.datesDepart.length + searchInfo.datesRetour.length,
      excluded: searchInfo.excludedDestinations.length,
      firstDepart: searchInfo.datesDepart[0]?.date,
      firstRetour: searchInfo.datesRetour[0]?.date,
    }
  }, [searchInfo])

  return (
    <View style={styles.root}>
      <FlatList
        style={styles.list}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.xxxl,
        }}
        data={trips}
        keyExtractor={(item, i) => `${item.destination_code}-${item.aller.departureTime}-${i}`}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{translate('fr', 'results.title')}</Text>
            <Text style={styles.count}>
              {trips.length} destination{trips.length > 1 ? 's' : ''}
            </Text>

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
            onBook={() => setBookingTrip(item)}
          />
        )}
        showsVerticalScrollIndicator={false}
      />

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 16 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <BookingSheet
        trip={bookingTrip}
        passengers={passengers}
        searchEventId={searchInfo?.searchEventId}
        onClose={() => setBookingTrip(null)}
        onSaveFavorite={
          bookingTrip
            ? () => {
                void toggleFavorite(bookingTrip)
              }
            : undefined
        }
      />

      <SaveSearchModal
        visible={showSave}
        loading={saving}
        defaultName={
          searchInfo
            ? `${searchInfo.airport} · ${searchInfo.budget}€ · ${PRESET_LABELS[searchInfo.datePreset] || ''}`
            : undefined
        }
        onClose={() => setShowSave(false)}
        onSave={onConfirmSave}
      />

      <RouletteModal
        visible={showRoulette}
        trips={trips}
        budget={searchInfo?.budget || 9999}
        onClose={() => setShowRoulette(false)}
        onBook={(t) => {
          setShowRoulette(false)
          setBookingTrip(t)
        }}
        onFavorite={(t) => void toggleFavorite(t)}
        isFavorite={isFavorite}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  list: { flex: 1 },
  header: { marginBottom: spacing.lg },
  title: { ...type.title },
  count: { ...type.caption, marginTop: 6, fontFamily: fonts.semibold },
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
})
