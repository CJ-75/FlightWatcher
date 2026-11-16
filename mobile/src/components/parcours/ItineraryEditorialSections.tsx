import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import {
  idealLabelFr,
  paceLabelFr,
  parseFaq,
  parseStay,
  parseTips,
  sanitizeUserFacingText,
  type Itinerary,
} from '@waypop/shared'
import { colors, fonts, radius } from '../../theme'

type Props = {
  itinerary: Itinerary
  cityLabel?: string | null
}

export function ItineraryEditorialSections({ itinerary, cityLabel }: Props) {
  const stay = parseStay(itinerary.stay)
  const tips = parseTips(itinerary.tips)
  const faq = parseFaq(itinerary.faq)
  const pace = paceLabelFr(itinerary.pace)
  const ideal = idealLabelFr((itinerary.ideal_for || [])[0] || '')
  const budget =
    itinerary.budget_estimate_eur != null &&
    Number(itinerary.budget_estimate_eur) > 0
      ? `≈ ${Math.round(Number(itinerary.budget_estimate_eur))} € / jour`
      : null

  const facts = [
    pace ? { label: 'Rythme', value: pace } : null,
    budget ? { label: 'Budget', value: budget } : null,
    ideal ? { label: 'Idéal', value: ideal } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  const hasAny = facts.length > 0 || stay || tips.length > 0 || faq.length > 0
  if (!hasAny) return null

  return (
    <View style={styles.wrap}>
      {facts.length > 0 ? (
        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={f.label} style={styles.fact}>
              <Text style={styles.factLabel}>{f.label}</Text>
              <Text style={styles.factValue}>{f.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {stay ? (
        <View style={styles.section}>
          <Text style={styles.eyebrow}>Hébergement</Text>
          <Text style={styles.h2}>
            {cityLabel ? `Où dormir à ${cityLabel}` : 'Où dormir'}
          </Text>
          <View style={styles.stayBar}>
            {stay.area ? <Text style={styles.stayArea}>{stay.area}</Text> : null}
            {stay.vibe ? <Text style={styles.stayVibe}>{stay.vibe}</Text> : null}
            {stay.note ? (
              <Text style={styles.body}>
                {sanitizeUserFacingText(stay.note, { multiline: true })}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {tips.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.eyebrow}>Conseils</Text>
          <Text style={styles.h2}>Bon à savoir</Text>
          {tips.map((t, i) => (
            <View key={i} style={styles.tipRow}>
              <View style={styles.dot} />
              <Text style={styles.body}>{sanitizeUserFacingText(t)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {faq.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.eyebrow}>Questions</Text>
          <Text style={styles.h2}>Questions fréquentes</Text>
          {faq.map((item, i) => (
            <View key={i} style={styles.faqItem}>
              <Text style={styles.faqQ}>{sanitizeUserFacingText(item.q)}</Text>
              <Text style={styles.body}>
                {sanitizeUserFacingText(item.a, { multiline: true })}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 22 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: {
    flexGrow: 1,
    minWidth: '42%',
    backgroundColor: colors.canvas,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  factLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  factValue: {
    marginTop: 4,
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  section: { gap: 8 },
  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  h2: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  stayBar: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    paddingLeft: 14,
    gap: 4,
  },
  stayArea: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  stayVibe: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: colors.inkSoft,
    flex: 1,
  },
  tipRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
  faqItem: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 6,
  },
  faqQ: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
})
