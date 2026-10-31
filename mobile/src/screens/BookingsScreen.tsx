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
} from 'react-native'
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
import {
  BedIcon,
  CalendarIcon,
  CardIcon,
  CheckIcon,
  PlaneIcon,
  TicketIcon,
  TipIcon,
  UsersIcon,
} from '../components/UiIcons'
import type { RootStackParamList } from '../../App'
import { colors, fonts, radius, shadow, spacing } from '../theme'

const CACHE_KEY = 'fw_bookings_cache_v1'

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
        tone: colors.success,
        soft: colors.successSoft,
        hint: 'Chambre garantie — présente le code à l’arrivée.',
      }
    case 'booking_pending':
    case 'payment_succeeded':
      return {
        label: 'On finalise…',
        tone: '#B45309',
        soft: '#FFF7ED',
        hint: 'Paiement reçu — confirmation en cours.',
      }
    case 'payment_pending':
    case 'prebooked':
      return {
        label: 'À payer',
        tone: '#B45309',
        soft: '#FFF7ED',
        hint: 'La chambre n’est pas encore garantie.',
      }
    case 'failed':
      return {
        label: 'Non confirmée',
        tone: colors.danger,
        soft: colors.dangerSoft,
        hint: 'Aucune réservation active.',
      }
    case 'cancelled':
      return {
        label: 'Annulée',
        tone: colors.muted,
        soft: colors.canvas,
        hint: 'Cette réservation n’est plus active.',
      }
    default:
      return {
        label: 'En cours',
        tone: colors.muted,
        soft: colors.primarySoft,
        hint: 'Réservation en cours.',
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
    { weekday: 'short', day: 'numeric', month: 'short' },
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
  return (
    b.hotel_photo ||
    snap?.hotel?.photo ||
    snap?.image_url ||
    null
  )
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
  const upcoming = useMemo(
    () => bookings.filter((b) => isUpcoming(b, today)),
    [bookings, today],
  )
  const past = useMemo(
    () => bookings.filter((b) => isPast(b, today)),
    [bookings, today],
  )
  const filtered = tab === 'upcoming' ? upcoming : past

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
    const price =
      b.charged_price != null
        ? Math.round(Number(b.charged_price))
        : b.displayed_price != null
          ? Math.round(Number(b.displayed_price))
          : null
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

  const renderBooking = ({ item }: { item: HotelBooking }) => {
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
    const adults =
      item.adults != null && Number(item.adults) > 0
        ? `${Math.round(Number(item.adults))} pers.`
        : null
    const price =
      item.charged_price != null
        ? Math.round(Number(item.charged_price))
        : item.displayed_price != null
          ? Math.round(Number(item.displayed_price))
          : null
    const stars =
      item.hotel_stars != null
        ? '★'.repeat(Math.min(5, Math.round(Number(item.hotel_stars))))
        : null

    return (
      <View style={[styles.card, shadow.soft]}>
        <View style={styles.heroWrap}>
          {photo ? (
            <Image source={{ uri: String(photo) }} style={styles.hero} />
          ) : (
            <View style={[styles.hero, styles.heroEmpty]}>
              <BedIcon size={28} color={colors.faint} />
            </View>
          )}
          <View style={[styles.statusChip, { backgroundColor: meta.soft }]}>
            <Text style={[styles.statusChipText, { color: meta.tone }]}>
              {meta.label}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cityKicker} numberOfLines={1}>
                {[item.city || 'Séjour', stars, item.hotel_rating != null
                  ? `${Number(item.hotel_rating).toFixed(1)}/10`
                  : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text style={styles.hotelName} numberOfLines={2}>
                {item.hotel_name || 'Hôtel'}
              </Text>
            </View>
            {price != null ? (
              <View style={styles.priceCol}>
                <Text style={styles.price}>{price} €</Text>
                <Text style={styles.priceHint}>hôtel</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.metaChips}>
            {item.dates?.outbound && item.dates?.inbound ? (
              <View style={styles.metaChip}>
                <CalendarIcon size={12} color={colors.muted} />
                <Text style={styles.metaChipText}>
                  {formatDate(item.dates.outbound)} →{' '}
                  {formatDate(item.dates.inbound)}
                </Text>
              </View>
            ) : null}
            {nights ? (
              <View style={styles.metaChip}>
                <BedIcon size={12} color={colors.muted} />
                <Text style={styles.metaChipText}>{nights}</Text>
              </View>
            ) : null}
            {adults ? (
              <View style={styles.metaChip}>
                <UsersIcon size={12} color={colors.muted} />
                <Text style={styles.metaChipText}>{adults}</Text>
              </View>
            ) : null}
            {board ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{board}</Text>
              </View>
            ) : null}
            {cancel ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{cancel}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.hint}>{meta.hint}</Text>

          {item.confirmation_code && String(item.status) === 'confirmed' ? (
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>À présenter à l’hôtel</Text>
              <View style={styles.codeRow}>
                <Text style={styles.codeValue}>{item.confirmation_code}</Text>
                <Pressable
                  onPress={() => void shareBooking(item)}
                  style={styles.codeBtn}
                  hitSlop={6}
                >
                  <Text style={styles.codeBtnText}>
                    {sharedId === item.id ? 'Envoyé' : 'Partager'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : item.confirmation_code ? (
            <Pressable
              onPress={() => void shareBooking(item)}
              style={styles.codeSoft}
            >
              <TicketIcon size={14} />
              <Text style={styles.codeSoftText}>
                Code {item.confirmation_code}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.actions}>
            {item.draft_token ? (
              <Pressable
                style={styles.actionPrimary}
                onPress={() =>
                  navigation.navigate('TripSummary', {
                    draftToken: item.draft_token!,
                  })
                }
              >
                <PlaneIcon size={14} color={colors.white} />
                <Text style={styles.actionPrimaryText}>Voir mon voyage</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.actionGhost}
              onPress={() => void shareBooking(item)}
            >
              <Text style={styles.actionGhostText}>
                {sharedId === item.id ? 'Partagé ✓' : 'Partager'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      {loading && bookings.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{
            paddingTop: 4,
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
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.lead}>
                Tes chambres, codes et voyages en un coup d’œil.
              </Text>

              <View style={styles.stats}>
                <View style={[styles.stat, shadow.soft]}>
                  <CalendarIcon size={16} />
                  <Text style={styles.statValue}>{upcoming.length}</Text>
                  <Text style={styles.statLabel}>À venir</Text>
                </View>
                <View style={[styles.stat, shadow.soft]}>
                  <TicketIcon size={16} />
                  <Text style={styles.statValue}>{openOnly.length}</Text>
                  <Text style={styles.statLabel}>À finir</Text>
                </View>
                <View style={[styles.stat, shadow.soft]}>
                  <CheckIcon size={16} />
                  <Text style={styles.statValue}>{past.length}</Text>
                  <Text style={styles.statLabel}>Passées</Text>
                </View>
              </View>

              {openOnly.length > 0 ? (
                <View style={styles.openSection}>
                  <View style={styles.sectionHead}>
                    <TipIcon size={14} />
                    <Text style={styles.sectionTitle}>Voyages à finir</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.openScroll}
                  >
                    {openOnly.slice(0, 6).map((t) => (
                      <Pressable
                        key={t.draft_token}
                        style={[styles.openCard, shadow.soft]}
                        onPress={() =>
                          navigation.navigate('TripSummary', {
                            draftToken: t.draft_token,
                          })
                        }
                      >
                        <View style={styles.openIcon}>
                          <PlaneIcon size={16} />
                        </View>
                        <Text style={styles.openCity} numberOfLines={1}>
                          {t.city || 'Mon voyage'}
                        </Text>
                        <Text style={styles.openCta}>Continuer</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.tabs}>
                {(
                  [
                    ['upcoming', 'À venir', upcoming.length],
                    ['past', 'Passées', past.length],
                  ] as const
                ).map(([key, label, count]) => (
                  <Pressable
                    key={key}
                    onPress={() => setTab(key)}
                    style={[styles.tab, tab === key && styles.tabOn]}
                  >
                    <Text
                      style={[styles.tabText, tab === key && styles.tabTextOn]}
                    >
                      {label}
                    </Text>
                    <View
                      style={[
                        styles.tabBadge,
                        tab === key && styles.tabBadgeOn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabBadgeText,
                          tab === key && styles.tabBadgeTextOn,
                        ]}
                      >
                        {count}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.empty, shadow.soft]}>
              <View style={styles.emptyIcon}>
                <BedIcon size={22} />
              </View>
              <Text style={styles.emptyTitle}>
                {error ||
                  (tab === 'upcoming'
                    ? 'Rien de prévu pour l’instant'
                    : 'Pas encore de séjour passé')}
              </Text>
              <Text style={styles.emptyBody}>
                Réserve un hôtel depuis un deal ou ton voyage — tout
                s’affichera ici avec le code de confirmation.
              </Text>
              <Pressable
                style={styles.emptyCta}
                onPress={() => navigation.navigate('Main', { screen: 'Deals' })}
              >
                <CardIcon size={15} color={colors.white} />
                <Text style={styles.emptyCtaText}>Voir les séjours</Text>
              </Pressable>
              <Pressable
                style={styles.emptyLink}
                onPress={() =>
                  navigation.navigate('Main', { screen: 'Search' })
                }
              >
                <Text style={styles.emptyLinkText}>Chercher un vol</Text>
              </Pressable>
            </View>
          }
          renderItem={renderBooking}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: spacing.md, gap: 14 },
  lead: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  stats: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
  },
  openSection: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  openScroll: { gap: 10, paddingRight: 8 },
  openCard: {
    width: 148,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 14,
    gap: 8,
  },
  openIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openCity: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  openCta: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primaryDeep,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: radius.md,
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
    borderRadius: radius.sm,
  },
  tabOn: { backgroundColor: colors.primarySoft },
  tabText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  tabTextOn: { color: colors.primaryInk },
  tabBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.canvas,
  },
  tabBadgeOn: { backgroundColor: colors.primaryMuted },
  tabBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  tabBadgeTextOn: { color: colors.primaryInk },
  empty: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.ink,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyCtaText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  emptyLink: { paddingVertical: 8 },
  emptyLinkText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primaryDeep,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    marginBottom: 14,
    overflow: 'hidden',
  },
  heroWrap: { position: 'relative' },
  hero: {
    width: '100%',
    height: 148,
    backgroundColor: colors.line,
  },
  heroEmpty: { alignItems: 'center', justifyContent: 'center' },
  statusChip: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  statusChipText: { fontFamily: fonts.bold, fontSize: 11 },
  cardBody: { padding: 16, gap: 10 },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cityKicker: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  hotelName: {
    marginTop: 2,
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  priceCol: { alignItems: 'flex-end' },
  price: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.6,
  },
  priceHint: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  metaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.canvas,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  metaChipText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.inkSoft,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  codeBox: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6EBD9',
    gap: 6,
  },
  codeLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.success,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  codeValue: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    letterSpacing: 0.8,
    color: colors.ink,
    flexShrink: 1,
  },
  codeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.white,
  },
  codeBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.success,
  },
  codeSoft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  codeSoftText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  actionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 11,
  },
  actionPrimaryText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
  },
  actionGhost: {
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  actionGhostText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryDeep,
  },
})
