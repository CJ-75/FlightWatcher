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
  Alert,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { TravelDeal } from '@flightwatcher/shared'
import {
  dealAdults,
  dealBadgeLabels,
  dealCornerBadgeParts,
} from '@flightwatcher/shared'
import { HeartIcon } from './HeartIcon'
import { CountryFlag } from './CountryFlag'
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
  time,
}: {
  dow: string
  day: number
  month: string
  time?: string | null
}) {
  return (
    <View style={styles.dateCell}>
      <Text style={styles.dateDow}>{dow}</Text>
      <Text style={styles.dateDay}>{day}</Text>
      <Text style={styles.dateMonth}>{month}</Text>
      {time ? <Text style={styles.dateTime}>{time}</Text> : null}
    </View>
  )
}

function DealDateRange({
  outbound,
  inbound,
  outTime,
  retTime,
}: {
  outbound: string
  inbound: string
  outTime?: string | null
  retTime?: string | null
}) {
  const out = parseDealDate(outbound)
  const ret = parseDealDate(inbound)
  return (
    <View
      style={styles.dateRange}
      accessibilityLabel={`Du ${out.dow} ${out.day} ${out.month}${outTime ? ` ${outTime}` : ''} au ${ret.dow} ${ret.day} ${ret.month}${retTime ? ` ${retTime}` : ''}`}
    >
      <DateCell {...out} time={outTime} />
      <View style={styles.dateDivider} />
      <DateCell {...ret} time={retTime} />
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
  const originCity = (deal.origin_city || '').trim()
  const origin =
    originCity || cardPlaceLabel(deal.origin_airport_label)
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
  const board = boardLabel(deal.board || deal.hotel?.board)
  const dist = distanceLabel(deal)
  const rating =
    deal.hotel?.rating != null ? Number(deal.hotel.rating).toFixed(1) : null
  const hook = (deal.hook || '').trim()
  const fresh =
    !!deal.fetched_at &&
    !Number.isNaN(Date.parse(deal.fetched_at)) &&
    Date.now() - Date.parse(deal.fetched_at) < 24 * 60 * 60 * 1000

  const baggageLine = (deal.baggage_line || '').trim()
  const pills: string[] = []
  if (deal.flight?.direct) pills.push('Vol direct')
  if (board) pills.push(board)
  if (deal.hotel?.refundable || dealBadgeLabels(deal).includes('Annul. gratuite')) {
    pills.push('Annul. OK')
  }

  const hotelMeta = [
    rating ? `${rating}/10` : null,
    dist,
  ]
    .filter(Boolean)
    .join(' · ')

  const priceMeta = [
    `${deal.nights} nuit${deal.nights > 1 ? 's' : ''}`,
    flightPp > 0 || hotelPp > 0
      ? `vol ${flightPp || '—'} € + hôtel ${hotelPp || '—'} €`
      : null,
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

        {(() => {
          const corner = dealCornerBadgeParts(deal)
          if (!corner && !fresh) return null
          return (
            <View
              style={[
                styles.dealBadge,
                !corner && fresh ? { backgroundColor: colors.ink } : null,
              ]}
              pointerEvents="none"
            >
              {corner?.kind === 'discount' ? (
                <View style={styles.dealBadgeRow}>
                  <Text
                    style={[
                      styles.dealPct,
                      corner.discountPct == null && { opacity: 0.4 },
                    ]}
                  >
                    {corner.discountPct != null
                      ? `−${corner.discountPct}%`
                      : '−–%'}
                  </Text>
                  <Text style={styles.dealText} numberOfLines={2}>
                    {corner.text}
                  </Text>
                </View>
              ) : (
                <Text style={styles.dealText} numberOfLines={2}>
                  {corner ? corner.text : 'Nouveau'}
                </Text>
              )}
            </View>
          )
        })()}

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

      </View>

      <Pressable onPress={onPress} style={styles.body}>
        <View style={styles.bodyMain}>
          <View style={styles.titleRow}>
            <View style={styles.titleCol}>
              <View style={styles.cityTitleRow}>
                {deal.country ? (
                  <CountryFlag country={deal.country} style={styles.cityFlag} />
                ) : null}
                <Text style={styles.hookTitle} numberOfLines={2}>
                  {(deal.title || '').trim() &&
                  !(deal.title || '').startsWith('Week-end')
                    ? deal.title
                    : dest}
                </Text>
              </View>
              {hook ? (
                <Text style={styles.hookLine} numberOfLines={2}>
                  {hook}
                </Text>
              ) : null}
              <Text style={styles.price}>
                <Text style={styles.priceFrom}>À partir de </Text>
                {Math.round(deal.price_per_person)} €{' '}
                <Text style={styles.priceUnit}>/ pers.</Text>
              </Text>
              {priceMeta ? (
                <Text style={styles.priceHint} numberOfLines={1}>
                  {priceMeta}
                </Text>
              ) : null}
              {origin ? (
                <Text style={styles.originLine} numberOfLines={1}>
                  depuis {origin}
                </Text>
              ) : null}
            </View>
            <DealDateRange
              outbound={deal.dates.outbound}
              inbound={deal.dates.inbound}
              outTime={outTime}
              retTime={retTime}
            />
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

          {pills.length > 0 || baggageLine ? (
            <View style={styles.chips}>
              {pills.slice(0, 3).map((c) => (
                <View
                  key={c}
                  style={[styles.chip, c === 'Vol direct' && styles.chipGood]}
                >
                  <Text
                    style={[styles.chipText, c === 'Vol direct' && styles.chipGoodText]}
                  >
                    {c}
                  </Text>
                </View>
              ))}
              {baggageLine ? (
                <Pressable
                  onPress={(e) => {
                    e?.stopPropagation?.()
                    Alert.alert('Bagages', baggageLine)
                  }}
                  hitSlop={8}
                  style={styles.bagBtn}
                  accessibilityLabel={baggageLine}
                >
                  <View style={styles.bagGlyph}>
                    <View style={styles.bagHandle} />
                    <View style={styles.bagBody} />
                  </View>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* View (not nested Pressable) — Android often drops nested CTA presses */}
          <View style={styles.cta} accessibilityRole="button" accessibilityLabel="Voir ce séjour">
            <Text style={styles.ctaText}>Voir ce séjour</Text>
          </View>
        </View>
      </Pressable>
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
    maxWidth: '78%',
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    zIndex: 3,
  },
  dealBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  dealPct: {
    color: colors.white,
    fontFamily: fonts.extrabold,
    fontSize: 13,
  },
  dealText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 11,
    flexShrink: 1,
    lineHeight: 14,
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
  body: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
  bodyMain: { gap: 10 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cityTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cityFlag: {
    marginTop: 4,
  },
  hookTitle: {
    flex: 1,
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  hookLine: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 17,
  },
  price: { ...type.price, fontSize: 26, marginTop: 2 },
  priceFrom: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.inkSoft,
  },
  priceUnit: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.inkSoft,
  },
  priceHint: { ...type.caption, marginTop: 3, fontSize: 11, lineHeight: 15 },
  originLine: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  cta: {
    marginTop: 2,
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
  dateRange: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    overflow: 'hidden',
  },
  dateDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.primaryMuted,
  },
  dateCell: {
    width: 52,
    paddingHorizontal: 4,
    paddingVertical: 5,
    alignItems: 'center',
  },
  dateDow: {
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 8,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.primaryInk,
    opacity: 0.75,
  },
  dateDay: {
    fontFamily: fonts.extrabold,
    fontSize: 17,
    color: colors.primaryInk,
    lineHeight: 20,
    marginTop: 2,
  },
  dateMonth: {
    fontFamily: fonts.semibold,
    fontSize: 9,
    color: colors.primary,
    marginTop: 1,
  },
  dateTime: {
    fontFamily: fonts.bold,
    fontSize: 9,
    color: colors.primaryInk,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.primaryMuted,
    alignSelf: 'stretch',
    textAlign: 'center',
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
  bagBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bagGlyph: {
    width: 12,
    height: 13,
    alignItems: 'center',
  },
  bagHandle: {
    width: 7,
    height: 3,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: colors.inkSoft,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  bagBody: {
    width: 12,
    height: 9,
    marginTop: -0.5,
    borderWidth: 1.5,
    borderColor: colors.inkSoft,
    borderRadius: 2,
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
})
