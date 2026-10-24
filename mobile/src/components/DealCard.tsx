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
/** Image-led: ~55% of card height on phone */
const heroHeight = Math.min(220, Math.round(screenW * 0.52))

function formatDateShort(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00')
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc']
  return `${date.getDate()} ${months[date.getMonth()]}`
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

/**
 * Image-led deal card — short text; full airports / breakdown in detail.
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
  const origin =
    deal.origin_iata ||
    deal.departure_airport ||
    (deal.origin_airport_label || '').split(/[,(]/)[0]?.trim() ||
    ''
  const chip =
    deal.flight?.direct
      ? 'Direct'
      : deal.flags?.verified_label
        ? 'Vérifié'
        : dealBadgeLabels(deal)[0] || null

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

      <Pressable onPress={onPress} style={styles.body}>
        <View style={styles.priceRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.price}>{Math.round(deal.price_per_person)} €</Text>
            <Text style={styles.priceHint} numberOfLines={1}>
              / pers. · {deal.nights}n · {adults} ad.
            </Text>
          </View>
          <View style={styles.datesChip}>
            <Text style={styles.datesText}>{formatDateShort(deal.dates.outbound)}</Text>
            <Text style={styles.datesArrow}>↓</Text>
            <Text style={styles.datesText}>{formatDateShort(deal.dates.inbound)}</Text>
          </View>
        </View>

        <Text style={styles.route} numberOfLines={1}>
          {origin || '—'} → {deal.city}
          {chip ? ` · ${chip}` : ''}
        </Text>

        <Text style={styles.hotel} numberOfLines={1}>
          {stars > 0 ? `${'★'.repeat(Math.min(5, Math.round(stars)))} ` : ''}
          {hotelName}
        </Text>
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
  body: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 6 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  price: { ...type.price, fontSize: 26 },
  priceHint: { ...type.caption, marginTop: 2, fontSize: 11 },
  datesChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 72,
    alignItems: 'flex-end',
  },
  datesText: {
    color: colors.primaryInk,
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 15,
  },
  datesArrow: {
    color: colors.primary,
    fontFamily: fonts.semibold,
    fontSize: 10,
    lineHeight: 12,
    marginVertical: 1,
  },
  route: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
  },
  hotel: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
})
