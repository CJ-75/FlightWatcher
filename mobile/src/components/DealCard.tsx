import React, { useCallback, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { TravelDeal } from '@flightwatcher/shared'
import { dealAdults, dealBadgeLabels } from '@flightwatcher/shared'
import { HeartIcon } from './HeartIcon'
import { getApi } from '../lib/client'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'

type Props = {
  deal: TravelDeal
  onPress: () => void
  liked?: boolean
  onToggleLike?: () => void
}

const screenW = Dimensions.get('window').width
const CARD_PAD = spacing.xl * 2
const heroW = screenW - CARD_PAD
/** Slightly taller hero — still image-led */
const heroHeight = Math.min(236, Math.round(screenW * 0.55))

const DAYS_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
const MONTHS_SHORT = [
  'jan',
  'fév',
  'mar',
  'avr',
  'mai',
  'jun',
  'jul',
  'aoû',
  'sep',
  'oct',
  'nov',
  'déc',
]

function parseDealDate(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00')
  return {
    dow: DAYS_SHORT[date.getDay()],
    day: date.getDate(),
    month: MONTHS_SHORT[date.getMonth()],
  }
}

function formatClock(iso?: string | null) {
  if (!iso) return null
  const m = String(iso).match(/T(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : null
}

function boardLabel(board?: string | null) {
  if (!board) return null
  const b = board.toUpperCase()
  if (b.includes('BI') || /breakfast|petit/i.test(board)) return 'Petit-déj'
  if (b.includes('HB') || /half|demi/i.test(board)) return 'Demi-pension'
  if (b.includes('FB') || /full|pension compl/i.test(board)) return 'Pension complète'
  if (b.includes('AI') || /all.?inclusive/i.test(board)) return 'All inclusive'
  if (b.includes('RO')) return null
  return board
}

function distanceLabel(deal: TravelDeal) {
  const m = deal.hotel?.distance_m
  if (m == null) return deal.distance_label || null
  if (m < 800) return 'Centre-ville'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km du centre`
}

function DateCell({
  dow,
  day,
  month,
}: {
  dow: string
  day: number
  month: string
}) {
  return (
    <View style={styles.dateCell}>
      <Text style={styles.dateDow}>{dow}</Text>
      <Text style={styles.dateDay}>{day}</Text>
      <Text style={styles.dateMonth}>{month}</Text>
    </View>
  )
}

function DealDateRange({ outbound, inbound }: { outbound: string; inbound: string }) {
  const out = parseDealDate(outbound)
  const ret = parseDealDate(inbound)
  return (
    <View
      style={styles.dateRange}
      accessibilityLabel={`Du ${out.dow} ${out.day} ${out.month} au ${ret.dow} ${ret.day} ${ret.month}`}
    >
      <DateCell {...out} />
      <View style={styles.dateConnector} />
      <DateCell {...ret} />
    </View>
  )
}

function uniqueUrls(urls: (string | undefined | null)[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const u of urls) {
    const s = (u || '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/** City / airport name only — never IATA trigrams on cards. */
function cardPlaceLabel(label?: string | null, fallback?: string | null): string {
  const raw = (label || '').trim()
  if (raw) {
    const noCode = raw.replace(/\s*\([A-Z]{3}\)\s*$/i, '').trim()
    const head = noCode.split(/[,–—]/)[0]?.trim() || noCode
    if (head && !/^[A-Z]{3}$/.test(head)) return head
    if (noCode && !/^[A-Z]{3}$/.test(noCode)) return noCode
  }
  const fb = (fallback || '').trim()
  if (fb && !/^[A-Z]{3}$/.test(fb)) return fb
  return 'Départ'
}

/**
 * Image-led card with booking-temptation signals (rating, times, board).
 */
export function DealCard({ deal, onPress, liked, onToggleLike }: Props) {
  const hotelPhoto = (deal.hotel?.photo || deal.image_url || '').trim()
  const [photos, setPhotos] = useState(() =>
    uniqueUrls([...(deal.hotel?.photos || []), hotelPhoto]).slice(0, 12),
  )
  const [idx, setIdx] = useState(0)
  const [failed, setFailed] = useState(false)
  const fetchedRef = useRef(false)
  const didSwipeRef = useRef(false)

  const adults = dealAdults(deal)
  const stars = Number(deal.hotel_stars || deal.hotel?.stars || 0)
  const hotelName = deal.hotel_name || deal.hotel?.name || 'Hôtel'
  const origin = cardPlaceLabel(deal.origin_airport_label)
  const dest =
    (deal.city || '').trim() ||
    cardPlaceLabel(deal.arrival_airport_label) ||
    'Destination'

  const flightPp = Math.round(
    deal.price_breakdown?.flight_pp ?? deal.flight?.price_pp ?? 0,
  )
  const breakdown = deal.price_breakdown as
    | (typeof deal.price_breakdown & { hotel_pp?: number })
    | undefined
  const hotelPp = Math.round(
    breakdown?.hotel_pp ??
      (breakdown?.hotel_public_total != null && adults > 0
        ? breakdown.hotel_public_total / adults
        : Math.max(0, deal.price_per_person - flightPp)),
  )

  const outTime = formatClock(deal.flight?.outbound_local || deal.flight?.out_dep_local)
  const retTime = formatClock(deal.flight?.inbound_local || deal.flight?.ret_dep_local)
  const airline = deal.flight?.airline || deal.flight?.carrier
  const board = boardLabel(deal.board || deal.hotel?.board)
  const dist = distanceLabel(deal)
  const rating =
    deal.hotel?.rating != null ? Number(deal.hotel.rating).toFixed(1) : null

  const pills: string[] = []
  if (deal.flight?.direct) pills.push('Vol direct')
  if (deal.hotel?.refundable || dealBadgeLabels(deal).includes('Annul. gratuite')) {
    pills.push('Annul. OK')
  }
  if (board) pills.push(board)
  if (deal.flags?.verified_label) pills.push('Vérifié')

  const flightMeta = [
    airline,
    outTime ? `↗ ${outTime}` : null,
    retTime ? `↘ ${retTime}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const hotelMeta = [
    rating ? `${rating}/10` : null,
    dist,
  ]
    .filter(Boolean)
    .join(' · ')

  const loadGallery = useCallback(() => {
    const hid = (deal.hotel?.id || '').trim()
    if (fetchedRef.current || !hid || hid === 'primary') return
    fetchedRef.current = true
    void getApi()
      .getHotelGallery(hid, { language: 'fr', fallback: photos[0] || hotelPhoto })
      .then((res) => {
        const next = uniqueUrls((res.photos || []).map((p) => p.url)).slice(0, 16)
        if (next.length > 1) setPhotos(next)
      })
      .catch(() => {
        fetchedRef.current = false
      })
  }, [deal.hotel?.id, photos, hotelPhoto])

  if (!hotelPhoto && photos.length === 0) return null

  const onMomentum = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x
    const i = Math.round(x / heroW)
    setIdx(Math.max(0, Math.min(i, photos.length - 1)))
  }

  return (
    <View style={[styles.card, shadow.soft]}>
      <View style={styles.hero}>
        {!failed && photos.length > 0 ? (
          <FlatList
            data={photos}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            directionalLockEnabled
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            onScrollBeginDrag={() => {
              didSwipeRef.current = false
              loadGallery()
            }}
            onScrollEndDrag={(e) => {
              if (Math.abs(e.nativeEvent.contentOffset.x % heroW) > 12) {
                didSwipeRef.current = true
              }
            }}
            onMomentumScrollEnd={(e) => {
              onMomentum(e)
              setTimeout(() => {
                didSwipeRef.current = false
              }, 80)
            }}
            renderItem={({ item, index: i }) => (
              <Pressable
                onPress={() => {
                  if (didSwipeRef.current) return
                  onPress()
                }}
                style={{ width: heroW, height: heroHeight }}
              >
                <Image
                  source={{ uri: item }}
                  style={styles.image}
                  onError={() => {
                    if (i === 0 && photos.length === 1) setFailed(true)
                  }}
                />
              </Pressable>
            )}
          />
        ) : (
          <Pressable onPress={onPress} style={styles.image}>
            <LinearGradient colors={[colors.primary, colors.primaryDeep]} style={styles.image}>
              <Text style={styles.fallbackText}>{deal.city}</Text>
            </LinearGradient>
          </Pressable>
        )}

        <LinearGradient
          colors={['rgba(12,18,34,0.15)', 'transparent', 'rgba(12,18,34,0.78)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {deal.badge ? (
          <View style={styles.dealBadge} pointerEvents="none">
            <Text style={styles.dealText} numberOfLines={1}>
              {deal.badge}
            </Text>
          </View>
        ) : null}

        {onToggleLike ? (
          <Pressable onPress={onToggleLike} hitSlop={12} style={styles.likeBtn}>
            <HeartIcon
              size={20}
              filled={!!liked}
              color={liked ? colors.primary : colors.inkSoft}
            />
          </Pressable>
        ) : null}

        {photos.length > 1 ? (
          <View style={styles.dots} pointerEvents="none">
            {photos.slice(0, 5).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === Math.min(idx, 4) && styles.dotActive]}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.heroText} pointerEvents="none">
          <Text style={styles.city} numberOfLines={1}>
            {deal.city}
          </Text>
          {deal.country ? (
            <Text style={styles.country} numberOfLines={1}>
              {deal.country}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        <Pressable onPress={onPress} style={styles.bodyMain}>
          <View style={styles.priceRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.price}>{Math.round(deal.price_per_person)} €</Text>
              <Text style={styles.priceHint} numberOfLines={2}>
                / pers. · {deal.nights}n · {adults} ad.
                {deal.flags?.soft_fill || deal.flags?.hotel_bookable === false
                  ? `\n${deal.flags?.price_label || 'Vol dès · hôtel à choisir'}`
                  : flightPp > 0 || hotelPp > 0
                    ? `\nvol ${flightPp || '—'} € + hôtel ${hotelPp || '—'} €`
                    : ''}
              </Text>
            </View>
            <DealDateRange outbound={deal.dates.outbound} inbound={deal.dates.inbound} />
          </View>

          <View>
            <Text style={styles.route} numberOfLines={1}>
              {origin} → {dest}
            </Text>
            {flightMeta ? (
              <Text style={styles.meta} numberOfLines={1}>
                {flightMeta}
              </Text>
            ) : null}
          </View>

          <View>
            <Text style={styles.hotel} numberOfLines={1}>
              {stars > 0 ? `${'★'.repeat(Math.min(5, Math.round(stars)))} ` : ''}
              {hotelName}
            </Text>
            {hotelMeta ? (
              <Text style={styles.meta} numberOfLines={1}>
                {hotelMeta}
              </Text>
            ) : null}
          </View>

          {pills.length > 0 ? (
            <View style={styles.chips}>
              {pills.slice(0, 3).map((c) => (
                <View
                  key={c}
                  style={[
                    styles.chip,
                    (c === 'Vol direct' || c === 'Annul. OK' || c === 'Vérifié') &&
                      styles.chipGood,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      (c === 'Vol direct' || c === 'Annul. OK' || c === 'Vérifié') &&
                        styles.chipGoodText,
                    ]}
                  >
                    {c}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>

        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
          accessibilityLabel="Voir l’offre"
        >
          <Text style={styles.ctaText}>Voir l’offre</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  hero: { height: heroHeight, backgroundColor: colors.line },
  image: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  fallbackText: {
    color: colors.white,
    fontFamily: fonts.extrabold,
    fontSize: 26,
  },
  dealBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    maxWidth: '55%',
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    zIndex: 3,
  },
  dealText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  likeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  dots: {
    position: 'absolute',
    bottom: 52,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    zIndex: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: { width: 12, backgroundColor: colors.white },
  heroText: { position: 'absolute', left: 14, right: 56, bottom: 12, zIndex: 2 },
  city: {
    color: colors.white,
    fontFamily: fonts.extrabold,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  country: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: 2,
  },
  body: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 12 },
  bodyMain: { gap: 10 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  price: { ...type.price, fontSize: 26 },
  priceHint: { ...type.caption, marginTop: 3, fontSize: 11, lineHeight: 15 },
  dateRange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateConnector: {
    width: 10,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.primaryMuted,
  },
  dateCell: {
    width: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    overflow: 'hidden',
    alignItems: 'center',
  },
  dateDow: {
    alignSelf: 'stretch',
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.primaryInk,
    backgroundColor: colors.primaryMuted,
    paddingVertical: 3,
    opacity: 0.9,
  },
  dateDay: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.primaryInk,
    lineHeight: 22,
    marginTop: 4,
  },
  dateMonth: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: colors.primary,
    marginBottom: 5,
    marginTop: 1,
  },
  route: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
  },
  meta: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
  },
  hotel: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  chipGood: {
    backgroundColor: colors.successSoft,
    borderColor: '#B7E4D0',
  },
  chipText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.inkSoft,
  },
  chipGoodText: { color: colors.success },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ctaText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
  },
})
