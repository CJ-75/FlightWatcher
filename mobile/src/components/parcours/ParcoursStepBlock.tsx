import React, { useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Linking,
} from 'react-native'
import {
  buildItineraryStepMapsUrl,
  formatDurationMinutes,
  stepKindLabel,
  type ItineraryItem,
} from '@flightwatcher/shared'
import { colors, fonts, radius, shadow } from '../../theme'
import { ParcoursPhotoLightbox } from './ParcoursPhotoLightbox'

type Props = {
  item: ItineraryItem
  index: number
  momentLabel?: string | null
}

function stepPhotos(it: ItineraryItem): string[] {
  const raw = it.meta?.photos
  const fromMeta = Array.isArray(raw)
    ? raw.map(String).filter(Boolean)
    : []
  if (fromMeta.length) return fromMeta.slice(0, 5)
  return it.photo ? [it.photo] : []
}

export function ParcoursStepBlock({ item, index, momentLabel }: Props) {
  const title = item.title || item.places?.name || `Étape ${index + 1}`
  const dur = formatDurationMinutes(item.duration_minutes)
  const mapsUrl = buildItineraryStepMapsUrl(item)
  const photos = stepPhotos(item)
  const single = photos.length === 1 ? photos[0] : null
  const gallery = photos.length >= 2 ? photos : []
  const [lbIndex, setLbIndex] = useState<number | null>(null)

  const kindLine = [stepKindLabel(item.kind), momentLabel, dur]
    .filter(Boolean)
    .join(' · ')

  const row = (
    <>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{index + 1}</Text>
      </View>
      {single ? (
        <Pressable
          onPress={() => setLbIndex(0)}
          accessibilityRole="imagebutton"
          accessibilityLabel="Agrandir la photo"
        >
          <Image source={{ uri: single }} style={styles.stepThumb} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.stepKind}>{kindLine}</Text>
        <Text style={styles.stepTitle}>{title}</Text>
        {item.note ? <Text style={styles.stepNote}>{item.note}</Text> : null}
      </View>
    </>
  )

  return (
    <View style={[styles.card, shadow.soft]}>
      {mapsUrl ? (
        <Pressable
          style={({ pressed }) => [styles.step, pressed && styles.pressed]}
          onPress={() => void Linking.openURL(mapsUrl)}
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir ${title} dans Google Maps`}
        >
          {row}
        </Pressable>
      ) : (
        <View style={styles.step}>{row}</View>
      )}

      {gallery.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.gallery}
          contentContainerStyle={styles.galleryInner}
        >
          {gallery.map((uri, pi) => (
            <Pressable
              key={`${uri}-${pi}`}
              onPress={() => setLbIndex(pi)}
              accessibilityRole="imagebutton"
            >
              <Image source={{ uri }} style={styles.galleryImg} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <ParcoursPhotoLightbox
        photos={photos}
        index={lbIndex}
        title={title}
        onClose={() => setLbIndex(null)}
        onIndexChange={setLbIndex}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 12,
  },
  step: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  pressed: { opacity: 0.78 },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF0E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primary,
  },
  stepThumb: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: '#EDE8E1',
  },
  stepKind: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  stepTitle: {
    marginTop: 2,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  stepNote: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: '#6B5C50',
    lineHeight: 20,
  },
  gallery: { marginTop: 12 },
  galleryInner: { gap: 8, paddingRight: 4 },
  galleryImg: {
    width: 96,
    height: 96,
    borderRadius: 14,
    backgroundColor: '#EDE8E1',
  },
})
