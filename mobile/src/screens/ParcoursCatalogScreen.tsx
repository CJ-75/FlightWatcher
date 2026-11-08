import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  buildParcoursFeed,
  cityDisplayNameFr,
  isFeaturedToday,
  type Itinerary,
  type ItineraryOccasion,
} from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApi } from '../lib/client'
import { FwKicker } from '../components/FwKicker'
import { ItineraryCard } from '../components/parcours/ItineraryCard'
import { ItineraryOccasionIcon } from '../components/parcours/ItineraryOccasionIcon'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, spacing } from '../theme'

const CITY_LS = 'fw_parcours_city'
const CITIES = [
  'paris',
  'marseille',
  'lyon',
  'lisbon',
  'porto',
  'barcelona',
  'rome',
]

type Props = {
  headerExtra?: React.ReactNode
}

export function ParcoursCatalogScreen({ headerExtra }: Props) {
  const insets = useSafeAreaInsets()
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [city, setCity] = useState('paris')
  const [cityOpen, setCityOpen] = useState(false)
  const [items, setItems] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [occasion, setOccasion] = useState<ItineraryOccasion | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void AsyncStorage.getItem(CITY_LS).then((v) => {
      if (v) setCity(v)
    })
  }, [])

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await getApi().listParcours({ limit: 80 })
      if (!res.ok) throw new Error('Catalogue indisponible')
      setItems((res.itineraries || []) as unknown as Itinerary[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setItems([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void AsyncStorage.setItem(CITY_LS, city)
  }, [city])

  useEffect(() => {
    if (loading) return
    void getApi()
      .trackActivityEvent({
        domain: 'itinerary',
        event: 'itinerary_list_viewed',
        surface: 'parcours',
        platform: 'ios',
        meta: { city, count: items.length, occasion },
      })
      .catch(() => {})
  }, [loading, city, items.length, occasion])

  const rows = useMemo(
    () => buildParcoursFeed(items, { citySlug: city, occasionFilter: occasion }),
    [items, city, occasion],
  )

  const open = (it: Itinerary) => {
    void getApi()
      .trackActivityEvent({
        domain: 'itinerary',
        event: 'itinerary_card_clicked',
        surface: 'parcours',
        platform: 'ios',
        meta: { id: it.id, slug: it.slug },
      })
      .catch(() => {})
    navigation.navigate('ItineraryDetail', {
      itineraryId: it.slug || it.id,
    })
  }

  const cityLabel = cityDisplayNameFr(null, city) || city

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 110,
          paddingHorizontal: spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.primary}
          />
        }
      >
        {headerExtra}
        <FwKicker>PARCOURS</FwKicker>
        <Text style={styles.title}>Où aller, quoi faire</Text>
        <Text style={styles.subtitle}>
          Des balades et des week-ends choisis pour toi.
        </Text>

        <Pressable
          onPress={() => setCityOpen((v) => !v)}
          style={styles.cityChip}
        >
          <Text style={styles.cityChipText}>
            Près de toi · {cityLabel} ▾
          </Text>
        </Pressable>
        {cityOpen ? (
          <View style={styles.cityMenu}>
            {CITIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  setCity(c)
                  setCityOpen(false)
                }}
                style={styles.cityItem}
              >
                <Text style={styles.cityItemText}>
                  {cityDisplayNameFr(null, c) || c}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {occasion ? (
          <Pressable onPress={() => setOccasion(null)} style={{ marginTop: 12 }}>
            <Text style={styles.backLink}>← Tous les parcours</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading &&
          !occasion &&
          items.length > 0 &&
          !rows.some((r) => r.kind === 'near') ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              Pas encore de parcours à {cityLabel}
            </Text>
          </View>
        ) : null}

        {rows.map((row) => {
          if (row.kind === 'envies') {
            return (
              <View key={row.id} style={styles.section}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {row.chips.map((chip) => (
                    <Pressable
                      key={chip.occasion}
                      onPress={() => setOccasion(chip.occasion)}
                      style={styles.envie}
                    >
                      <View style={styles.envieIcon}>
                        <ItineraryOccasionIcon
                          occasion={chip.occasion}
                          size={20}
                          color="#FF6B35"
                        />
                      </View>
                      <Text style={styles.envieLabel}>{chip.label}</Text>
                      <Text style={styles.envieCount}>
                        {chip.count} parcours
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )
          }

          const landscape = row.kind === 'featured'
          return (
            <View key={row.id} style={styles.section}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {row.items.map((it) => (
                  <ItineraryCard
                    key={it.id}
                    itinerary={it}
                    variant={landscape ? 'landscape' : 'portrait'}
                    badge={
                      (it.occasions || []).includes('ferie')
                        ? 'Férié'
                        : isFeaturedToday(it)
                          ? 'Nouveau'
                          : null
                    }
                    onPress={() => open(it)}
                    style={{ marginRight: 12 }}
                  />
                ))}
              </ScrollView>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: {
    marginTop: 6,
    fontFamily: fonts.extrabold,
    fontSize: 32,
    letterSpacing: -1,
    color: colors.ink,
  },
  subtitle: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    marginBottom: 12,
  },
  cityChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cityChipText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  cityMenu: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  cityItem: { paddingHorizontal: 14, paddingVertical: 12 },
  cityItemText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  backLink: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primary,
  },
  error: { marginTop: 16, color: '#b91c1c', fontFamily: fonts.medium },
  empty: {
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  section: { marginTop: 28 },
  rowTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.ink,
    marginBottom: 12,
  },
  envie: {
    width: 132,
    marginRight: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  envieIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFE7DC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  envieLabel: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  envieCount: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
})
