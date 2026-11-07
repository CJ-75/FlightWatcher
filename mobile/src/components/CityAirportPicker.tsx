import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Airport } from '@flightwatcher/shared'
import {
  airportDisplayNameFr,
  airportSelectionLabel,
  countryIsoFromIata,
  countryToFlagIso,
  encodeAirportCodes,
  findCityGroupByCodes,
  groupAirportsByCity,
  parseAirportCodes,
  resolvePopularCityGroups,
  seedPopularAirports,
  type CityAirportGroup,
} from '@flightwatcher/shared'
import {
  getCachedAirports,
  hasFullAirportsCatalog,
  subscribeAirports,
} from '../lib/airportsCache'
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

const SEED = seedPopularAirports()
const MIN_FULL = 80

export function CityAirportPicker({ airports, value, onChange }: Props) {
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [catalog, setCatalog] = useState<Airport[]>(() =>
    airports.length >= MIN_FULL ? airports : SEED,
  )
  const [loadingFull, setLoadingFull] = useState(() => !hasFullAirportsCatalog())
  const lockedRef = useRef(false)
  const enterAnim = useRef(new Animated.Value(0)).current

  // Prefer parent list when full; otherwise keep local catalog (API / disk).
  useEffect(() => {
    if (airports.length >= MIN_FULL) setCatalog(airports)
  }, [airports])

  useEffect(() => subscribeAirports((list) => {
    setCatalog(list)
    setLoadingFull(list.length < MIN_FULL)
  }), [])

  useEffect(() => {
    if (hasFullAirportsCatalog()) {
      setLoadingFull(false)
      return
    }
    void getCachedAirports({ force: true }).then((list) => {
      setCatalog(list)
      setLoadingFull(list.length < MIN_FULL)
    })
  }, [])

  const effectiveAirports = catalog.length > 0 ? catalog : SEED
  const isFull = effectiveAirports.length >= MIN_FULL
  const groups = useMemo(
    () => groupAirportsByCity(effectiveAirports),
    [effectiveAirports],
  )
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

  // Full catalog: popular hubs first, then every other city A→Z (same source as web).
  const allGroupsOrdered = useMemo(() => {
    const popular = resolvePopularCityGroups(groups, effectiveAirports)
    const seen = new Set(popular.map((g) => g.key))
    const rest = groups
      .filter((g) => !seen.has(g.key))
      .slice()
      .sort((a, b) => a.city.localeCompare(b.city, 'fr'))
    return popular.length ? [...popular, ...rest] : rest
  }, [groups, effectiveAirports])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allGroupsOrdered
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
  }, [groups, allGroupsOrdered, query])

  const exactAirport = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(q)) return null
    return effectiveAirports.find((a) => a.code === q) ?? null
  }, [effectiveAirports, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      enterAnim.setValue(0)
      return
    }
    Animated.spring(enterAnim, {
      toValue: 1,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start()
  }, [open, enterAnim])

  const selectCity = useCallback(
    (group: CityAirportGroup) => {
      if (lockedRef.current) return
      const encoded = encodeAirportCodes(group.airports.map((a) => a.code))
      if (!encoded) return
      lockedRef.current = true
      setOpen(false)
      onChange(encoded)
      setTimeout(() => {
        lockedRef.current = false
      }, 250)
    },
    [onChange],
  )

  const selectSingleAirport = useCallback(
    (code: string) => {
      if (lockedRef.current) return
      lockedRef.current = true
      setOpen(false)
      onChange(code.toUpperCase())
      setTimeout(() => {
        lockedRef.current = false
      }, 250)
    },
    [onChange],
  )

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
    return selectedCodes.join(' · ')
  })()

  const renderCity = useCallback(
    ({ item: group }: { item: CityAirportGroup }) => {
      const active = selectedGroup?.key === group.key
      const n = group.airports.length
      return (
        <TouchableOpacity
          onPress={() => selectCity(group)}
          activeOpacity={0.65}
          delayPressIn={0}
          style={[styles.row, active && styles.rowActive]}
        >
        <CountryFlag
          country={group.country}
          iso={
            countryIsoFromIata(group.airports[0]?.code) ||
            countryToFlagIso(group.country) ||
            undefined
          }
          size={{ width: 22, height: 15 }}
        />
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
      </TouchableOpacity>
      )
    },
    [selectCity, selectedGroup?.key],
  )

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        delayPressIn={0}
        style={styles.trigger}
      >
        {selectedGroup ? (
          <CountryFlag
            country={selectedGroup.country}
            iso={
              countryIsoFromIata(selectedGroup.airports[0]?.code) ||
              countryToFlagIso(selectedGroup.country) ||
              undefined
            }
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
      </TouchableOpacity>

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
                    {a.code}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : null}

      <Modal
        visible={open}
        animationType="fade"
        transparent={false}
        presentationStyle={
          Platform.OS === 'ios' ? 'overFullScreen' : 'fullScreen'
        }
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: insets.bottom + 8,
              opacity: enterAnim,
              transform: [
                {
                  translateY: enterAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Ville de départ</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <Text style={styles.sheetClose}>Fermer</Text>
            </Pressable>
          </View>
          {query.trim() || !isFull ? (
            <Text style={styles.sheetHint}>
              {query.trim()
                ? 'Résultats de recherche'
                : loadingFull
                  ? 'Chargement du catalogue…'
                  : 'Catalogue incomplet. Réessaie.'}
            </Text>
          ) : null}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher une ville…"
            placeholderTextColor={colors.faint}
            autoCorrect={false}
            autoCapitalize="words"
            style={styles.search}
          />
          {loadingFull && !isFull ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Chargement des villes…</Text>
            </View>
          ) : null}
          {!loadingFull && !isFull ? (
            <Pressable
              onPress={() => {
                setLoadingFull(true)
                void getCachedAirports({ force: true }).then((list) => {
                  setCatalog(list)
                  setLoadingFull(list.length < MIN_FULL)
                })
              }}
              style={styles.retryBtn}
            >
              <Text style={styles.retryText}>Recharger le catalogue</Text>
            </Pressable>
          ) : null}
          {exactAirport ? (
            <TouchableOpacity
              onPress={() => selectSingleAirport(exactAirport.code)}
              activeOpacity={0.65}
              delayPressIn={0}
              style={[styles.row, styles.exactRow]}
            >
              <View style={styles.exactBadge}>
                <Text style={styles.exactBadgeText} numberOfLines={1}>
                  1
                </Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowCity} numberOfLines={1}>
                  Uniquement {exactAirport.code}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {airportDisplayNameFr(exactAirport.code, exactAirport.name)}
                  {exactAirport.city ? ` · ${exactAirport.city}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}
          <View style={styles.listWrap}>
            <FlatList
              style={styles.list}
              data={filtered}
              keyExtractor={(g) => g.key}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
              bounces
              alwaysBounceVertical
              showsVerticalScrollIndicator
              removeClippedSubviews={false}
              initialNumToRender={24}
              maxToRenderPerBatch={32}
              windowSize={11}
              renderItem={renderCity}
              getItemLayout={(_data, index) => ({
                length: 57,
                offset: 57 * index,
                index,
              })}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                exactAirport ? null : (
                  <Text style={styles.empty}>
                    {query.trim()
                      ? 'Aucune ville trouvée'
                      : 'Aucune ville disponible'}
                  </Text>
                )
              }
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,249,245,0)', 'rgba(255,249,245,0.92)']}
              style={styles.listFade}
            />
          </View>
        </Animated.View>
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
  listWrap: { flex: 1, position: 'relative', minHeight: 0 },
  list: { flex: 1 },
  listContent: { paddingBottom: 28 },
  listFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 36,
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
    height: 57,
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  loadingText: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    marginBottom: 8,
  },
  retryText: { fontFamily: fonts.bold, fontSize: 13, color: colors.primary },
})
