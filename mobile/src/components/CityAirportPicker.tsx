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
import {
  airportSelectionLabel,
  encodeAirportCodes,
  findCityGroupByCodes,
  groupAirportsByCity,
  parseAirportCodes,
  resolvePopularAirports,
  type CityAirportGroup,
} from '@flightwatcher/shared'
import { colors, fonts, shadow } from '../theme'

type Props = {
  airports: Airport[]
  /** Encoded selection: "BVA" or "CDG,ORY,BVA". */
  value: string
  onChange: (encoded: string) => void
}

export function CityAirportPicker({ airports, value, onChange }: Props) {
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const groups = useMemo(() => groupAirportsByCity(airports), [airports])
  const selectedCodes = useMemo(() => parseAirportCodes(value), [value])
  const selectedGroup = useMemo(
    () => findCityGroupByCodes(groups, selectedCodes),
    [groups, selectedCodes],
  )
  const label = useMemo(
    () => airportSelectionLabel(value, groups) || 'Choisir une ville',
    [value, groups],
  )

  const popular = useMemo(() => {
    const out: CityAirportGroup[] = []
    const seen = new Set<string>()
    for (const a of resolvePopularAirports(airports)) {
      const g = findCityGroupByCodes(groups, [a.code])
      if (g && !seen.has(g.key)) {
        out.push(g)
        seen.add(g.key)
      }
      if (out.length >= 8) break
    }
    return out
  }, [airports, groups])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter(
      (g) =>
        g.city.toLowerCase().includes(q) ||
        g.country.toLowerCase().includes(q) ||
        g.airports.some(
          (a) =>
            a.code.toLowerCase().includes(q) ||
            a.name.toLowerCase().includes(q),
        ),
    )
  }, [groups, query])

  const exactAirport = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(q)) return null
    return airports.find((a) => a.code === q) ?? null
  }, [airports, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      Keyboard.dismiss()
    }
  }, [open])

  const selectCity = (group: CityAirportGroup) => {
    const encoded = encodeAirportCodes(group.airports.map((a) => a.code))
    if (encoded) onChange(encoded)
    setOpen(false)
  }

  const selectSingleAirport = (code: string) => {
    onChange(code.toUpperCase())
    setOpen(false)
  }

  const toggleAirport = (code: string) => {
    const upper = code.toUpperCase()
    const set = new Set(selectedCodes)
    if (set.has(upper)) {
      if (set.size <= 1) return // keep at least one
      set.delete(upper)
    } else {
      set.add(upper)
    }
    const encoded = encodeAirportCodes([...set])
    if (encoded) onChange(encoded)
  }

  const selectAllInGroup = () => {
    if (!selectedGroup) return
    const encoded = encodeAirportCodes(selectedGroup.airports.map((a) => a.code))
    if (encoded) onChange(encoded)
  }

  const renderCity = (group: CityAirportGroup) => {
    const codes = group.airports.map((a) => a.code)
    const active =
      selectedGroup?.key === group.key &&
      selectedCodes.length > 0 &&
      selectedCodes.every((c) => codes.includes(c))
    return (
      <Pressable
        onPress={() => selectCity(group)}
        style={[styles.row, active && styles.rowActive]}
      >
        <View style={styles.rowBody}>
          <Text style={styles.rowCity} numberOfLines={1}>
            {group.city}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {group.airports.length} aéroport{group.airports.length > 1 ? 's' : ''} ·{' '}
            {codes.join(' · ')}
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
          <Text style={styles.codeText}>
            {selectedCodes.length <= 1 ? selectedCodes[0] || '—' : `${selectedCodes.length}`}
          </Text>
        </View>
        <View style={styles.triggerBody}>
          <Text style={styles.triggerTitle} numberOfLines={1}>
            {selectedGroup?.city || label}
          </Text>
          <Text style={styles.triggerSub} numberOfLines={1}>
            {selectedCodes.length
              ? selectedCodes.join(' · ')
              : 'Ville ou code IATA'}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      {popular.length > 0 ? (
        <View style={styles.popularRow}>
          {popular.slice(0, 8).map((g) => {
            const active = selectedGroup?.key === g.key
            return (
              <Pressable
                key={g.key}
                onPress={() => selectCity(g)}
                style={[styles.popularChip, active && styles.popularChipActive]}
              >
                <Text
                  style={[styles.popularCode, active && styles.popularCodeActive]}
                  numberOfLines={1}
                >
                  {g.city}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {selectedGroup && selectedGroup.airports.length > 1 ? (
        <View style={styles.subBlock}>
          <View style={styles.subHeader}>
            <Text style={styles.subTitle}>Aéroports de {selectedGroup.city}</Text>
            <Pressable onPress={selectAllInGroup} hitSlop={8}>
              <Text style={styles.subAll}>Tous</Text>
            </Pressable>
          </View>
          <View style={styles.subRow}>
            {selectedGroup.airports.map((a) => {
              const on = selectedCodes.includes(a.code)
              return (
                <Pressable
                  key={a.code}
                  onPress={() => toggleAirport(a.code)}
                  style={[styles.subChip, on && styles.subChipOn]}
                >
                  <Text style={[styles.subChipText, on && styles.subChipTextOn]}>
                    {a.code}
                  </Text>
                  <Text
                    style={[styles.subChipName, on && styles.subChipNameOn]}
                    numberOfLines={1}
                  >
                    {a.name.replace(new RegExp(`^${a.city}\\s*[-–]?\\s*`, 'i'), '') || a.city}
                  </Text>
                </Pressable>
              )
            })}
          </View>
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
            <Text style={styles.sheetTitle}>Ville de départ</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Text style={styles.sheetClose}>Fermer</Text>
            </Pressable>
          </View>
          <Text style={styles.sheetHint}>
            Choisir une ville sélectionne tous ses aéroports (ex. Paris → CDG, ORY, BVA).
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher une ville ou un code…"
            placeholderTextColor={colors.faint}
            autoCorrect={false}
            autoCapitalize="characters"
            style={styles.search}
          />
          {exactAirport ? (
            <Pressable
              onPress={() => selectSingleAirport(exactAirport.code)}
              style={[styles.row, styles.exactRow]}
            >
              <View style={styles.exactBadge}>
                <Text style={styles.exactBadgeText}>{exactAirport.code}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowCity} numberOfLines={1}>
                  Uniquement {exactAirport.code}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {exactAirport.name} · {exactAirport.city}
                </Text>
              </View>
            </Pressable>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(g) => g.key}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => renderCity(item)}
            ListEmptyComponent={
              exactAirport ? null : (
                <Text style={styles.empty}>Aucune ville trouvée</Text>
              )
            }
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
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
    ...shadow.soft,
  },
  triggerPressed: { opacity: 0.92 },
  codeBadge: {
    minWidth: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  codeText: { fontFamily: fonts.bold, fontSize: 14, color: colors.primary },
  triggerBody: { flex: 1, minWidth: 0 },
  triggerTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  triggerSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.faint, fontFamily: fonts.bold },
  popularRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  popularChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  popularChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  popularCode: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryInk },
  popularCodeActive: { color: colors.white },
  subBlock: { marginTop: 12 },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  subTitle: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  subAll: { fontFamily: fonts.bold, fontSize: 12, color: colors.primary },
  subRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subChip: {
    maxWidth: '48%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
  },
  subChipOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  subChipText: { fontFamily: fonts.bold, fontSize: 13, color: colors.inkSoft },
  subChipTextOn: { color: colors.primary },
  subChipName: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
  },
  subChipNameOn: { color: colors.primaryInk },
  sheet: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 16 },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sheetTitle: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  sheetClose: { fontFamily: fonts.bold, fontSize: 15, color: colors.primary },
  sheetHint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
    lineHeight: 18,
  },
  search: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 10,
  },
  rowActive: { backgroundColor: colors.primarySoft },
  exactRow: {
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderBottomWidth: 0,
  },
  exactBadge: {
    minWidth: 48,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  exactBadgeText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  rowBody: { flex: 1, minWidth: 0 },
  rowCity: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  rowMeta: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 2 },
  check: { fontFamily: fonts.bold, fontSize: 16, color: colors.primary },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontFamily: fonts.medium,
    color: colors.muted,
  },
})
