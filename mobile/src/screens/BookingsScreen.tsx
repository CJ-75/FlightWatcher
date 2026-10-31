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
  ScrollView,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  boardLabelFr,
  hotelCancelLabel,
  type HotelBooking,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import {
  latestTripDraft,
  listRememberedTrips,
  rememberTrip,
  type TripRecovery,
} from '../lib/tripRecovery'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, spacing } from '../theme'

const CACHE_KEY = 'fw_bookings_cache_v1'
const { width: SCREEN_W } = Dimensions.get('window')

type TabKey = 'upcoming' | 'past'

function statusMeta(status: string): {
  label: string
  tone: string
  soft: string
  hint: string
} {
  switch (status) {
    case 'confirmed':
      return {
        label: 'Confirmée',
        tone: '#0F8A5F',
        soft: 'rgba(15,138,95,0.14)',
        hint: 'Présente le code à l’arrivée.',
      }
    case 'booking_pending':
    case 'payment_succeeded':
      return {
        label: 'En cours',
        tone: '#C2410C',
        soft: 'rgba(194,65,12,0.12)',
        hint: 'Confirmation en cours.',
      }
    case 'payment_pending':
    case 'prebooked':
      return {
        label: 'À payer',
        tone: '#C2410C',
        soft: 'rgba(194,65,12,0.12)',
        hint: 'La chambre n’est pas encore garantie.',
      }
    case 'failed':
      return {
        label: 'Échouée',
        tone: colors.danger,
        soft: colors.dangerSoft,
        hint: 'Aucune réservation active.',
      }
    case 'cancelled':
      return {
        label: 'Annulée',
        tone: colors.muted,
        soft: 'rgba(138,106,88,0.12)',
        hint: 'Plus active.',
      }
    default:
      return {
        label: 'En cours',
        tone: colors.muted,
        soft: colors.primarySoft,
        hint: '',
      }
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

function formatDateLong(dateStr?: string | null) {
  if (!dateStr) return '—'
  return new Date(String(dateStr).slice(0, 10) + 'T12:00:00').toLocaleDateString(
    'fr-FR',
    { weekday: 'short', day: 'numeric', month: 'long' },
  )
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

function bookingPhoto(b: HotelBooking): string | null {
  const snap = b.deal_snapshot as
    | { image_url?: string; hotel?: { photo?: string } }
    | undefined
  return b.hotel_photo || snap?.hotel?.photo || snap?.image_url || null
}

function bookingPrice(b: HotelBooking): number | null {
  if (b.charged_price != null) return Math.round(Number(b.charged_price))
  if (b.displayed_price != null) return Math.round(Number(b.displayed_price))
  return null
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
          list = await api.listHotelBookings(
            draft ? { draft_token: draft } : undefined,
          )
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

  const featured = tab === 'upcoming' ? upcoming[0] : null
  const listRest =
    tab === 'upcoming' ? upcoming.slice(featured ? 1 : 0) : past

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
      openTrips.filter((t) => t.draft_token && !bookedTokens.has(t.draft_token)),
    [openTrips, bookedTokens],
  )

  const shareBooking = async (b: HotelBooking) => {
    const meta = statusMeta(String(b.status))
    const price = bookingPrice(b)
    const message = [
      `FlightWatcher — ${b.hotel_name || 'Hôtel'}`,
      b.city ? `à ${b.city}` : null,
      b.dates
        ? `${formatDate(b.dates.outbound)} → ${formatDate(b.dates.inbound)}`
        : null,
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

  const renderStayCard = (item: HotelBooking, featuredCard: boolean) => {
    const meta = statusMeta(String(item.status))
    const photo = bookingPhoto(item)
    const board = boardLabelFr(item.board)
    const cancel = hotelCancelLabel(
      {
        refundable: item.refundable,
        cancel_deadline: item.cancel_deadline,
      },
      { includeNonRefundable: true, short: true },
    )
    const nights = nightsBetween(
      item.dates?.outbound,
      item.dates?.inbound,
      item.nights,
    )
    const price = bookingPrice(item)
    const heroH = featuredCard ? Math.min(280, SCREEN_W * 0.72) : 168

    return (
      <Pressable
        key={item.id}
        style={[styles.stay, featuredCard && styles.stayFeatured]}
        onPress={() => {
          if (item.draft_token) openTrip(item.draft_token)
        }}
      >
        <View style={[styles.stayHero, { height: heroH }]}>
          {photo ? (
            <Image source={{ uri: String(photo) }} style={styles.stayImage} />
          ) : (
            <View style={[styles.stayImage, styles.stayImageEmpty]} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(26,18,14,0.15)', 'rgba(26,18,14,0.92)']}
            locations={[0.25, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.stamp, { backgroundColor: meta.soft }]}>
            <Text style={[styles.stampText, { color: meta.tone }]}>
              {meta.label}
            </Text>
          </View>
          {price != null ? (
            <View style={styles.priceBadge}>
              <Text style={styles.priceBadgeValue}>{price} €</Text>
            </View>
          ) : null}
          <View style={styles.stayHeroCopy}>
            <Text style={styles.stayCity}>
              {(item.city || 'Séjour').toUpperCase()}
            </Text>
            <Text style={styles.stayHotel} numberOfLines={2}>
              {item.hotel_name || 'Hôtel'}
            </Text>
            <Text style={styles.stayDates}>
              {formatDateLong(item.dates?.outbound)}
              {'  →  '}
              {formatDate(item.dates?.inbound)}
              {nights ? `  ·  ${nights}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.stayBody}>
          <View style={styles.metaRow}>
            {[board, cancel, item.adults ? `${item.adults} pers.` : null]
              .filter(Boolean)
              .map((label) => (
                <Text key={String(label)} style={styles.metaPill}>
                  {label}
                </Text>
              ))}
          </View>

          {meta.hint ? <Text style={styles.hint}>{meta.hint}</Text> : null}

          {item.confirmation_code ? (
            <View style={styles.ticket}>
              <View style={styles.ticketNotchL} />
              <View style={styles.ticketNotchR} />
              <Text style={styles.ticketLabel}>Code hôtel</Text>
              <View style={styles.ticketRow}>
                <Text style={styles.ticketCode}>{item.confirmation_code}</Text>
                <Pressable
                  onPress={() => void shareBooking(item)}
                  hitSlop={8}
                  style={styles.ticketShare}
                >
                  <Text style={styles.ticketShareText}>
                    {sharedId === item.id ? 'OK' : 'Partager'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.stayActions}>
            {item.draft_token ? (
              <Pressable
                style={styles.ctaInk}
                onPress={() => openTrip(item.draft_token!)}
              >
                <Text style={styles.ctaInkText}>Voir mon voyage</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.ctaInk}
                onPress={() => void shareBooking(item)}
              >
                <Text style={styles.ctaInkText}>Partager</Text>
              </Pressable>
            )}
            {item.draft_token ? (
              <Pressable
                style={styles.ctaGhost}
                onPress={() => void shareBooking(item)}
              >
                <Text style={styles.ctaGhostText}>
                  {sharedId === item.id ? 'Partagé' : 'Partager'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      {loading && bookings.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={listRest}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 48,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View>
              <LinearGradient
                colors={['#2A1A12', '#1A120E', '#3D2418']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.masthead, { paddingTop: insets.top + 44 }]}
              >
                <View style={styles.mastOrb} />
                <Text style={styles.mastKicker}>FlightWatcher</Text>
                <Text style={styles.mastTitle}>Tes séjours</Text>
                <Text style={styles.mastSub}>
                  {upcoming.length > 0
                    ? `${upcoming.length} à venir · codes & chambres au même endroit`
                    : 'Tes chambres confirmées et voyages en cours'}
                </Text>

                {openOnly.length > 0 ? (
                  <View style={styles.openBlock}>
                    <Text style={styles.openLabel}>À finir</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.openScroll}
                    >
                      {openOnly.slice(0, 6).map((t) => (
                        <Pressable
                          key={t.draft_token}
                          style={styles.openChip}
                          onPress={() => openTrip(t.draft_token)}
                        >
                          <Text style={styles.openChipCity} numberOfLines={1}>
                            {t.city || 'Voyage'}
                          </Text>
                          <Text style={styles.openChipCta}>Continuer →</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </LinearGradient>

              <View style={styles.sheet}>
                <View style={styles.tabs}>
                  {(
                    [
                      ['upcoming', 'À venir', upcoming.length],
                      ['past', 'Souvenirs', past.length],
                    ] as const
                  ).map(([key, label, count]) => {
                    const on = tab === key
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setTab(key)}
                        style={styles.tab}
                      >
                        <Text style={[styles.tabText, on && styles.tabTextOn]}>
                          {label}
                        </Text>
                        <Text style={[styles.tabCount, on && styles.tabCountOn]}>
                          {count}
                        </Text>
                        {on ? <View style={styles.tabUnderline} /> : null}
                      </Pressable>
                    )
                  })}
                </View>

                {featured ? (
                  <View style={styles.featuredWrap}>
                    <Text style={styles.featuredLabel}>Prochain séjour</Text>
                    {renderStayCard(featured, true)}
                  </View>
                ) : null}
              </View>
            </View>
          }
          ListEmptyComponent={
            featured ? null : (
              <View style={styles.emptyWrap}>
                <LinearGradient
                  colors={['#FF6B35', '#E85A28', '#C2410C']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.emptyHero}
                >
                  <Text style={styles.emptyKicker}>Rien ici… encore</Text>
                  <Text style={styles.emptyTitle}>
                    {error
                      ? error
                      : tab === 'upcoming'
                        ? 'Ton prochain week-end commence par une recherche'
                        : 'Les séjours passés apparaîtront ici'}
                  </Text>
                  <Pressable
                    style={styles.emptyCta}
                    onPress={() =>
                      navigation.navigate('Main', { screen: 'Deals' })
                    }
                  >
                    <Text style={styles.emptyCtaText}>Voir les séjours</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      navigation.navigate('Main', { screen: 'Search' })
                    }
                    hitSlop={8}
                  >
                    <Text style={styles.emptyLink}>Chercher un vol →</Text>
                  </Pressable>
                </LinearGradient>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View style={styles.listPad}>{renderStayCard(item, false)}</View>
          )}
        />
      )}
    </View>
  )
}

export default BookingsScreen

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  masthead: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 28,
    overflow: 'hidden',
  },
  mastOrb: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,107,53,0.22)',
  },
  mastKicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.primary,
    marginBottom: 8,
  },
  mastTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 36,
    letterSpacing: -1.4,
    color: '#FFF9F5',
    lineHeight: 40,
  },
  mastSub: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,249,245,0.72)',
    maxWidth: 300,
  },

  openBlock: { marginTop: 22, gap: 10 },
  openLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,249,245,0.55)',
  },
  openScroll: { gap: 10, paddingRight: 8 },
  openChip: {
    minWidth: 132,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,249,245,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,107,53,0.35)',
    gap: 4,
  },
  openChipCity: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#FFF9F5',
  },
  openChipCta: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primaryMuted,
  },

  sheet: {
    marginTop: -14,
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 18,
    paddingHorizontal: spacing.xl,
    minHeight: 80,
  },
  tabs: {
    flexDirection: 'row',
    gap: 22,
    marginBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  tab: {
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  tabText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.faint,
  },
  tabTextOn: { color: colors.ink },
  tabCount: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.faint,
  },
  tabCountOn: { color: colors.primary },
  tabUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },

  featuredWrap: { marginBottom: 8, gap: 10 },
  featuredLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.primaryDeep,
  },
  listPad: { paddingHorizontal: spacing.xl },

  stay: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  stayFeatured: {
    borderColor: colors.primaryMuted,
  },
  stayHero: {
    width: '100%',
    backgroundColor: '#2A1A12',
    overflow: 'hidden',
  },
  stayImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  stayImageEmpty: { backgroundColor: '#3D2418' },
  stamp: {
    position: 'absolute',
    top: 14,
    left: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  stampText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.3 },
  priceBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(255,249,245,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  priceBadgeValue: {
    fontFamily: fonts.extrabold,
    fontSize: 16,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  stayHeroCopy: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    gap: 4,
  },
  stayCity: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.primaryMuted,
  },
  stayHotel: {
    fontFamily: fonts.extrabold,
    fontSize: 24,
    letterSpacing: -0.6,
    color: '#FFF9F5',
    lineHeight: 28,
  },
  stayDates: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,249,245,0.82)',
  },

  stayBody: { padding: 16, gap: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPill: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.inkSoft,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },

  ticket: {
    backgroundColor: '#1A120E',
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  ticketNotchL: {
    position: 'absolute',
    left: -8,
    top: 28,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.white,
  },
  ticketNotchR: {
    position: 'absolute',
    right: -8,
    top: 28,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.white,
  },
  ticketLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.primary,
    marginBottom: 6,
  },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  ticketCode: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    letterSpacing: 1.4,
    color: '#FFF9F5',
    flexShrink: 1,
  },
  ticketShare: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  ticketShareText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
  },

  stayActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ctaInk: {
    flex: 1,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaInkText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#FFF9F5',
  },
  ctaGhost: { paddingHorizontal: 8, paddingVertical: 12 },
  ctaGhostText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryDeep,
  },

  emptyWrap: { paddingHorizontal: spacing.xl, paddingTop: 4 },
  emptyHero: {
    borderRadius: radius.xl,
    padding: 28,
    gap: 12,
    overflow: 'hidden',
  },
  emptyKicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,249,245,0.75)',
  },
  emptyTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    letterSpacing: -0.8,
    lineHeight: 32,
    color: '#FFF9F5',
  },
  emptyCta: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#FFF9F5',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  emptyCtaText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primaryInk,
  },
  emptyLink: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: 'rgba(255,249,245,0.9)',
    marginTop: 4,
  },
})
