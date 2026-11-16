import React from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import {
  ITINERARY_IDEAL_LABELS,
  ITINERARY_OCCASIONS,
  ITINERARY_OCCASION_LABELS,
  PACE_LABEL,
  type FaqItem,
  type ItineraryOccasion,
} from '@waypop/shared'
import { colors, fonts, radius, shadow, spacing } from '../../theme'

const PACE_OPTIONS = ['slow', 'moderate', 'packed'] as const
const IDEAL_OPTIONS = Array.from(
  new Set([...ITINERARY_OCCASIONS, 'premiere_fois']),
)

export type ParcoursEditorialValues = {
  subtitle: string
  intro: string
  pace: string | null
  ideal_for: string[]
  stay_area: string
  stay_vibe: string
  stay_note: string
  tipsText: string
  faq: FaqItem[]
}

type Props = {
  values: ParcoursEditorialValues
  onChange: (patch: Partial<ParcoursEditorialValues>) => void
}

export function ParcoursEditorialFields({ values, onChange }: Props) {
  return (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.card, shadow.soft]}>
        <Text style={styles.section}>Page Pop</Text>
        <Text style={styles.hint}>
          Sous-titre, rythme, hébergement, conseils et FAQ — visibles sur le Pop.
        </Text>

        <Text style={styles.q}>Sous-titre</Text>
        <TextInput
          value={values.subtitle}
          onChangeText={(subtitle) => onChange({ subtitle })}
          placeholder="Promise courte sous le titre"
          placeholderTextColor={colors.faint}
          style={styles.input}
        />

        <Text style={styles.q}>Introduction</Text>
        <TextInput
          value={values.intro}
          onChangeText={(intro) => onChange({ intro })}
          placeholder="Texte d’intro du Pop"
          placeholderTextColor={colors.faint}
          multiline
          style={[styles.input, styles.multiline]}
        />

        <Text style={styles.q}>Rythme</Text>
        <View style={styles.row}>
          {PACE_OPTIONS.map((p) => {
            const on = values.pace === p
            return (
              <Pressable
                key={p}
                onPress={() => onChange({ pace: on ? null : p })}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {PACE_LABEL[p]}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Text style={styles.q}>Idéal pour</Text>
        <View style={styles.row}>
          {IDEAL_OPTIONS.map((o) => {
            const on = values.ideal_for.includes(o)
            return (
              <Pressable
                key={o}
                onPress={() => {
                  const cur = new Set(values.ideal_for)
                  if (on) cur.delete(o)
                  else cur.add(o)
                  onChange({ ideal_for: [...cur] })
                }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {ITINERARY_IDEAL_LABELS[o] ||
                    ITINERARY_OCCASION_LABELS[o as ItineraryOccasion] ||
                    o}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={[styles.card, shadow.soft]}>
        <Text style={styles.section}>Hébergement</Text>
        <Text style={styles.q}>Quartier / zone</Text>
        <TextInput
          value={values.stay_area}
          onChangeText={(stay_area) => onChange({ stay_area })}
          placeholder="Ex. Le Marais"
          placeholderTextColor={colors.faint}
          style={styles.input}
        />
        <Text style={styles.q}>Ambiance</Text>
        <TextInput
          value={values.stay_vibe}
          onChangeText={(stay_vibe) => onChange({ stay_vibe })}
          placeholder="Ex. Calme, central"
          placeholderTextColor={colors.faint}
          style={styles.input}
        />
        <Text style={styles.q}>Note</Text>
        <TextInput
          value={values.stay_note}
          onChangeText={(stay_note) => onChange({ stay_note })}
          placeholder="Conseil où dormir"
          placeholderTextColor={colors.faint}
          multiline
          style={[styles.input, styles.multiline]}
        />
      </View>

      <View style={[styles.card, shadow.soft]}>
        <Text style={styles.section}>Conseils</Text>
        <Text style={styles.hint}>Un conseil par ligne</Text>
        <TextInput
          value={values.tipsText}
          onChangeText={(tipsText) => onChange({ tipsText })}
          placeholder={'Réserver le resto la veille\nPrévoir des baskets'}
          placeholderTextColor={colors.faint}
          multiline
          style={[styles.input, styles.multilineTall]}
        />
      </View>

      <View style={[styles.card, shadow.soft]}>
        <View style={styles.faqHead}>
          <Text style={styles.section}>FAQ</Text>
          <Pressable
            onPress={() =>
              onChange({ faq: [...values.faq, { q: '', a: '' }] })
            }
            hitSlop={8}
          >
            <Text style={styles.addFaq}>+ Question</Text>
          </Pressable>
        </View>
        {values.faq.length === 0 ? (
          <Text style={styles.hint}>Aucune question pour l’instant.</Text>
        ) : null}
        {values.faq.map((row, i) => (
          <View key={i} style={styles.faqBlock}>
            <TextInput
              value={row.q}
              onChangeText={(q) => {
                const faq = values.faq.map((r, idx) =>
                  idx === i ? { ...r, q } : r,
                )
                onChange({ faq })
              }}
              placeholder="Question"
              placeholderTextColor={colors.faint}
              style={styles.input}
            />
            <TextInput
              value={row.a}
              onChangeText={(a) => {
                const faq = values.faq.map((r, idx) =>
                  idx === i ? { ...r, a } : r,
                )
                onChange({ faq })
              }}
              placeholder="Réponse"
              placeholderTextColor={colors.faint}
              multiline
              style={[styles.input, styles.multiline]}
            />
            <Pressable
              onPress={() =>
                onChange({ faq: values.faq.filter((_, idx) => idx !== i) })
              }
            >
              <Text style={styles.removeFaq}>Retirer</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 8,
  },
  section: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
  },
  q: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 6,
  },
  input: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.canvas,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  multilineTall: { minHeight: 110, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.canvas,
  },
  chipOn: { backgroundColor: colors.ink },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.inkSoft,
  },
  chipTextOn: { color: colors.white },
  faqHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addFaq: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primary,
  },
  faqBlock: { gap: 8, marginTop: 8 },
  removeFaq: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.danger,
  },
})
