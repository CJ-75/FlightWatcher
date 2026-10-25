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
  airportChipLabelFr,
  airportDisplayNameFr,
  airportSelectionLabel,
  encodeAirportCodes,
  findCityGroupByCodes,
  groupAirportsByCity,
  parseAirportCodes,
  resolvePopularCityGroups,
  type CityAirportGroup,
} from '@flightwatcher/shared'
import { colors, fonts, shadow } from '../theme'
import { CountryFlag } from './CountryFlag'

type Props = {
  airports: Airport[]
  /** Encoded selection: "BVA" or "CDG,ORY,BVA". */
  value: string
  onChange: (encoded: string) => void
}

const PLACEHOLDER_CITIES = [
  { city: 'Paris', country: 'France' },
  { city: 'Lyon', country: 'France' },
  { city: 'Marseille', country: 'France' },
] as const

export function CityAirportPicker({ airports, value, onChange }: Props) {
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  const groups = useMemo(() => groupAirportsByCity(airports), [airports])
  const selectedCodes = useMemo(() => parseAirportCodes(value), [value])
  const selectedGroup = useMemo(
    () => findCityGroupByCodes(groups, selectedCodes),
    [groups, selectedCodes],
  )
  const label = useMemo(
    () => airportSelectionLabel(value, groups),
    [value, groups],
  )

  const showPlaceholder = !selectedGroup && !label

  useEffect(() => {
    if (!showPlaceholder) return
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_CITIES.length)
    }, 2200)
    return () => clearInterval(id)
  }, [showPlaceholder])

  // Empty query = popular hubs only (instant). Typing = full catalog filter.
  const popularGroups = useMemo(
    () => resolvePopularCityGroups(groups, airports),
    [groups, airports],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return popularGroups
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
  }, [groups, popularGroups, query])

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
      if (set.size <= 1) return
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

  const placeholder = PLACEHOLDER_CITIES[placeholderIndex]

  const allSelected =
    !!selectedGroup &&
    selectedCodes.length === selectedGroup.airports.length &&
    selectedCodes.length > 0

  const triggerSub = (() => {
    if (!selectedCodes.length) return 'Choisis une ville'
    if (!selectedGroup) return airportSelectionLabel(value, groups) || 'Départ'
    if (allSelected && selectedCodes.length > 1) return 'Tous les aéroports'
    if (selectedCodes.length === 1) {
      return airportChipLabelFr(selectedCodes[0], selectedGroup.city)
    }
    return `${selectedCodes.length} aéroports sélectionnés`
  })()

  const renderCity = (group: CityAirportGroup) => {
    const active = selectedGroup?.key === group.key
    const n = group.airports.length
    return (
      <Pressable
        onPress={() => selectCity(group)}
        style={({ pressed }) => [
          styles.row,
          active && styles.rowActive,
          pressed && { opacity: 0.9 },
        ]}
      >
        <CountryFlag country={group.country} size={{ width: 22, height: 15 }} />
        <View style={styles.rowBody}>
          <Text style={styles.rowCity} numberOfLines={1}>
            {group.city}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {n > 1 ? `${n} aéroports` : '1 aéroport'}
            {group.country ? ` · ${group.country}` : ''}
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
        {selectedGroup ? (
          <CountryFlag
            country={selectedGroup.country}
            size={{ width: 28, height: 20 }}
            style={styles.triggerFlag}
          />
        ) : showPlaceholder ? (
          <CountryFlag
            country={placeholder.country}
            size={{ width: 28, height: 20 }}
            style={styles.triggerFlag}
          />
        ) : (
          <View style={styles.codeBadge}>
            <Text style={styles.codeText}>—</Text>
          </View>
        )}
        <View style={styles.triggerBody}>
          {showPlaceholder ? (
            <>
              <Text style={styles.triggerPlaceholder} numberOfLines={1}>
                {placeholder.city}
              </Text>
              <Text style={styles.triggerSub} numberOfLines={1}>
                Choisis une ville
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.triggerTitle} numberOfLines={1}>
                {selectedGroup?.city || label}
              </Text>
              <Text style={styles.triggerSub} numberOfLines={1}>
                {triggerSub}
              </Text>
            </>
          )}
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      {selectedGroup && selectedGroup.airports.length > 1 ? (
        <View style={styles.subBlock}>
          <View style={styles.subHeader}>
            <View style={styles.subTitleRow}>
              <CountryFlag
                country={selectedGroup.country}
                size={{ width: 14, height: 10 }}
              />
              <Text style={styles.subTitle}>Aéroports de {selectedGroup.city}</Text>
            </View>
            <Pressable onPress={selectAllInGroup} hitSlop={8}>
              <Text style={styles.subAll}>Tous</Text>
            </Pressable>
          </View>
          <View style={styles.subRow}>
            {selectedGroup.airports.map((a) => {
              const on = selectedCodes.includes(a.code)
              const chip = airportChipLabelFr(a.code, selectedGroup.city)
              return (
                <Pressable
                  key={a.code}
                  onPress={() => toggleAirport(a.code)}
                  style={({ pressed }) => [
                    styles.subChip,
                    on && styles.subChipOn,
                    pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 },
                  ]}
                >
                  <View style={[styles.tick, on && styles.tickOn]}>
                    {on ? <Text style={styles.tickMark}>✓</Text> : null}
                  </View>
                  <Text style={[styles.subChipText, on && styles.subChipTextOn]}>
                    {chip}
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
            {query.trim()
              ? 'Résultats de recherche'
              : 'Villes fréquentes — tape pour chercher partout'}
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher une ville…"
            placeholderTextColor={colors.faint}
            autoCorrect={false}
            autoCapitalize="words"
            autoFocus
            style={styles.search}
          />
          {exactAirport ? (
            <Pressable
              onPress={() => selectSingleAirport(exactAirport.code)}
              style={[styles.row, styles.exactRow]}
            >
              <View style={styles.exactBadge}>
                <Text style={styles.exactBadgeText} numberOfLines={1}>
                  1
                </Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowCity} numberOfLines={1}>
                  Uniquement {airportChipLabelFr(exactAirport.code, exactAirport.city)}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {airportDisplayNameFr(exactAirport.code, exactAirport.name)}
                  {exactAirport.city ? ` · ${exactAirport.city}` : ''}
                </Text>
              </View>
            </Pressable>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(g) => g.key}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={16}
            maxToRenderPerBatch={16}
            windowSize={7}
            renderItem={({ item }) => renderCity(item)}
            ListEmptyComponent={
              exactAirport ? null : (
                <Text style={styles.empty}>
                  {query.trim()
                    ? 'Aucune ville trouvée'
                    : airports.length
                      ? 'Aucune ville populaire'
                      : 'Chargement…'}
                </Text>
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
  triggerFlag: {
    borderRadius: 4,
  },
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
  triggerPlaceholder: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.faint,
  },
  triggerSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.faint, fontFamily: fonts.bold },
  subBlock: { marginTop: 8, marginBottom: 0 },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  subTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subTitle: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  subAll: { fontFamily: fonts.bold, fontSize: 12, color: colors.primary },
  subRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
  },
  subChipOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  tick: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  tickMark: {
    fontFamily: fonts.bold,
    fontSize: 9,
    color: colors.white,
    lineHeight: 11,
  },
  subChipText: { fontFamily: fonts.bold, fontSize: 13, color: colors.inkSoft },
  subChipTextOn: { color: colors.primary },
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
