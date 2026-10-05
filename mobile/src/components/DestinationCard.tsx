import React, { useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Linking,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { EnrichedTripResponse } from '@flightwatcher/shared'
import { buildRyanairBookingUrl } from '@flightwatcher/shared'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'
import { HeartIcon } from './HeartIcon'

interface Props {
  trip: EnrichedTripResponse
  passengers?: number
  onFavorite?: () => void
  onBook?: () => void
  isFavorite?: boolean
}

const width = Dimensions.get('window').width

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
  isFavorite,
}: Props) {
  const cityName = trip.aller.destinationFull?.split(',')[0]?.trim() || trip.destination_code
  const imageUrl =
    trip.image_url ||
    `https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&q=80&auto=format&fit=crop`
  const [failed, setFailed] = useState(false)

  const openBook = async () => {
    if (onBook) {
      onBook()
      return
    }
    await Linking.openURL(buildRyanairBookingUrl(trip, passengers))
  }

  return (
    <View style={[styles.card, shadow.soft]}>
      <View style={styles.hero}>
        {!failed ? (
          <Image source={{ uri: imageUrl }} style={styles.image} onError={() => setFailed(true)} />
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
          <Text style={styles.city} numberOfLines={1}>
            {cityName}
          </Text>
          <Text style={styles.route}>
            {trip.aller.origin}  →  {trip.destination_code}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.price}>{Math.round(trip.prix_total)} €</Text>
            <Text style={styles.priceHint}>total aller-retour</Text>
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
            <Text style={styles.legPrice}>{Math.round(trip.aller.price)} €</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.leg}>
            <Text style={styles.legLabel}>Retour</Text>
            <Text style={styles.legValue}>
              {formatDate(trip.retour.departureTime)} · {formatTime(trip.retour.departureTime)}
            </Text>
            <Text style={styles.legPrice}>{Math.round(trip.retour.price)} €</Text>
          </View>
        </View>

        <Pressable
          onPress={openBook}
          style={({ pressed }) => [styles.bookBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
        >
          <Text style={styles.bookText}>Réserver</Text>
        </Pressable>
      </View>
    </View>
  )
}

const heroHeight = Math.min(200, Math.round(width * 0.48))

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  hero: { height: heroHeight, backgroundColor: colors.line },
  image: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
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
  city: {
    color: colors.white,
    fontFamily: fonts.extrabold,
    fontSize: 26,
    letterSpacing: -0.8,
  },
  route: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: fonts.medium,
    fontSize: 13,
    marginTop: 4,
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
  bookBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookText: { ...type.button, color: colors.white },
})
