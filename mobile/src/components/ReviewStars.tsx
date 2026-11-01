import React from 'react'
import { Text, StyleSheet } from 'react-native'
import { scoreToHalfStars5 } from '@flightwatcher/shared'
import { fonts } from '../theme'

type Props = {
  score?: number | null
  size?: number
}

/** Guest-review score (/10) as proportional ★ /5 on a single line (½ = ★ plus claire). */
export function ReviewStars({ score, size = 14 }: Props) {
  const stars = scoreToHalfStars5(score)
  if (stars == null) return null
  const full = Math.floor(stars)
  const half = stars - full >= 0.5
  const empty = 5 - full - (half ? 1 : 0)

  return (
    <Text
      numberOfLines={1}
      style={[styles.line, { fontSize: size, lineHeight: size + 3 }]}
      accessibilityLabel={`${stars} sur 5`}
    >
      {full > 0 ? <Text style={styles.full}>{'★'.repeat(full)}</Text> : null}
      {half ? <Text style={styles.half}>★</Text> : null}
      {empty > 0 ? <Text style={styles.empty}>{'★'.repeat(empty)}</Text> : null}
    </Text>
  )
}

const styles = StyleSheet.create({
  line: {
    fontFamily: fonts.bold,
    flexShrink: 0,
    letterSpacing: 1,
  },
  full: { color: '#F59E0B' },
  half: { color: '#FBBF24' },
  empty: { color: '#CBD5E1' },
})
