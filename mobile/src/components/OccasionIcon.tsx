import React from 'react'
import { Text, View } from 'react-native'
import { resolveOccasionIconId, type OccasionIconId } from '@flightwatcher/shared'
import { colors } from '../theme'

type Props = {
  icon?: string | null
  slug?: string | null
  size?: number
  color?: string
}

/**
 * Lightweight occasion glyphs — no @expo/vector-icons (missing in this Expo app).
 * Same resolveOccasionIconId mapping as web SVG OccasionIcon.
 */
export function OccasionIcon({
  icon,
  slug,
  size = 18,
  color = colors.primaryDeep,
}: Props) {
  const id = resolveOccasionIconId(icon, slug)
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        style={{
          fontSize: Math.round(size * 0.92),
          lineHeight: size,
          color,
          textAlign: 'center',
        }}
      >
        {glyphFor(id)}
      </Text>
    </View>
  )
}

function glyphFor(id: OccasionIconId): string {
  switch (id) {
    case 'briefcase':
      return '💼'
    case 'calendar':
      return '📅'
    case 'clock':
      return '⏱'
    case 'heart':
      return '♥'
    case 'gift':
      return '🎁'
    case 'euro':
      return '€'
    case 'compass':
      return '🧭'
    case 'sun':
      return '☀'
    case 'thermometer':
      return '🌡'
    case 'luggage':
      return '🧳'
    case 'tree':
      return '🎄'
    case 'bridge':
      return '🌉'
    case 'champagne':
      return '🥂'
    case 'moon':
      return '🌙'
    case 'sparkles':
    default:
      return '✨'
  }
}
