import React, { useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import {
  buildItineraryPopFacts,
  parseFaq,
  parseStay,
  parseTips,
  sanitizeUserFacingText,
  type Itinerary,
  type ItineraryPopFact,
} from '@waypop/shared'
import { colors, fonts, radius } from '../../theme'

type Props = {
  itinerary: Itinerary
  cityLabel?: string | null
  /** facts = Next-like row; blocks = stay/tips/faq; all = both (legacy). */
  sections?: 'facts' | 'blocks' | 'all'
}

function FactsRow({ facts }: { facts: ItineraryPopFact[] }) {
  if (!facts.length) return null
  return (
    <View style={styles.facts}>
      {facts.map((f) => (
        <View key={f.label} style={styles.fact}>
          <Text style={styles.factLabel}>{f.label}</Text>
          <Text style={styles.factValue}>{f.value}</Text>
        </View>
      ))}
    </View>
  )
}

/** Stay / tips / FAQ / facts — mobile-first cards (mirrors Next Pop mobile). */
export function ItineraryEditorialSections({
  itinerary,
  cityLabel,
  sections = 'all',
}: Props) {
  const showFacts = sections === 'facts' || sections === 'all'
  const showBlocks = sections === 'blocks' || sections === 'all'

  const facts = showFacts ? buildItineraryPopFacts(itinerary) : []
  const stay = showBlocks ? parseStay(itinerary.stay) : null
  const tips = showBlocks ? parseTips(itinerary.tips) : []
  const faq = showBlocks ? parseFaq(itinerary.faq) : []
  const [openFaq, setOpenFaq] = useState<Record<number, boolean>>({})

  const hasAny =
    facts.length > 0 || stay || tips.length > 0 || faq.length > 0
  if (!hasAny) return null

  return (
    <View style={styles.wrap}>
      {showFacts ? <FactsRow facts={facts} /> : null}

      {stay ? (
        <View style={styles.section}>
          <Text style={styles.h2}>
            {cityLabel ? `Où dormir à ${cityLabel}` : 'Où dormir'}
          </Text>
          <View style={styles.stayCard}>
            {stay.area ? (
              <Text style={styles.stayArea}>{stay.area}</Text>
            ) : null}
            {stay.vibe ? (
              <Text style={styles.stayVibe}>{stay.vibe}</Text>
            ) : null}
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
          <Text style={styles.h2}>Bon à savoir</Text>
          <View style={styles.tipsList}>
            {tips.map((t, i) => (
              <View key={i} style={styles.tipCard}>
                <View style={styles.tipBadge}>
                  <Text style={styles.tipBadgeText}>{i + 1}</Text>
                </View>
                <Text style={styles.tipBody}>
                  {sanitizeUserFacingText(t)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {faq.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.h2}>Questions fréquentes</Text>
          <View style={styles.faqList}>
            {faq.map((item, i) => {
              const open = !!openFaq[i]
              return (
                <View
                  key={i}
                  style={[styles.faqCard, open && styles.faqCardOpen]}
                >
                  <Pressable
                    onPress={() =>
                      setOpenFaq((prev) => ({ ...prev, [i]: !prev[i] }))
                    }
                    style={styles.faqHeader}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                  >
                    <Text style={styles.faqQ}>
                      {sanitizeUserFacingText(item.q)}
                    </Text>
                    <View style={styles.faqPlus}>
                      <Text style={styles.faqPlusText}>{open ? '×' : '+'}</Text>
                    </View>
                  </Pressable>
                  {open ? (
                    <Text style={styles.faqA}>
                      {sanitizeUserFacingText(item.a, { multiline: true })}
                    </Text>
                  ) : null}
                </View>
              )
            })}
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 28 },
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
  section: { gap: 12 },
  h2: {
    fontSize: 18,
    fontFamily: fonts.extrabold,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  stayCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  stayArea: {
    fontSize: 16,
    fontFamily: fonts.extrabold,
    color: colors.ink,
  },
  stayVibe: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  body: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: colors.inkSoft,
  },
  tipsList: { gap: 10 },
  tipCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: '#FFF3EC',
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  tipBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tipBadgeText: {
    fontSize: 11,
    fontFamily: fonts.extrabold,
    color: colors.white,
  },
  tipBody: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
  faqList: { gap: 10 },
  faqCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  faqCardOpen: {
    borderColor: 'rgba(255, 107, 53, 0.35)',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  faqQ: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  faqPlus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF3EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqPlusText: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.primary,
    marginTop: -1,
  },
  faqA: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: colors.inkSoft,
  },
})
