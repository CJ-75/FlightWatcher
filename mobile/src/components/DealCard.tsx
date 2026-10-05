import React, { useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { TravelDeal } from '@flightwatcher/shared'
import { HeartIcon } from './HeartIcon'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'

type Props = {
  deal: TravelDeal
  onPress: () => void
  liked?: boolean
  onToggleLike?: () => void
}

const width = Dimensions.get('window').width

function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00')
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc']
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`
}

export function DealCard({ deal, onPress, liked, onToggleLike }: Props) {
  const [failed, setFailed] = useState(false)
  const imageUrl =
    deal.image_url ||
    `https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&q=80&auto=format&fit=crop`

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, shadow.soft, pressed && styles.pressed]}
    >
      <View style={styles.hero}>
        {!failed ? (
          <Image source={{ uri: imageUrl }} style={styles.image} onError={() => setFailed(true)} />
        ) : (
          <LinearGradient colors={[colors.primary, colors.primaryDeep]} style={styles.image}>
            <Text style={styles.fallbackText}>{deal.city}</Text>
          </LinearGradient>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(12,18,34,0.15)', 'rgba(12,18,34,0.82)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />

        {deal.badge ? (
          <View style={styles.dealBadge}>
            <Text style={styles.dealText}>{deal.badge}</Text>
          </View>
        ) : null}

        {onToggleLike ? (
          <Pressable
            onPress={onToggleLike}
            hitSlop={10}
            style={styles.likeBtn}
            accessibilityRole="button"
            accessibilityLabel={liked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <HeartIcon
              size={20}
              filled={!!liked}
              color={liked ? colors.primary : colors.inkSoft}
            />
          </Pressable>
        ) : null}

        <View style={styles.heroText}>
          <Text style={styles.city} numberOfLines={1}>
            {deal.city}
          </Text>
          <Text style={styles.route} numberOfLines={1}>
            {deal.departure_airport} → {deal.city} · {deal.nights} nuit{deal.nights > 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.price}>{Math.round(deal.price_per_person)} €</Text>
            <Text style={styles.priceHint}>par personne · pack</Text>
          </View>
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText} numberOfLines={1}>
              {formatDate(deal.dates.outbound)} → {formatDate(deal.dates.inbound)}
            </Text>
          </View>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {deal.title}
        </Text>
        {deal.hotel_name ? (
          <Text style={styles.hotel} numberOfLines={1}>
            {deal.hotel_stars ? `${'★'.repeat(Math.min(5, deal.hotel_stars))} ` : ''}
            {deal.hotel_name}
          </Text>
        ) : null}
      </View>
    </Pressable>
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
  pressed: {
    opacity: 0.96,
    transform: [{ scale: 0.99 }],
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
  likeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 12,
    marginBottom: spacing.md,
  },
  price: { ...type.price, fontSize: 30 },
  priceHint: { ...type.caption, marginTop: 2 },
  metaChip: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    maxWidth: '48%',
  },
  metaChipText: {
    color: colors.primaryInk,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  hotel: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
})
