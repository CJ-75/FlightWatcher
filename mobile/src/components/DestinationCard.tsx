import React, { useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Linking,
} from 'react-native'
import type { EnrichedTripResponse } from '@flightwatcher/shared'
import { colors, radius, spacing } from '../theme'

interface Props {
  trip: EnrichedTripResponse
  onFavorite?: () => void
  onBook?: () => void
  isFavorite?: boolean
}

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

export function DestinationCard({ trip, onFavorite, onBook, isFavorite }: Props) {
  const cityName = trip.aller.destinationFull?.split(',')[0]?.trim() || trip.destination_code
  const imageUrl =
    trip.image_url ||
    `https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80&auto=format&fit=crop`
  const [failed, setFailed] = useState(false)

  const openBook = async () => {
    if (onBook) {
      onBook()
      return
    }
    await Linking.openURL('https://www.ryanair.com/fr/fr')
  }

  return (
    <View style={styles.card}>
      <View style={styles.hero}>
        {!failed ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={[styles.image, styles.imageFallback]}>
            <Text style={styles.fallbackText}>{cityName}</Text>
          </View>
        )}
        <View style={styles.overlay} />
        <Pressable style={styles.heart} onPress={onFavorite} hitSlop={8}>
          <Text style={styles.heartText}>{isFavorite ? '❤️' : '🤍'}</Text>
        </Pressable>
        <View style={styles.heroText}>
          <Text style={styles.city}>{cityName}</Text>
          <Text style={styles.route}>
            {trip.aller.origin} → {trip.destination_code}
          </Text>
        </View>
        {trip.is_good_deal ? (
          <View style={styles.dealBadge}>
            <Text style={styles.dealText}>Bon deal</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.price}>{Math.round(trip.prix_total)} €</Text>
        <Text style={styles.priceHint}>total aller-retour</Text>

        <View style={styles.legs}>
          <View style={styles.leg}>
            <Text style={styles.legLabel}>Aller</Text>
            <Text style={styles.legValue}>
              {formatDate(trip.aller.departureTime)} · {formatTime(trip.aller.departureTime)}
            </Text>
            <Text style={styles.legPrice}>{Math.round(trip.aller.price)} €</Text>
          </View>
          <View style={styles.leg}>
            <Text style={styles.legLabel}>Retour</Text>
            <Text style={styles.legValue}>
              {formatDate(trip.retour.departureTime)} · {formatTime(trip.retour.departureTime)}
            </Text>
            <Text style={styles.legPrice}>{Math.round(trip.retour.price)} €</Text>
          </View>
        </View>

        <Pressable style={styles.bookBtn} onPress={openBook}>
          <Text style={styles.bookText}>✈️ Réserver</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  hero: { height: 168, position: 'relative', backgroundColor: colors.slate200 },
  image: { width: '100%', height: '100%' },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  fallbackText: { color: colors.white, fontSize: 22, fontWeight: '800' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heart: { position: 'absolute', top: 12, right: 12, zIndex: 2 },
  heartText: { fontSize: 28 },
  heroText: { position: 'absolute', left: 16, bottom: 14, right: 16 },
  city: { color: colors.white, fontSize: 22, fontWeight: '900' },
  route: { color: 'rgba(255,255,255,0.9)', marginTop: 2, fontWeight: '600' },
  dealBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  dealText: { color: colors.white, fontWeight: '800', fontSize: 12 },
  body: { padding: spacing.lg },
  price: { fontSize: 28, fontWeight: '900', color: colors.primary },
  priceHint: { color: colors.slate500, marginBottom: spacing.md },
  legs: { gap: spacing.sm, marginBottom: spacing.lg },
  leg: {
    backgroundColor: colors.primary50,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  legLabel: { fontWeight: '800', color: colors.primary700, marginBottom: 2 },
  legValue: { color: colors.slate700, fontWeight: '600' },
  legPrice: { color: colors.slate900, fontWeight: '800', marginTop: 2 },
  bookBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  bookText: { color: colors.white, fontWeight: '800', fontSize: 16 },
})
