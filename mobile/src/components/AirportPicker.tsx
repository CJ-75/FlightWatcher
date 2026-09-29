import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  FlatList,
  Keyboard,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Airport } from '@flightwatcher/shared'
import { colors, fonts, shadow } from '../theme'

const POPULAR = ['BVA', 'ORY', 'CDG', 'LYS', 'MRS', 'NCE'] as const

type Props = {
  airports: Airport[]
  value: string
  onChange: (code: string) => void
}

function matchAirports(list: Airport[], query: string): Airport[] {
  const safe = Array.isArray(list) ? list : []
  const q = query.trim().toLowerCase()
  if (!q) return safe.slice(0, 40)
  return safe
    .filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) ||
        a.country.toLowerCase().includes(q),
    )
    .slice(0, 40)
}

export function AirportPicker({ airports, value, onChange }: Props) {
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

  const results = useMemo(() => matchAirports(airports, query), [airports, query])

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
          <Text style={styles.triggerSub} numberOfLines={1}>
            {selected
              ? `${selected.name} · ${selected.country}`
              : 'Rechercher par ville ou code IATA'}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      {popularAirports.length > 0 ? (
        <View style={styles.popularRow}>
          {popularAirports.map((a) => {
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

          <FlatList
            data={results}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
            ListEmptyComponent={
              <Text style={styles.empty}>Aucun aéroport trouvé</Text>
            }
            renderItem={({ item }) => {
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
            }}
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
    backgroundColor: colors.canvas,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
  },
  triggerPressed: {
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primarySoft,
  },
  codeBadge: {
    minWidth: 48,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  codeText: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.primary,
    letterSpacing: 0.5,
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
    color: colors.faint,
    includeFontPadding: false,
  },
  popularRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  popularChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
  },
  popularChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  popularCode: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    includeFontPadding: false,
  },
  popularCodeActive: { color: colors.primaryInk },
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
    marginBottom: 12,
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
