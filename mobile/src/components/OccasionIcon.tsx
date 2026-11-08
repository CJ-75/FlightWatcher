import React from 'react'
import { Platform, Text, View } from 'react-native'
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
 * Emoji need extra line-box room or they clip top/bottom.
 */
export function OccasionIcon({
  icon,
  slug,
  size = 18,
  color = colors.primaryDeep,
}: Props) {
  const id = resolveOccasionIconId(icon, slug)
  const fontSize = Math.round(size)
  // Emoji ascent/descent overflows a tight size×size box — pad the line box.
  const lineBox = Math.ceil(fontSize * 1.35)
  return (
    <View
      style={{
        width: lineBox,
        height: lineBox,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize,
          lineHeight: lineBox,
          height: lineBox,
          width: lineBox,
          color,
          textAlign: 'center',
          includeFontPadding: false,
          ...Platform.select({
            android: { textAlignVertical: 'center' as const },
            default: {},
          }),
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
