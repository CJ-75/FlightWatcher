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
import { HeartIcon } from './HeartIcon'
import { ReviewStars } from './ReviewStars'

type Props = {
  card: ActivityCardModel
  onPress: () => void
  onBook: () => void
  onAdd?: () => void
  addLabel?: string
  addDisabled?: boolean
  liked?: boolean
  onToggleLike?: () => void
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
  liked,
  onToggleLike,
}: Props) {
  const chips = [card.durationLabel, card.distanceLabel].filter(Boolean).join(' · ')
  const reviewLabel =
    card.reviewCount != null && card.reviewCount > 0
      ? `${card.reviewCount.toLocaleString('fr-FR')} avis`
      : null

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
        {onToggleLike ? (
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.()
              onToggleLike()
            }}
            hitSlop={12}
            style={styles.likeBtn}
          >
            <HeartIcon
              size={18}
              filled={!!liked}
              color={liked ? colors.primary : colors.inkSoft}
            />
          </Pressable>
        ) : null}
        <View style={styles.heroBottom} pointerEvents="none">
          <Text style={styles.heroTitle} numberOfLines={2}>
            {card.title}
          </Text>
        </View>
      </Pressable>

      <Pressable onPress={onPress} style={styles.body}>
        {card.rating != null || chips ? (
          <View style={styles.metaBlock}>
            {card.rating != null ? (
              <View style={styles.ratingRow}>
                <ReviewStars rating={card.rating} size={13} />
                {reviewLabel ? (
                  <Text style={styles.reviewText} numberOfLines={1}>
                    {reviewLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {chips ? (
              <Text style={styles.meta} numberOfLines={1}>
                {chips}
              </Text>
            ) : null}
          </View>
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
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: colors.success,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeInk: { backgroundColor: colors.ink },
  badgeText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  likeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  heroBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    letterSpacing: -0.3,
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 8,
  },
  metaBlock: {
    gap: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 16,
  },
  reviewText: {
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  meta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  ctaCol: { gap: 6, alignItems: 'stretch' },
  priceLabel: {
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 2,
  },
  price: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    letterSpacing: -0.5,
    color: colors.primary,
    includeFontPadding: false,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  ctaText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  ctaSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  ctaSecondaryText: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
})
