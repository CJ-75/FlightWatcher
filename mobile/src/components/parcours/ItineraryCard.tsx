import React from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  cityDisplayNameFr,
  cityImageUrl,
  itineraryMetaLine,
  type Itinerary,
  type ItineraryDurationKind,
} from '@flightwatcher/shared'
import { fonts } from '../../theme'

type Props = {
  itinerary: Partial<Itinerary> & { title?: string }
  variant?: 'portrait' | 'landscape'
  badge?: string | null
  onPress?: () => void
  style?: StyleProp<ViewStyle>
}

export function ItineraryCard({
  itinerary,
  variant = 'portrait',
  badge,
  onPress,
  style,
}: Props) {
  const city = itinerary.city_slug
    ? cityDisplayNameFr(null, itinerary.city_slug)
    : ''
  const cover =
    itinerary.cover_image ||
    (itinerary.city_slug ? cityImageUrl(itinerary.city_slug) : null)
  const meta = itineraryMetaLine({
    cityLabel: city || null,
    durationKind: itinerary.duration_kind as ItineraryDurationKind | null,
  })
  const landscape = variant === 'landscape'

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        landscape ? styles.landscape : styles.portrait,
        pressed && { opacity: 0.96, transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {cover ? (
        <Image source={{ uri: cover }} style={StyleSheet.absoluteFillObject} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.fallback]} />
      )}
      <View style={styles.scrim} />
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={styles.bottom}>
        <Text
          style={[styles.title, landscape && styles.titleLg]}
          numberOfLines={2}
        >
          {itinerary.title || 'Sans titre'}
        </Text>
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
  },
  portrait: {
    width: 220,
    aspectRatio: 3 / 4,
  },
  landscape: {
    width: 320,
    aspectRatio: 16 / 10,
  },
  fallback: {
    backgroundColor: '#FFE9DD',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    backgroundColor: 'rgba(0,0,0,0.45)',
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
  title: {
    fontFamily: fonts.regular,
    fontStyle: 'italic',
    fontSize: 24,
    color: '#fff',
    lineHeight: 28,
  },
  titleLg: {
    fontSize: 32,
    lineHeight: 36,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
  meta: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
})
