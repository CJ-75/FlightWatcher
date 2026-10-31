import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Image,
  Share,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { HotelBooking } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import {
  latestTripDraft,
  listRememberedTrips,
  rememberTrip,
  type TripRecovery,
} from '../lib/tripRecovery'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
import { colors, fonts, radius, shadow, spacing } from '../theme'

const CACHE_KEY = 'fw_bookings_cache_v1'

type TabKey = 'upcoming' | 'past'

function statusMeta(status: string): { label: string; tone: string } {
  switch (status) {
    case 'confirmed':
      return { label: 'Confirmée', tone: colors.primary }
    case 'booking_pending':
    case 'payment_succeeded':
      return { label: 'Confirmation en cours', tone: '#B45309' }
    case 'payment_pending':
    case 'prebooked':
      return { label: 'Paiement à finaliser', tone: '#B45309' }
    case 'failed':
      return { label: 'Échouée', tone: '#B91C1C' }
    case 'cancelled':
      return { label: 'Annulée', tone: colors.muted }
    default:
      return { label: status || 'Brouillon', tone: colors.muted }
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function isFailed(status: string) {
  return status === 'failed' || status === 'cancelled'
}

function isUpcoming(b: HotelBooking, today: string) {
  if (isFailed(String(b.status))) return false
  const out = b.dates?.outbound
  if (!out) return b.status === 'confirmed' || b.status === 'booking_pending'
  return out >= today
}

function isPast(b: HotelBooking, today: string) {
  if (isFailed(String(b.status))) return false
  const inn = b.dates?.inbound || b.dates?.outbound
  if (!inn) return false
  return inn < today
}

function dedupeBookings(list: HotelBooking[]): HotelBooking[] {
  const seen = new Set<string>()
  const out: HotelBooking[] = []
  for (const b of list) {
    const id = String(b.id || '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(b)
  }
  return out
}

export function BookingsScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { user, isGuest } = useAuth()
  const [bookings, setBookings] = useState<HotelBooking[]>([])
  const [openTrips, setOpenTrips] = useState<TripRecovery[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('upcoming')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      if (!isRefresh) {
        try {
          const cached = await AsyncStorage.getItem(CACHE_KEY)
          if (cached) {
            const parsed = JSON.parse(cached) as HotelBooking[]
            if (Array.isArray(parsed) && parsed.length) setBookings(parsed)
          }
        } catch {
          /* ignore */
        }
      }

      const draft = await latestTripDraft()
      const remembered = await listRememberedTrips()
      setOpenTrips(remembered)
      const api = getApi()
      let list: HotelBooking[] = []

      if (user && !isGuest) {
        if (draft) {
          try {
            await api.claimMyTrip(draft)
          } catch {
            /* already claimed / expired */
          }
        }
        list = await api.listHotelBookings(draft ? { draft_token: draft } : undefined)
      } else {
        const tokens = remembered.map((t) => t.draft_token).filter(Boolean)
        if (!tokens.length && draft) tokens.push(draft)
        const chunks = await Promise.all(
          tokens.slice(0, 6).map(async (token) => {
            try {
              return await api.listHotelBookings({ draft_token: token })
            } catch {
              return [] as HotelBooking[]
            }
          }),
        )
        list = chunks.flat()
      }

      const next = dedupeBookings(Array.isArray(list) ? list : [])
      setBookings(next)
      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next.slice(0, 40)))
      } catch {
        /* quota */
      }
      for (const b of next) {
        if (b.draft_token) {
          await rememberTrip({
            draft_token: b.draft_token,
            booking_id: b.id,
            city: b.city,
          })
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setBookings([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user, isGuest])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const today = todayIso()
  const filtered = useMemo(() => {
    return bookings.filter((b) =>
      tab === 'upcoming' ? isUpcoming(b, today) : isPast(b, today),
    )
  }, [bookings, tab, today])

  const bookedTokens = useMemo(() => {
    const s = new Set<string>()
    for (const b of bookings) {
      if (
        b.draft_token &&
        (b.status === 'confirmed' ||
          b.status === 'booking_pending' ||
          b.status === 'payment_succeeded')
      ) {
        s.add(b.draft_token)
      }
    }
    return s
  }, [bookings])

  const openOnly = useMemo(
    () =>
      openTrips.filter(
        (t) => t.draft_token && !bookedTokens.has(t.draft_token),
      ),
    [openTrips, bookedTokens],
  )

  const copyCode = async (id: string, code: string) => {
    try {
      await Share.share({ message: code })
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      /* cancelled */
    }
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      {loading && bookings.length === 0 ? (
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{
            paddingTop: insets.top + 12,
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 40,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>← Retour</Text>
              </Pressable>
              <Text style={styles.title}>Mes réservations</Text>
              <Text style={styles.sub}>Hôtels réservés via FlightWatcher</Text>

              {openOnly.length > 0 ? (
                <View style={styles.openSection}>
                  <Text style={styles.openTitle}>Voyages en cours</Text>
                  {openOnly.slice(0, 5).map((t) => (
                    <Pressable
                      key={t.draft_token}
                      style={[styles.openCard, shadow.soft]}
                      onPress={() =>
                        navigation.navigate('TripSummary', {
                          draftToken: t.draft_token,
                        })
                      }
                    >
                      <Text style={styles.openCity}>
                        {t.city || 'Mon voyage'}
                      </Text>
                      <Text style={styles.openCta}>Continuer →</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={styles.tabs}>
                {(
                  [
                    ['upcoming', 'À venir'],
                    ['past', 'Passées'],
                  ] as const
                ).map(([key, label]) => (
                  <Pressable
                    key={key}
                    onPress={() => setTab(key)}
                    style={[styles.tab, tab === key && styles.tabOn]}
                  >
                    <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.empty, shadow.soft]}>
              <Text style={styles.emptyTitle}>
                {error ||
                  (tab === 'upcoming'
                    ? 'Aucune réservation à venir'
                    : 'Aucune réservation passée')}
              </Text>
              <Text style={styles.emptyBody}>
                Après un séjour réservé dans l’app, il apparaîtra ici.
              </Text>
              <Pressable
                style={styles.emptyCta}
                onPress={() => navigation.navigate('Main', { screen: 'Deals' })}
              >
                <Text style={styles.emptyCtaText}>Voir les séjours</Text>
              </Pressable>
              <Pressable
                style={styles.emptyLink}
                onPress={() => navigation.navigate('Main', { screen: 'Search' })}
              >
                <Text style={styles.emptyLinkText}>Chercher un vol</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => {
            const meta = statusMeta(String(item.status))
            const photo =
              item.hotel_photo ||
              (item.deal_snapshot as { image_url?: string } | undefined)?.image_url
            return (
              <View style={[styles.card, shadow.soft]}>
                <View style={styles.cardRow}>
                  {photo ? (
                    <Image source={{ uri: String(photo) }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.city}>
                      {item.city || 'Séjour'} · {item.hotel_name || 'Hôtel'}
                    </Text>
                    <Text style={[styles.status, { color: meta.tone }]}>
                      {meta.label}
                    </Text>
                    {item.board ? (
                      <Text style={styles.board}>{item.board}</Text>
                    ) : null}
                    {item.dates?.outbound && item.dates?.inbound ? (
                      <Text style={styles.dates}>
                        {item.dates.outbound} → {item.dates.inbound}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {item.confirmation_code ? (
                  <Pressable
                    onPress={() =>
                      void copyCode(item.id, String(item.confirmation_code))
                    }
                    hitSlop={6}
                  >
                    <Text style={styles.code}>
                      Code {item.confirmation_code}
                      {copiedId === item.id ? ' · Partagé' : ' · Partager'}
                    </Text>
                  </Pressable>
                ) : null}
                {item.charged_price != null ? (
                  <Text style={styles.price}>
                    {Math.round(Number(item.charged_price))} €
                  </Text>
                ) : null}
                {item.draft_token ? (
                  <Pressable
                    onPress={() =>
                      navigation.navigate('TripSummary', {
                        draftToken: item.draft_token!,
                      })
                    }
                    hitSlop={6}
                  >
                    <Text style={styles.openCta}>Voir le voyage →</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: spacing.lg },
  back: { fontFamily: fonts.bold, color: colors.primary, marginBottom: 8 },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.8,
  },
  sub: { marginTop: 4, fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  openSection: { marginTop: 18, gap: 8 },
  openTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  openCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  openCity: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  openCta: { fontFamily: fonts.bold, fontSize: 13, color: colors.primary },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 18 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  tabTextOn: { color: colors.white },
  empty: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 24,
    gap: 10,
  },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
  },
  emptyCta: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyCtaText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  emptyLink: { paddingVertical: 8, alignItems: 'center' },
  emptyLinkText: { fontFamily: fonts.medium, fontSize: 13, color: colors.primary },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  cardRow: { flexDirection: 'row', gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  thumbEmpty: { backgroundColor: colors.line },
  city: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  status: { fontFamily: fonts.medium, fontSize: 13, marginTop: 2 },
  board: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  code: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  dates: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  price: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
})
