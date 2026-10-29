import React, { useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Linking,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { EnrichedTripResponse } from '@flightwatcher/shared'
import {
  cityDisplayNameFr,
  countryIsoForAirport,
  formatAirlineLabel,
  resolveTripImageUrl,
} from '@flightwatcher/shared'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'
import { CountryFlag } from './CountryFlag'
import { HeartIcon } from './HeartIcon'
import { bookCtaLabel, resolveTripPriceSource } from '../lib/partnerBook'

type CardAction = {
  label: string
  onPress: () => void
  disabled?: boolean
}

interface Props {
  trip: EnrichedTripResponse
  passengers?: number
  onFavorite?: () => void
  onBook?: () => void
  onAddHotel?: () => void
  /** Hide default book CTA */
  showBook?: boolean
  /** Replaces book CTA (e.g. Accept on a planner proposal) */
  primaryAction?: CardAction
  secondaryAction?: CardAction
  isFavorite?: boolean
}

/** Same hero image height on every trip card (independent of screen/content). */
const HERO_HEIGHT = 176

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc']
  const jsDay = date.getDay()
  const dayIndex = (jsDay === 0 ? 7 : jsDay) - 1
  return `${days[dayIndex]} ${date.getDate()} ${months[date.getMonth()]}`
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function DestinationCard({
  trip,
  passengers = 1,
  onFavorite,
  onBook,
  onAddHotel,
  showBook = true,
  primaryAction,
  secondaryAction,
  isFavorite,
}: Props) {
  const destCode = trip.aller.destination || trip.destination_code
  const cityName = cityDisplayNameFr(destCode, trip.aller.destinationFull)
  const originCity = cityDisplayNameFr(trip.aller.origin, trip.aller.originFull)
  const destIso = countryIsoForAirport(destCode, trip.aller.destinationFull)
  const imageUrl = resolveTripImageUrl({
    city: cityName,
    iata: trip.destination_code,
    imageUrl: trip.image_url,
  })
  const [failed, setFailed] = useState(false)
  const priceSource = resolveTripPriceSource(trip, passengers, 'fr')
  const ctaLabel = bookCtaLabel(priceSource)

  const openBook = async () => {
    if (onBook) {
      onBook()
      return
    }
    await Linking.openURL(priceSource.primaryUrl)
  }

  const airlineLabel = formatAirlineLabel(trip)
  const transfersKnown = trip.transfers != null
  const transfers = trip.transfers ?? 0
  const legPricesOk = trip.leg_prices_reliable !== false

  return (
    <View style={[styles.card, shadow.soft]}>
      <View style={styles.hero}>
        {!failed ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <LinearGradient colors={[colors.primary, colors.primaryDeep]} style={styles.image}>
            <Text style={styles.fallbackText}>{cityName}</Text>
          </LinearGradient>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(12,18,34,0.15)', 'rgba(12,18,34,0.82)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />

        {trip.is_good_deal ? (
          <View style={styles.dealBadge}>
            <Text style={styles.dealText}>Bon deal</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.heart, pressed && { transform: [{ scale: 0.92 }] }]}
          onPress={onFavorite}
          hitSlop={12}
        >
          <HeartIcon
            size={20}
            filled={!!isFavorite}
            color={isFavorite ? colors.primary : colors.inkSoft}
          />
        </Pressable>

        <View style={styles.heroText}>
          <View style={styles.cityRow}>
            <CountryFlag iso={destIso} size={{ width: 24, height: 16 }} />
            <Text style={styles.city} numberOfLines={1}>
              {cityName}
            </Text>
          </View>
          <View style={styles.routeRow}>
            <Text style={styles.route} numberOfLines={1}>
              {originCity}
            </Text>
            <Text style={styles.routeArrow}>→</Text>
            <Text style={styles.route} numberOfLines={1}>
              {cityName}
            </Text>
          </View>
          <View style={styles.badgeRow}>
            <View style={[styles.metaBadge, styles.airlineBadge]}>
              <Text style={styles.airlineBadgeText} numberOfLines={1}>
                {airlineLabel}
              </Text>
            </View>
            {transfersKnown ? (
              <View style={[styles.metaBadge, transfers === 0 && styles.metaBadgeDirect]}>
                <Text style={styles.metaBadgeText}>
                  {transfers > 0 ? `${transfers} escale${transfers > 1 ? 's' : ''}` : 'Direct'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.price}>{Math.round(trip.prix_total)} €</Text>
            <Text style={styles.priceHint}>
              {passengers > 1
                ? `par pers. · ${Math.round(trip.prix_total * passengers)}€ pour ${passengers}`
                : 'par personne · A/R'}
            </Text>
          </View>
          {typeof trip.discount_percent === 'number' && trip.discount_percent > 20 ? (
            <View style={styles.discount}>
              <Text style={styles.discountText}>-{Math.round(trip.discount_percent)}%</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.legs}>
          <View style={styles.leg}>
            <Text style={styles.legLabel}>Aller</Text>
            <Text style={styles.legValue}>
              {formatDate(trip.aller.departureTime)} · {formatTime(trip.aller.departureTime)}
            </Text>
            {legPricesOk && trip.aller.price > 0 ? (
              <Text style={styles.legPrice}>{Math.round(trip.aller.price)} €</Text>
            ) : null}
          </View>
          <View style={styles.divider} />
          <View style={styles.leg}>
            <Text style={styles.legLabel}>Retour</Text>
            <Text style={styles.legValue}>
              {formatDate(trip.retour.departureTime)} · {formatTime(trip.retour.departureTime)}
            </Text>
            {legPricesOk && trip.retour.price > 0 ? (
              <Text style={styles.legPrice}>{Math.round(trip.retour.price)} €</Text>
            ) : null}
          </View>
        </View>

        {primaryAction ? (
          <View style={styles.actionsCol}>
            <Pressable
              onPress={primaryAction.onPress}
              disabled={primaryAction.disabled}
              style={({ pressed }) => [
                styles.bookBtn,
                primaryAction.disabled && { opacity: 0.5 },
                pressed && !primaryAction.disabled && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
            >
              <Text style={styles.bookText}>{primaryAction.label}</Text>
            </Pressable>
            {secondaryAction ? (
              <Pressable
                onPress={secondaryAction.onPress}
                disabled={secondaryAction.disabled}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  secondaryAction.disabled && { opacity: 0.5 },
                  pressed && !secondaryAction.disabled && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.secondaryBtnText}>{secondaryAction.label}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : showBook ? (
          <>
            <Pressable
              onPress={() => void openBook()}
              style={({ pressed }) => [
                styles.bookBtn,
                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
            >
              <Text style={styles.bookText}>{ctaLabel}</Text>
            </Pressable>
            {onAddHotel ? (
              <Pressable onPress={onAddHotel} style={styles.addHotelBtn}>
                <Text style={styles.addHotelText}>Ajouter un hôtel</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  hero: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  image: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: HERO_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: colors.white,
    fontFamily: fonts.extrabold,
    fontSize: 28,
    letterSpacing: -0.8,
  },
  dealBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  dealText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  heart: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  heroText: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  city: {
    flexShrink: 1,
    color: colors.white,
    fontFamily: fonts.extrabold,
    fontSize: 26,
    letterSpacing: -0.8,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    minWidth: 0,
  },
  route: {
    flexShrink: 1,
    color: 'rgba(255,255,255,0.95)',
    fontFamily: fonts.bold,
    fontSize: 14,
    letterSpacing: 0.4,
  },
  routeArrow: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    height: 22,
    overflow: 'hidden',
  },
  metaBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    flexShrink: 0,
  },
  airlineBadge: { flexShrink: 1, maxWidth: '58%' },
  metaBadgeDirect: { backgroundColor: 'rgba(16,185,129,0.85)' },
  airlineBadgeText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  metaBadgeText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  body: { padding: spacing.lg },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  price: { ...type.price, fontSize: 30 },
  priceHint: { ...type.caption, marginTop: 2 },
  discount: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  discountText: { color: colors.primaryInk, fontFamily: fonts.bold, fontSize: 13 },
  legs: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: 4,
    marginBottom: spacing.lg,
  },
  leg: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.primaryMuted, marginHorizontal: spacing.lg },
  legLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primaryInk,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  legValue: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
  legPrice: { fontFamily: fonts.bold, fontSize: 14, color: colors.inkSoft, marginTop: 2 },
  actionsCol: { gap: 10 },
  addHotelBtn: {
    marginTop: 8,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addHotelText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
    textDecorationLine: 'underline',
    includeFontPadding: false,
  },
  bookBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookText: { ...type.button, color: colors.white },
  secondaryBtn: {
    borderRadius: radius.md,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
  },
  secondaryBtnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.muted },
})
