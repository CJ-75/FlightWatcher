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
import {
  boardLabelFr,
  hotelCancelLabel,
  hotelStarsLabel,
  type HotelBooking,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import {
  latestTripDraft,
  listRememberedTrips,
  rememberTrip,
} from '../lib/tripRecovery'
import { BedIcon, ShareIcon } from '../components/UiIcons'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, spacing } from '../theme'

const CACHE_KEY = 'fw_bookings_cache_v1'
const BOOKINGS_TIMEOUT_MS = 8_000

type TabKey = 'upcoming' | 'past'

function statusMeta(status: string): { label: string; tone: string; soft: string } {
  switch (status) {
    case 'confirmed':
      return { label: 'Confirmée', tone: colors.success, soft: colors.successSoft }
    case 'booking_pending':
    case 'payment_succeeded':
      return { label: 'En cours', tone: colors.primaryDeep, soft: colors.primarySoft }
    case 'payment_pending':
    case 'prebooked':
      return { label: 'À payer', tone: colors.primaryDeep, soft: colors.primarySoft }
    case 'failed':
      return { label: 'Échouée', tone: colors.danger, soft: colors.dangerSoft }
    case 'cancelled':
      return { label: 'Annulée', tone: colors.muted, soft: 'rgba(138,106,88,0.12)' }
    default:
      return { label: 'En cours', tone: colors.muted, soft: colors.primarySoft }
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  return new Date(String(dateStr).slice(0, 10) + 'T12:00:00').toLocaleDateString(
    'fr-FR',
    { day: 'numeric', month: 'short' },
  )
}

function formatRange(out?: string | null, inn?: string | null) {
  return `${formatDate(out)} → ${formatDate(inn)}`
}

function nightsBetween(out?: string | null, inn?: string | null, nights?: number | null) {
  if (nights != null && !Number.isNaN(Number(nights))) {
    const n = Math.round(Number(nights))
    return n > 0 ? `${n} nuit${n > 1 ? 's' : ''}` : null
  }
  if (!out || !inn) return null
  const a = new Date(out.slice(0, 10) + 'T12:00:00').getTime()
  const b = new Date(inn.slice(0, 10) + 'T12:00:00').getTime()
  const n = Math.round((b - a) / 86400000)
  return n > 0 ? `${n} nuit${n > 1 ? 's' : ''}` : null
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
  const rank: Record<string, number> = {
    confirmed: 70,
    booking_pending: 60,
    payment_succeeded: 50,
    payment_pending: 40,
    prebooked: 30,
    draft: 20,
    cancelled: 10,
    failed: 0,
  }
  const best = new Map<string, HotelBooking>()
  for (const b of list) {
    const key = b.draft_id
      ? `draft:${b.draft_id}`
      : b.draft_token
        ? `token:${b.draft_token}`
        : b.liteapi_booking_id
          ? `lite:${b.liteapi_booking_id}`
          : `id:${b.id}`
    const previous = best.get(key)
    if (
      !previous ||
      (rank[String(b.status)] || 0) > (rank[String(previous.status)] || 0) ||
      ((rank[String(b.status)] || 0) === (rank[String(previous.status)] || 0) &&
        String(b.updated_at || b.created_at || '') >
          String(previous.updated_at || previous.created_at || ''))
    ) {
      best.set(key, b)
    }
  }
  return [...best.values()].sort(
    (a, b) =>
      String(b.updated_at || b.created_at || '').localeCompare(
        String(a.updated_at || a.created_at || ''),
      ),
  )
}

function bookingPhoto(b: HotelBooking): string | null {
  const snap = b.deal_snapshot as
    | { image_url?: string; hotel?: { photo?: string } }
    | undefined
  return b.hotel_photo || snap?.hotel?.photo || snap?.image_url || null
}

function bookingStars(b: HotelBooking): number | null {
  if (b.hotel_stars != null && Number(b.hotel_stars) > 0) return Number(b.hotel_stars)
  const snap = b.deal_snapshot as
    | { hotel_stars?: number; hotel?: { stars?: number } }
    | undefined
  const n = snap?.hotel?.stars ?? snap?.hotel_stars
  return n != null && Number(n) > 0 ? Number(n) : null
}

function bookingPrice(b: HotelBooking): number | null {
  if (b.charged_price != null) return Math.round(Number(b.charged_price))
  if (b.displayed_price != null) return Math.round(Number(b.displayed_price))
  return null
}

function withTimeout<T>(promise: Promise<T>, ms = BOOKINGS_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Le service de réservations est momentanément inaccessible.')),
      ms,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (reason) => {
        clearTimeout(timer)
        reject(reason)
      },
    )
  })
}

export function BookingsScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { user, isGuest } = useAuth()
  const [bookings, setBookings] = useState<HotelBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('upcoming')
  const [sharedId, setSharedId] = useState<string | null>(null)

  const load = useCallback(
    async (isRefresh = false) => {
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
        if (!isRefresh) setLoading(false)

        const api = getApi()
        let list: HotelBooking[] = []

        if (user && !isGuest) {
          if (draft) {
            void withTimeout(api.claimMyTrip(draft), 4_000).catch(() => {})
          }
          list = await withTimeout(
            api.listHotelBookings(draft ? { draft_token: draft } : undefined),
          )
        } else {
          const tokens = remembered.map((t) => t.draft_token).filter(Boolean)
          if (!tokens.length && draft) tokens.push(draft)
          const results = await Promise.allSettled(
            tokens.slice(0, 6).map((token) =>
              withTimeout(api.listHotelBookings({ draft_token: token })),
            ),
          )
          if (tokens.length && results.every((result) => result.status === 'rejected')) {
            throw new Error('Le service de réservations est momentanément inaccessible.')
          }
          list = results.flatMap((result) =>
            result.status === 'fulfilled' ? result.value : [],
          )
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
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [user, isGuest],
  )

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const today = todayIso()
  const upcoming = useMemo(
    () => bookings.filter((b) => isUpcoming(b, today)),
    [bookings, today],
  )
  const past = useMemo(
    () => bookings.filter((b) => isPast(b, today)),
    [bookings, today],
  )
  const activeList = tab === 'upcoming' ? upcoming : past

  const shareBooking = async (b: HotelBooking) => {
    const meta = statusMeta(String(b.status))
    const price = bookingPrice(b)
    const message = [
      `FlightWatcher — ${b.hotel_name || 'Hôtel'}`,
      b.city ? `à ${b.city}` : null,
      b.dates ? formatRange(b.dates.outbound, b.dates.inbound) : null,
      meta.label,
      b.confirmation_code ? `Code : ${b.confirmation_code}` : null,
      price != null ? `${price} €` : null,
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await Share.share({ message })
      setSharedId(b.id)
      setTimeout(() => setSharedId(null), 1500)
    } catch {
      /* cancelled */
    }
  }

  const openTrip = (token: string) => {
    navigation.navigate('TripSummary', { draftToken: token })
  }

  const renderStay = (item: HotelBooking) => {
    const meta = statusMeta(String(item.status))
    const photo = bookingPhoto(item)
    const board = boardLabelFr(item.board)
    const cancel = hotelCancelLabel(
      { refundable: item.refundable, cancel_deadline: item.cancel_deadline },
      { includeNonRefundable: true, short: true },
    )
    const nights = nightsBetween(item.dates?.outbound, item.dates?.inbound, item.nights)
    const price = bookingPrice(item)
    const stars = hotelStarsLabel(bookingStars(item))
    const details = [board, nights, item.adults ? `${item.adults} pers.` : null, cancel]
      .filter(Boolean)
      .join(' · ')

    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => {
          if (item.draft_token) openTrip(item.draft_token)
        }}
      >
        <View style={styles.thumb}>
          {photo ? (
            <Image source={{ uri: String(photo) }} style={styles.thumbImage} />
          ) : (
            <View style={styles.thumbEmpty}>
              <BedIcon size={22} color={colors.faint} />
            </View>
          )}
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.city} numberOfLines={1}>
              {item.city || 'Séjour'}
            </Text>
            <View style={[styles.badge, { backgroundColor: meta.soft }]}>
              <Text style={[styles.badgeText, { color: meta.tone }]}>{meta.label}</Text>
            </View>
          </View>

          {stars ? <Text style={styles.stars}>{stars}</Text> : null}
          <Text style={styles.hotel} numberOfLines={1}>
            {item.hotel_name || 'Hôtel'}
          </Text>
          <Text style={styles.dates} numberOfLines={1}>
            {formatRange(item.dates?.outbound, item.dates?.inbound)}
          </Text>
          {details ? (
            <Text style={styles.details} numberOfLines={1}>
              {details}
            </Text>
          ) : null}

          {item.confirmation_code ? (
            <View style={styles.codeRow}>
              <Text style={styles.codeLabel}>Réf.</Text>
              <Text style={styles.codeValue} numberOfLines={1}>
                {item.confirmation_code}
              </Text>
            </View>
          ) : null}

          <View style={styles.rowFooter}>
            {price != null ? <Text style={styles.price}>{price} €</Text> : <View />}
            <View style={styles.rowActions}>
              <Pressable
                hitSlop={8}
                onPress={() => void shareBooking(item)}
                style={styles.iconBtn}
              >
                <ShareIcon
                  size={15}
                  color={sharedId === item.id ? colors.success : colors.muted}
                />
              </Pressable>
              {item.draft_token ? (
                <Pressable
                  onPress={() => openTrip(item.draft_token!)}
                  style={styles.linkBtn}
                >
                  <Text style={styles.linkBtnText}>Ouvrir</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={styles.root}>
      {loading && bookings.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={activeList}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 40,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Réservations</Text>
              <Text style={styles.subtitle}>
                {upcoming.length > 0
                  ? `${upcoming.length} séjour${upcoming.length > 1 ? 's' : ''} à venir`
                  : 'Vos séjours et références hôtel'}
              </Text>

              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.tabs}>
                {(
                  [
                    ['upcoming', 'À venir', upcoming.length],
                    ['past', 'Passés', past.length],
                  ] as const
                ).map(([key, label, count]) => {
                  const on = tab === key
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setTab(key)}
                      style={[styles.tab, on && styles.tabOn]}
                    >
                      <Text style={[styles.tabText, on && styles.tabTextOn]}>
                        {label}
                      </Text>
                      <Text style={[styles.tabCount, on && styles.tabCountOn]}>
                        {count}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <BedIcon size={24} color={colors.primaryDeep} />
              </View>
              <Text style={styles.emptyTitle}>
                {tab === 'upcoming' ? 'Aucun séjour à venir' : 'Aucun séjour passé'}
              </Text>
              <Text style={styles.emptySub}>
                {error
                  ? 'Réessayez plus tard ou reconnectez-vous au Wi‑Fi.'
                  : 'Cherchez un séjour pour démarrer votre prochain voyage.'}
              </Text>
              <Pressable
                style={styles.emptyCta}
                onPress={() => navigation.navigate('Main', { screen: 'Deals' })}
              >
                <Text style={styles.emptyCtaText}>Explorer les séjours</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => renderStay(item)}
        />
      )}
    </View>
  )
}

export default BookingsScreen

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingTop: 18,
    paddingBottom: 8,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    letterSpacing: -0.8,
    color: colors.ink,
    lineHeight: 34,
  },
  subtitle: {
    marginTop: 6,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },

  errorBanner: {
    marginTop: 14,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.danger,
    lineHeight: 18,
  },

  resumeBlock: {
    marginTop: 18,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: 14,
    gap: 12,
  },
  resumeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resumeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeHeadCopy: { flex: 1, gap: 2 },
  resumeKicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.primaryMuted,
  },
  resumeTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    letterSpacing: -0.2,
    color: colors.white,
  },
  resumeList: { gap: 8 },
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,249,245,0.08)',
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,107,53,0.35)',
  },
  resumeCardPressed: {
    backgroundColor: 'rgba(255,249,245,0.14)',
  },
  resumeCardCopy: { flex: 1, minWidth: 0, gap: 3 },
  resumeCity: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
  },
  resumeHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: 'rgba(255,249,245,0.68)',
  },
  resumeCta: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resumeCtaText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
  },

  tabs: {
    marginTop: 20,
    marginBottom: 18,
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.full,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  tabOn: {
    backgroundColor: colors.primarySoft,
  },
  tabText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.faint,
  },
  tabTextOn: { color: colors.ink },
  tabCount: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.faint,
  },
  tabCountOn: { color: colors.primaryDeep },

  sep: { height: 10 },

  row: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 12,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  rowPressed: { opacity: 0.92 },

  thumb: {
    width: 92,
    height: 112,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },

  rowBody: { flex: 1, minWidth: 0, justifyContent: 'space-between' },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  city: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.primaryDeep,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  stars: {
    marginTop: 4,
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 1,
    color: '#D97706',
  },
  hotel: {
    marginTop: 2,
    fontFamily: fonts.bold,
    fontSize: 16,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  dates: {
    marginTop: 3,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  details: {
    marginTop: 3,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },

  codeRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  codeLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.faint,
  },
  codeValue: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 13,
    letterSpacing: 0.4,
    color: colors.ink,
  },

  rowFooter: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontFamily: fonts.extrabold,
    fontSize: 16,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  linkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  linkBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
  },

  empty: {
    marginTop: 28,
    alignItems: 'flex-start',
    gap: 10,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    maxWidth: 300,
  },
  emptyCta: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptyCtaText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.white,
  },
})
