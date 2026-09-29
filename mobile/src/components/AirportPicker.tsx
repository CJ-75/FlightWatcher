import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  SectionList,
  Keyboard,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Airport } from '@flightwatcher/shared'
import { colors, fonts, shadow } from '../theme'

/** Top French / nearby hubs shown first in the picker. */
const POPULAR = [
  'BVA',
  'ORY',
  'CDG',
  'LYS',
  'MRS',
  'NCE',
  'TLS',
  'BOD',
  'NTE',
  'LIL',
  'SXB',
  'MPL',
] as const

type Props = {
  airports: Airport[]
  value: string
  onChange: (code: string) => void
  /** Hide quick chips under the trigger (saves vertical space). */
  compact?: boolean
}

type Section = {
  title: string
  data: Airport[]
}

function filterAirports(list: Airport[], query: string): Airport[] {
  const safe = Array.isArray(list) ? list : []
  const q = query.trim().toLowerCase()
  if (!q) return safe
  return safe.filter(
    (a) =>
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.country.toLowerCase().includes(q),
  )
}

export function AirportPicker({ airports, value, onChange, compact }: Props) {
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => airports.find((a) => a.code === value.toUpperCase()) ?? null,
    [airports, value],
  )

  const popularAirports = useMemo(() => {
    const safe = Array.isArray(airports) ? airports : []
    const byCode = new Map(safe.map((a) => [a.code, a]))
    return POPULAR.map((code) => byCode.get(code)).filter(Boolean) as Airport[]
  }, [airports])

  const popularCodes = useMemo(
    () => new Set(popularAirports.map((a) => a.code)),
    [popularAirports],
  )

  const sections = useMemo((): Section[] => {
    const q = query.trim()
    const filtered = filterAirports(airports, q)

    if (q) {
      return filtered.length > 0 ? [{ title: 'Résultats', data: filtered }] : []
    }

    const rest = filtered
      .filter((a) => !popularCodes.has(a.code))
      .slice()
      .sort((a, b) => a.city.localeCompare(b.city, 'fr'))

    const out: Section[] = []
    if (popularAirports.length > 0) {
      out.push({ title: 'Top aéroports', data: popularAirports })
    }
    if (rest.length > 0) {
      out.push({ title: 'Tous les aéroports', data: rest })
    }
    return out
  }, [airports, query, popularAirports, popularCodes])

  useEffect(() => {
    if (!open) {
      setQuery('')
      Keyboard.dismiss()
    }
  }, [open])

  const pick = (code: string) => {
    onChange(code)
    setOpen(false)
  }

  const renderAirport = (item: Airport) => {
    const active = item.code === value
    return (
      <Pressable
        onPress={() => pick(item.code)}
        style={[styles.row, active && styles.rowActive]}
      >
        <View style={[styles.rowCode, active && styles.rowCodeActive]}>
          <Text style={[styles.rowCodeText, active && styles.rowCodeTextActive]}>
            {item.code}
          </Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowCity} numberOfLines={1}>
            {item.city}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {item.name} · {item.country}
          </Text>
        </View>
        {active ? <Text style={styles.check}>✓</Text> : null}
      </Pressable>
    )
  }

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        <View style={styles.codeBadge}>
          <Text style={styles.codeText}>{value || '—'}</Text>
        </View>
        <View style={styles.triggerBody}>
          <Text style={styles.triggerTitle} numberOfLines={1}>
            {selected?.city || selected?.name || 'Choisir un aéroport'}
          </Text>
          {!compact ? (
            <Text style={styles.triggerSub} numberOfLines={1}>
              {selected
                ? `${selected.name} · ${selected.country}`
                : 'Rechercher par ville ou code IATA'}
            </Text>
          ) : selected ? (
            <Text style={styles.triggerSub} numberOfLines={1}>
              {selected.code} · {selected.country}
            </Text>
          ) : null}
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      {!compact && popularAirports.length > 0 ? (
        <View style={styles.popularRow}>
          {popularAirports.slice(0, 6).map((a) => {
            const active = a.code === value
            return (
              <Pressable
                key={a.code}
                onPress={() => onChange(a.code)}
                style={[styles.popularChip, active && styles.popularChipActive]}
              >
                <Text style={[styles.popularCode, active && styles.popularCodeActive]}>
                  {a.code}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.sheet, { paddingTop: 12, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Aéroport de départ</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Text style={styles.sheetClose}>Fermer</Text>
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Ville, aéroport ou code…"
              placeholderTextColor={colors.faint}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>

          <SectionList
            sections={sections}
            keyExtractor={(item, index) => `${item.code}-${index}`}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingBottom: 16 }}
            ListEmptyComponent={
              <Text style={styles.empty}>Aucun aéroport trouvé</Text>
            }
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            )}
            renderItem={({ item }) => renderAirport(item)}
          />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 10,
    gap: 10,
  },
  triggerPressed: {
    backgroundColor: colors.primaryMuted,
  },
  codeBadge: {
    minWidth: 44,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  codeText: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.primary,
    letterSpacing: 0.4,
    includeFontPadding: false,
  },
  triggerBody: { flex: 1, minWidth: 0 },
  triggerTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    includeFontPadding: false,
  },
  triggerSub: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    marginTop: 1,
    includeFontPadding: false,
  },
  chevron: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 24,
    color: colors.primary,
    includeFontPadding: false,
  },
  popularRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  popularChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
  },
  popularChipActive: {
    backgroundColor: colors.primary,
  },
  popularCode: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primaryInk,
    includeFontPadding: false,
  },
  popularCodeActive: { color: colors.white },
  sheet: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: 18,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
    includeFontPadding: false,
  },
  sheetClose: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.primary,
    includeFontPadding: false,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 8,
    ...shadow.soft,
  },
  searchIcon: {
    fontSize: 18,
    color: colors.faint,
    lineHeight: 22,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontFamily: fonts.medium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
    includeFontPadding: false,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
    includeFontPadding: false,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    includeFontPadding: false,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  rowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  rowCode: {
    minWidth: 48,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rowCodeActive: { backgroundColor: colors.white },
  rowCodeText: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.inkSoft,
    includeFontPadding: false,
  },
  rowCodeTextActive: { color: colors.primary },
  rowBody: { flex: 1, minWidth: 0 },
  rowCity: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    includeFontPadding: false,
  },
  rowMeta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    marginTop: 1,
    includeFontPadding: false,
  },
  check: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 20,
    color: colors.primary,
    includeFontPadding: false,
  },
})
