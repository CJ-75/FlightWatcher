import React from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { ActivityCardModel } from '@flightwatcher/shared'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type Props = {
  card: ActivityCardModel
  onPress: () => void
  onBook: () => void
  onAdd?: () => void
  addLabel?: string
  addDisabled?: boolean
}

const screenW = Dimensions.get('window').width
const heroHeight = Math.min(220, Math.round(screenW * 0.52))

/** Image-led activity card — same visual language as DealCard. */
export function ActivityCard({
  card,
  onPress,
  onBook,
  onAdd,
  addLabel = 'Au planner',
  addDisabled = false,
}: Props) {
  const meta = [
    card.rating != null
      ? `${card.rating.toFixed(1)}${card.reviewCount != null ? ` · ${card.reviewCount} avis` : ''}`
      : null,
    card.durationLabel,
    card.distanceLabel,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <View style={[styles.card, shadow.soft]}>
      <Pressable onPress={onPress} style={styles.hero}>
        {card.photoUrl ? (
          <Image source={{ uri: card.photoUrl }} style={styles.image} />
        ) : (
          <LinearGradient
            colors={[colors.primary, colors.primaryDeep]}
            style={styles.image}
          >
            <Text style={styles.fallbackText} numberOfLines={2}>
              {card.title}
            </Text>
          </LinearGradient>
        )}
        <LinearGradient
          colors={['rgba(26,18,14,0.12)', 'transparent', 'rgba(26,18,14,0.72)']}
          locations={[0, 0.42, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {card.freeCancellation ? (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>Annulation gratuite</Text>
          </View>
        ) : card.instantConfirmation ? (
          <View style={[styles.badge, styles.badgeInk]} pointerEvents="none">
            <Text style={styles.badgeText}>Confirmation instantanée</Text>
          </View>
        ) : null}
        <View style={styles.heroBottom} pointerEvents="none">
          <Text style={styles.heroTitle} numberOfLines={2}>
            {card.title}
          </Text>
        </View>
      </Pressable>

      <Pressable onPress={onPress} style={styles.body}>
        {meta ? (
          <Text style={styles.meta} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
        <View style={styles.priceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.priceLabel}>À partir de</Text>
            <Text style={styles.price}>{card.priceLabel || 'Voir le tarif'}</Text>
          </View>
          <View style={styles.ctaCol}>
            <Pressable
              onPress={(e) => {
                e?.stopPropagation?.()
                onBook()
              }}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
              hitSlop={4}
            >
              <Text style={styles.ctaText}>Réserver</Text>
            </Pressable>
            {onAdd ? (
              <Pressable
                onPress={(e) => {
                  e?.stopPropagation?.()
                  if (!addDisabled) onAdd()
                }}
                disabled={addDisabled}
                style={({ pressed }) => [
                  styles.ctaSecondary,
                  pressed && { opacity: 0.9 },
                  addDisabled && { opacity: 0.5 },
                ]}
                hitSlop={4}
              >
                <Text style={styles.ctaSecondaryText}>{addLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginBottom: spacing.md,
  },
  hero: {
    width: '100%',
    height: heroHeight,
    backgroundColor: colors.canvas,
  },
  image: {
    width: '100%',
    height: heroHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontFamily: fonts.bold,
    color: colors.white,
    fontSize: 18,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: colors.success,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeInk: { backgroundColor: colors.ink },
  badgeText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  heroBottom: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
  },
  heroTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    letterSpacing: -0.4,
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: 10,
  },
  meta: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  ctaCol: { gap: 8, alignItems: 'stretch' },
  priceLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 2,
  },
  price: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    letterSpacing: -0.8,
    color: colors.primary,
    includeFontPadding: false,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  ctaText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  ctaSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  ctaSecondaryText: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
})
