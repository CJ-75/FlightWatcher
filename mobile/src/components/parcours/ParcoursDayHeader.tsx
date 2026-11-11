import React from 'react'
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native'
import {
  buildItineraryMapsUrl,
  type ItineraryItem,
} from '@flightwatcher/shared'
import { colors, fonts, radius } from '../../theme'

type Props = {
  /** « Jour 1 », « Jour 2 »… */
  label: string
  items: ItineraryItem[]
}

/** Triangle play géométrique (évite l’emoji iOS). */
function PlayTriangle() {
  return <View style={styles.triangle} />
}

/** En-tête jour + play → itinéraire Maps du jour. */
export function ParcoursDayHeader({ label, items }: Props) {
  const mapsUrl = buildItineraryMapsUrl(items)
  const dayNum = label.replace(/\D/g, '') || '1'

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {mapsUrl ? (
        <Pressable
          onPress={() => void Linking.openURL(mapsUrl)}
          style={({ pressed }) => [styles.play, pressed && styles.playPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Lancer le parcours ${label}`}
          hitSlop={6}
        >
          <View style={styles.playIcon}>
            <PlayTriangle />
          </View>
          <Text style={styles.playText}>Parcours J{dayNum}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
    flexShrink: 1,
  },
  play: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.ink,
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
  },
  playPressed: { opacity: 0.78 },
  playIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  /** Triangle plein blanc via borders CSS. */
  triangle: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#FFF8F3',
  },
  playText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#FFF8F3',
  },
})
