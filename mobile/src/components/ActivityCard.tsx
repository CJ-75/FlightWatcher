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
import {
  ACTIVITY_ADDED_BADGE_FR,
  type ActivityCardModel,
} from '@flightwatcher/shared'
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
  /** Already in the linked / chosen séjour. */
  added?: boolean
}

const screenW = Dimensions.get('window').width
const heroHeight = Math.min(220, Math.round(screenW * 0.52))

/** Image-led activity card — same visual language as DealCard. */
export function ActivityCard({
  card,
  onPress,
  onBook,
  onAdd,
  addLabel = 'Ajouter',
  addDisabled = false,
  liked,
  onToggleLike,
  added = false,
}: Props) {
  const factChips = [card.durationLabel, card.distanceLabel].filter(
    Boolean,
  ) as string[]
  const ratingValue =
    card.rating != null ? card.rating.toFixed(1).replace('.', ',') : null
  const reviewLabel =
    card.reviewCount != null && card.reviewCount > 0
      ? `${card.reviewCount.toLocaleString('fr-FR')} avis`
      : null
  const hasMeta = card.rating != null || factChips.length > 0

  return (
    <View style={[styles.card, shadow.soft, added && styles.cardAdded]}>
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
        <View style={styles.badgeCol} pointerEvents="none">
          {added ? (
            <View style={styles.addedBadge}>
              <Text style={styles.addedBadgeText}>✓ {ACTIVITY_ADDED_BADGE_FR}</Text>
            </View>
          ) : null}
          {card.freeCancellation ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Annulation gratuite</Text>
            </View>
          ) : card.instantConfirmation ? (
            <View style={[styles.badge, styles.badgeInk]}>
              <Text style={[styles.badgeText, styles.badgeInkText]}>
                Confirmation instantanée
              </Text>
            </View>
          ) : null}
        </View>
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
        {hasMeta ? (
          <View style={styles.metaBlock}>
            {card.rating != null ? (
              <View style={styles.ratingRow}>
                <ReviewStars rating={card.rating} size={12} />
                {ratingValue ? (
                  <Text style={styles.ratingValue}>{ratingValue}</Text>
                ) : null}
                {reviewLabel ? (
                  <Text style={styles.reviewText} numberOfLines={1}>
                    · {reviewLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {factChips.length ? (
              <View style={styles.chipRow}>
                {factChips.map((label) => (
                  <View key={label} style={styles.factChip}>
                    <Text style={styles.factChipText}>{label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.priceBlock}>
            <Text style={styles.priceLabel}>À partir de</Text>
            <Text style={styles.price} numberOfLines={1}>
              {card.priceLabel || 'Voir'}
            </Text>
          </View>
          <View style={styles.ctaRow}>
            {onAdd ? (
              <Pressable
                onPress={(e) => {
                  e?.stopPropagation?.()
                  if (!addDisabled) onAdd()
                }}
                disabled={addDisabled}
                accessibilityLabel={addLabel}
                style={({ pressed }) => [
                  styles.ctaSecondary,
                  pressed && { opacity: 0.9 },
                  addDisabled && { opacity: 0.5 },
                ]}
                hitSlop={4}
              >
                <Text style={styles.ctaPlus}>+</Text>
                <Text style={styles.ctaSecondaryText}>{addLabel}</Text>
              </Pressable>
            ) : null}
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
  cardAdded: {
    borderColor: colors.success,
  },
  badgeCol: {
    position: 'absolute',
    top: 10,
    left: 10,
    gap: 6,
    zIndex: 2,
  },
  addedBadge: {
    backgroundColor: colors.success,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addedBadgeText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 10,
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
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeInk: { backgroundColor: colors.ink },
  badgeText: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  badgeInkText: { color: colors.white },
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
    paddingTop: 10,
    paddingBottom: spacing.md,
    gap: 10,
  },
  metaBlock: {
    gap: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    minHeight: 18,
  },
  ratingValue: {
    fontFamily: fonts.extrabold,
    fontSize: 13,
    color: colors.ink,
    includeFontPadding: false,
  },
  reviewText: {
    flexShrink: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    includeFontPadding: false,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  factChip: {
    backgroundColor: colors.canvas,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  factChipText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.inkSoft,
    includeFontPadding: false,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  priceBlock: {
    flex: 1,
    minWidth: 0,
  },
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
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
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
    minHeight: 40,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.white,
  },
  ctaPlus: {
    color: colors.primary,
    fontFamily: fonts.extrabold,
    fontSize: 16,
    lineHeight: 18,
    includeFontPadding: false,
  },
  ctaSecondaryText: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 12,
    includeFontPadding: false,
  },
})
