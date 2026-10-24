import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Pressable,
  Linking,
  ActivityIndicator,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { TravelDeal, TravelDealHotel } from '@flightwatcher/shared'
import { dealAdults, pricePpWithHotel } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { HeartIcon } from '../components/HeartIcon'
import { useLikedDeals } from '../hooks/useLikedDeals'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'DealDetail'>

const width = Dimensions.get('window').width

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function DealDetailScreen({ route, navigation }: Props) {
  const { dealId } = route.params
  const insets = useSafeAreaInsets()
  const { isLiked, toggleLike, refresh: refreshLikes } = useLikedDeals()
  const [deal, setDeal] = useState<TravelDeal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [hotelId, setHotelId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const d = await getApi().getDeal(dealId)
        if (!cancelled) {
          setDeal(d)
          setHotelId(d.hotel?.id || null)
        }
        await refreshLikes()
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Deal introuvable')
          setDeal(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dealId, refreshLikes])

  const hotelOptions = useMemo(() => {
    if (!deal) return [] as TravelDealHotel[]
    const primary = deal.hotel
      ? [deal.hotel]
      : deal.hotel_name
        ? [
            {
              id: 'primary',
              name: deal.hotel_name,
              stars: deal.hotel_stars,
              board: deal.board,
              public_hotel_price: deal.price_breakdown?.hotel_public_total,
              excluded_fees: deal.price_breakdown?.excluded_fees,
              photo: deal.image_url,
            } as TravelDealHotel,
          ]
        : []
    const seen = new Set<string>()
    const out: TravelDealHotel[] = []
    for (const h of [...primary, ...(deal.alt_hotels || [])]) {
      if (!h?.id || seen.has(h.id)) continue
      seen.add(h.id)
      out.push(h)
    }
    return out
  }, [deal])

  const selected =
    hotelOptions.find((h) => h.id === (hotelId || hotelOptions[0]?.id)) || hotelOptions[0]

  if (loading) {
    return (
      <View style={styles.centered}>
        <ScreenBackground />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!deal || error) {
    return (
      <View style={styles.centered}>
        <ScreenBackground />
        <Text style={styles.errorText}>{error || 'Deal introuvable'}</Text>
      </View>
    )
  }

  const adults = dealAdults(deal)
  const hotelTotal =
    selected?.public_hotel_price ?? deal.price_breakdown?.hotel_public_total ?? 0
  const pricePp = selected ? pricePpWithHotel(deal, hotelTotal) : deal.price_per_person
  const fees = selected?.excluded_fees ?? deal.price_breakdown?.excluded_fees ?? 0
  const flightUrl = deal.flight?.booking_url || ''
  const hasPartnerUrl = Boolean(deal.booking_url)

  const openUrl = async (url: string) => {
    if (!url) return
    await Linking.openURL(url)
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        <View style={styles.hero}>
          {!failed ? (
            <Image
              source={{ uri: selected?.photo || deal.image_url }}
              style={styles.heroImage}
              onError={() => setFailed(true)}
            />
          ) : (
            <LinearGradient colors={[colors.primary, colors.primaryDeep]} style={styles.heroImage}>
              <Text style={styles.fallbackCity}>{deal.city}</Text>
            </LinearGradient>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(12,18,34,0.75)']}
            style={styles.heroFade}
          />
          <Pressable
            onPress={() => void toggleLike(deal)}
            hitSlop={10}
            style={[styles.likeBtn, { top: Math.max(insets.top, 12) + 8 }]}
          >
            <HeartIcon
              size={22}
              filled={isLiked(deal.id)}
              color={isLiked(deal.id) ? colors.primary : colors.ink}
            />
          </Pressable>
          <View style={styles.heroCaption}>
            {deal.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{deal.badge}</Text>
              </View>
            ) : null}
            <Text style={styles.city}>{deal.city}</Text>
            <Text style={styles.country}>{deal.country}</Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.price}>{Math.round(pricePp)} €</Text>
          <Text style={styles.priceHint}>
            / pers. · {deal.nights} nuits · base {adults} adultes
          </Text>
          {fees > 0 ? (
            <Text style={styles.tax}>+ {Math.round(fees)} € taxe de séjour sur place</Text>
          ) : null}

          <Text style={styles.title}>{deal.title}</Text>
          <Text style={styles.description}>{deal.description}</Text>

          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Deux réservations distinctes : vol via la compagnie / partenaire, hôtel via
              FlightWatcher.
            </Text>
          </View>

          <View style={[styles.infoCard, shadow.soft]}>
            <InfoRow label="Départ" value={deal.departure_airport} />
            <InfoRow
              label="Dates"
              value={`${formatDate(deal.dates.outbound)} → ${formatDate(deal.dates.inbound)}`}
            />
            {deal.flight ? (
              <InfoRow
                label="Vol / pers."
                value={`${Math.round(deal.flight.price_pp)} €${deal.flight.direct ? ' · Direct' : ''}`}
              />
            ) : null}
          </View>

          {hotelOptions.length > 1 ? (
            <View style={styles.switchBlock}>
              <Text style={styles.sectionLabel}>Changer d’hôtel</Text>
              {hotelOptions.map((h) => {
                const active = h.id === selected?.id
                const hPp = pricePpWithHotel(deal, h.public_hotel_price ?? hotelTotal)
                return (
                  <Pressable
                    key={h.id}
                    onPress={() => setHotelId(h.id)}
                    style={[styles.hotelOption, active && styles.hotelOptionActive]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hotelOptionName} numberOfLines={1}>
                        {h.name}
                      </Text>
                      <Text style={styles.hotelOptionMeta} numberOfLines={1}>
                        {[h.board, h.refundable ? 'Annul. OK' : null, h.rating != null ? `${h.rating}/10` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <Text style={styles.hotelOptionPrice}>{Math.round(hPp)} €</Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}

          <View style={[styles.infoCard, shadow.soft]}>
            <InfoRow
              label="Hôtel"
              value={`${selected?.name || deal.hotel_name || '—'}${
                selected?.stars || deal.hotel_stars
                  ? ` · ${selected?.stars || deal.hotel_stars}★`
                  : ''
              }`}
            />
            {(selected?.board || deal.board) ? (
              <InfoRow label="Pension" value={String(selected?.board || deal.board)} last />
            ) : null}
          </View>

          {deal.highlights?.length ? (
            <View style={styles.highlights}>
              <Text style={styles.sectionLabel}>Inclus</Text>
              {deal.highlights.map((h) => (
                <View key={h} style={styles.highlightRow}>
                  <Text style={styles.bullet}>·</Text>
                  <Text style={styles.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, 12) }, shadow.lift]}>
        {deal.provider === 'liteapi' || deal.deal_key ? (
          <Pressable
            onPress={() =>
              navigation.navigate('DealCheckout', {
                dealId: deal.id,
                hotelId: selected?.id || deal.hotel?.id,
              })
            }
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.ctaText}>Réserver l’hôtel</Text>
          </Pressable>
        ) : hasPartnerUrl ? (
          <Pressable
            onPress={() => void openUrl(deal.booking_url)}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.ctaText}>Voir l’offre</Text>
          </Pressable>
        ) : (
          <View style={[styles.cta, styles.ctaDisabled]}>
            <Text style={[styles.ctaText, { color: colors.muted }]}>
              Réserver l’hôtel (bientôt)
            </Text>
          </View>
        )}
        {flightUrl ? (
          <Pressable
            onPress={() => void openUrl(flightUrl)}
            style={({ pressed }) => [styles.ctaSecondary, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.ctaSecondaryText}>Réserver le vol</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function InfoRow({
  label,
  value,
  last,
}: {
  label: string
  value: string
  last?: boolean
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

const heroH = Math.min(280, Math.round(width * 0.62))

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
    padding: 24,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
  },
  hero: { height: heroH, backgroundColor: colors.line },
  heroImage: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  heroFade: { ...StyleSheet.absoluteFill, top: '40%' },
  likeBtn: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  fallbackCity: { color: colors.white, fontFamily: fonts.extrabold, fontSize: 32 },
  heroCaption: { position: 'absolute', left: 20, right: 20, bottom: 20 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
    marginBottom: 8,
  },
  badgeText: { color: colors.white, fontFamily: fonts.bold, fontSize: 12 },
  city: {
    color: colors.white,
    fontFamily: fonts.extrabold,
    fontSize: 30,
    letterSpacing: -0.8,
  },
  country: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.medium,
    fontSize: 14,
    marginTop: 2,
  },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  price: { ...type.price, fontSize: 36 },
  priceHint: { ...type.caption, marginTop: 2 },
  tax: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#92400e',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.4,
    marginTop: 16,
    marginBottom: 8,
  },
  description: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 24,
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: spacing.xl,
  },
  noticeText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.primaryInk,
  },
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  infoRow: { paddingVertical: 14 },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  infoLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoValue: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  switchBlock: { marginBottom: spacing.xl },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  hotelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
  },
  hotelOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  hotelOptionName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  hotelOptionMeta: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: 2 },
  hotelOptionPrice: { fontFamily: fonts.bold, fontSize: 14, color: colors.primary },
  highlights: { marginBottom: spacing.xl },
  highlightRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  bullet: { fontFamily: fonts.bold, fontSize: 16, color: colors.primary, lineHeight: 22 },
  highlightText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
  },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: colors.line },
  ctaText: { ...type.button, color: colors.white },
  ctaSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  ctaSecondaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
})
