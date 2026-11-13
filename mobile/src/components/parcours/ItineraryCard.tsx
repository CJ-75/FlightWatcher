import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  citySlugDisplayNameFr,
  itineraryMetaLine,
  type Itinerary,
  type ItineraryDurationKind,
} from '@flightwatcher/shared'
import { coverUriCandidates } from '../../lib/coverUri'
import { fonts } from '../../theme'

type Props = {
  itinerary: Partial<Itinerary> & { title?: string }
  variant?: 'portrait' | 'landscape'
  badge?: string | null
  /** Couleur fond badge (ex. statut admin). */
  badgeColor?: string
  onPress?: () => void
  /** Start detail fetch on finger-down (before navigate). */
  onPressIn?: () => void
  style?: StyleProp<ViewStyle>
}

export function ItineraryCard({
  itinerary,
  variant = 'portrait',
  badge,
  badgeColor,
  onPress,
  onPressIn,
  style,
}: Props) {
  const city = itinerary.city_slug
    ? citySlugDisplayNameFr(itinerary.city_slug)
    : ''
  // Retina: portrait ~220pt → ≥1100px ; landscape ~320pt → ≥1280px
  const width = variant === 'landscape' ? 1600 : 1200
  const candidates = useMemo(
    () =>
      coverUriCandidates(itinerary.cover_image, {
        width,
        citySlug: itinerary.city_slug,
        slug: itinerary.slug,
      }),
    [itinerary.cover_image, itinerary.city_slug, itinerary.slug, width],
  )
  const [idx, setIdx] = useState(0)
  const uri = candidates[idx] || null
  const meta = itineraryMetaLine({
    cityLabel: city || null,
    durationKind: itinerary.duration_kind as ItineraryDurationKind | null,
  })
  const landscape = variant === 'landscape'

  useEffect(() => {
    setIdx(0)
  }, [candidates.join('|')])

  const onImageError = () => {
    setIdx((i) => (i + 1 < candidates.length ? i + 1 : i))
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      style={({ pressed }) => [
        styles.card,
        landscape ? styles.landscape : styles.portrait,
        pressed && { opacity: 0.96, transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="cover"
          onError={onImageError}
        />
      ) : (
        <View style={[styles.image, styles.fallback]} />
      )}
      {/* Scrim half-bottom, denser at base — AA for white text */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          'transparent',
          'rgba(0,0,0,0.22)',
          'rgba(0,0,0,0.55)',
          'rgba(0,0,0,0.82)',
        ]}
        locations={[0.42, 0.52, 0.72, 1]}
        style={styles.scrim}
      />
      {badge ? (
        <View
          style={[
            styles.badge,
            badgeColor ? { backgroundColor: badgeColor } : null,
          ]}
        >
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={styles.bottom} pointerEvents="none">
        {/* Slot 2 lignes, titre collé en bas → 1 ligne proche ville ; 2 lignes remplissent vers le haut. */}
        <View style={[styles.titleSlot, landscape && styles.titleSlotLg]}>
          <Text
            style={[styles.title, landscape && styles.titleLg]}
            numberOfLines={2}
          >
            {itinerary.title || 'Sans titre'}
          </Text>
        </View>
        {landscape && itinerary.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {itinerary.subtitle}
          </Text>
        ) : null}
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FFE9DD',
    position: 'relative',
  },
  portrait: {
    width: 220,
    aspectRatio: 3 / 4,
  },
  landscape: {
    width: 320,
    maxWidth: '100%',
    aspectRatio: 16 / 10,
    minHeight: 180,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  fallback: {
    backgroundColor: '#FFE9DD',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#000',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  bottom: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
  },
  titleSlot: {
    minHeight: 44, // 2 × lineHeight 22
    justifyContent: 'flex-end',
  },
  titleSlotLg: {
    minHeight: 52, // 2 × lineHeight 26
  },
  title: {
    fontFamily: fonts.extrabold,
    fontStyle: 'normal',
    fontSize: 18,
    color: '#fff',
    lineHeight: 22,
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  titleLg: {
    fontSize: 22,
    lineHeight: 26,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  meta: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
})
