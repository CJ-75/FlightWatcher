/**
 * Favoris vol — même forme que DestinationCard, + statut / n° de vol.
 */
import React, { useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { EnrichedTripResponse, SavedFavorite } from '@flightwatcher/shared'
import {
  cityDisplayNameFr,
  countryIsoForAirport,
  formatAirlineLabel,
  resolveTripImageUrl,
} from '@flightwatcher/shared'
import { CountryFlag } from './CountryFlag'
import { HeartIcon } from './HeartIcon'
import { colors, fonts, radius, shadow, spacing } from '../theme'

const HERO_HEIGHT = 176

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  const months = [
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
  const jsDay = date.getDay()
  const dayIndex = (jsDay === 0 ? 7 : jsDay) - 1
  return `${days[dayIndex]} ${date.getDate()} ${months[date.getMonth()]}`
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function FavoriteFlightCard({
  favorite,
  faded = false,
  bookLabel = 'Réserver ce vol',
  onBook,
  onRemove,
}: {
  favorite: SavedFavorite
  faded?: boolean
  bookLabel?: string
  onBook?: () => void
  onRemove: () => void
}) {
  const trip = favorite.trip as EnrichedTripResponse
  const destCode = trip.aller.destination || trip.destination_code
  const cityName = cityDisplayNameFr(destCode, trip.aller.destinationFull)
  const originCity = cityDisplayNameFr(trip.aller.origin, trip.aller.originFull)
  const destIso = countryIsoForAirport(destCode, trip.aller.destinationFull)
  const airlineLabel = formatAirlineLabel(trip)
  const imageUrl = resolveTripImageUrl({
    city: cityName,
    iata: trip.destination_code,
    imageUrl: trip.image_url,
  })
  const [failed, setFailed] = useState(false)
  const transfersKnown = trip.transfers != null
  const transfers = trip.transfers ?? 0
  const legPricesOk = trip.leg_prices_reliable !== false

  return (
    <View style={[styles.card, shadow.soft, faded && styles.faded]}>
      <View style={styles.hero}>
        {!failed ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <LinearGradient
            colors={[colors.primary, colors.primaryDeep]}
            style={styles.image}
          >
            <Text style={styles.fallbackText}>{cityName}</Text>
          </LinearGradient>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(12,18,34,0.15)', 'rgba(12,18,34,0.82)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />

        {favorite.isStillValid !== undefined ? (
          <View
            style={[
              styles.statusPill,
              favorite.isStillValid ? styles.statusOk : styles.statusBad,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: favorite.isStillValid
                    ? '#6EE7B7'
                    : '#FCA5A5',
                },
              ]}
            />
            <Text style={styles.statusText}>
              {favorite.isStillValid ? 'Dispo' : 'Indispo'}
            </Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.heart,
            pressed && { transform: [{ scale: 0.92 }] },
          ]}
          onPress={onRemove}
          hitSlop={12}
        >
          <HeartIcon size={20} filled color={colors.primary} />
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
              <View
                style={[
                  styles.metaBadge,
                  transfers === 0 && styles.metaBadgeDirect,
                ]}
              >
                <Text
                  style={[
                    styles.metaBadgeText,
                    transfers === 0 && styles.metaBadgeTextDirect,
                  ]}
                >
                  {transfers > 0
                    ? `${transfers} escale${transfers > 1 ? 's' : ''}`
                    : 'Direct'}
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
            <Text style={styles.priceHint}>par personne · A/R</Text>
          </View>
        </View>

        <View style={styles.legs}>
          {[
            { label: 'Aller', leg: trip.aller },
            { label: 'Retour', leg: trip.retour },
          ].map(({ label, leg }, i) => (
            <React.Fragment key={label}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.leg}>
                <View style={styles.legHead}>
                  <Text style={styles.legLabel}>{label}</Text>
                  {leg.flightNumber ? (
                    <Text style={styles.legFlight}>{leg.flightNumber}</Text>
                  ) : null}
                </View>
                <Text style={styles.legValue}>
                  {formatDate(leg.departureTime)} · {formatTime(leg.departureTime)}
                </Text>
                {legPricesOk && leg.price > 0 ? (
                  <Text style={styles.legPrice}>{Math.round(leg.price)} €</Text>
                ) : null}
              </View>
            </React.Fragment>
          ))}
        </View>

        {onBook ? (
          <Pressable
            onPress={onBook}
            style={({ pressed }) => [
              styles.bookBtn,
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Text style={styles.bookText}>{bookLabel}</Text>
          </Pressable>
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
  faded: { opacity: 0.55 },
  hero: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: colors.line,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  fallbackText: {
    marginTop: 56,
    textAlign: 'center',
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 22,
  },
  statusPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusOk: {
    backgroundColor: 'rgba(16,185,129,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(167,243,208,0.35)',
  },
  statusBad: {
    backgroundColor: 'rgba(239,68,68,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(252,165,165,0.35)',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: '#fff',
    letterSpacing: 0.4,
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
  },
  heroText: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 4,
  },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  city: {
    flex: 1,
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: '#fff',
    letterSpacing: -0.4,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  route: {
    flexShrink: 1,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.95)',
  },
  routeArrow: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  badgeRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  metaBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  airlineBadge: { flexShrink: 1, maxWidth: '58%' },
  airlineBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#fff',
    letterSpacing: 0.2,
  },
  metaBadgeDirect: { backgroundColor: 'rgba(52,211,153,0.92)' },
  metaBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaBadgeTextDirect: { color: '#fff' },
  body: { padding: spacing.lg, gap: 14 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  price: {
    fontFamily: fonts.extrabold,
    fontSize: 30,
    color: colors.primary,
    letterSpacing: -0.6,
  },
  priceHint: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  legs: {
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.primaryMuted,
    marginHorizontal: spacing.lg,
  },
  leg: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    gap: 2,
  },
  legHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  legLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  legFlight: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primaryInk,
    opacity: 0.75,
  },
  legValue: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
  },
  legPrice: {
    marginTop: 2,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.inkSoft,
  },
  bookBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#fff',
  },
})
