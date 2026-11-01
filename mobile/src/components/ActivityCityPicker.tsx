/** City picker Activités — même listing / UI drapeaux que CityAirportPicker, sans aéroports. */
import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
  Keyboard,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Airport } from '@flightwatcher/shared'
import {
  ACTIVITY_CITY_OPTIONS_FR,
  activityCitySlugFromLabel,
  groupAirportsByCity,
  resolvePopularCityGroups,
  seedPopularAirports,
  type CityAirportGroup,
} from '@flightwatcher/shared'
import {
  getCachedAirports,
  hasFullAirportsCatalog,
  peekCachedAirports,
  subscribeAirports,
} from '../lib/airportsCache'
import { colors, fonts, radius } from '../theme'
import { CountryFlag } from './CountryFlag'

type CityOpt = { slug: string; label: string; country?: string }

type Props = {
  valueSlug: string
  valueLabel?: string
  onChange: (city: CityOpt) => void
}

const PLACEHOLDER_CITIES = [
  { city: 'Paris', country: 'France' },
  { city: 'Lyon', country: 'France' },
  { city: 'Marseille', country: 'France' },
] as const

const SEED = seedPopularAirports()
const MIN_FULL = 80

function toOpt(g: CityAirportGroup): CityOpt {
  return {
    slug: activityCitySlugFromLabel(g.city),
    label: g.city,
    country: g.country || undefined,
  }
}

function seedFallbackCities(): CityOpt[] {
  const bySlug = new Map(
    groupAirportsByCity(SEED)
      .map(toOpt)
      .filter((c) => c.slug)
      .map((c) => [c.slug, c] as const),
  )
  return ACTIVITY_CITY_OPTIONS_FR.map((c) => {
    const hit = bySlug.get(c.slug)
    return hit || { slug: c.slug, label: c.label }
  })
}

export function ActivityCityPicker({ valueSlug, valueLabel, onChange }: Props) {
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [catalog, setCatalog] = useState<Airport[]>(() => {
    const peeked = peekCachedAirports()
    return peeked.length >= MIN_FULL ? peeked : SEED
  })
  const [loadingFull, setLoadingFull] = useState(() => !hasFullAirportsCatalog())

  useEffect(() => subscribeAirports((list) => {
    setCatalog(list)
    setLoadingFull(list.length < MIN_FULL)
  }), [])

  useEffect(() => {
    if (!open) {
      setQuery('')
      Keyboard.dismiss()
      return
    }
    if (hasFullAirportsCatalog()) {
      setLoadingFull(false)
      return
    }
    setLoadingFull(true)
    void getCachedAirports({ force: true }).then((list) => {
      setCatalog(list)
      setLoadingFull(list.length < MIN_FULL)
    })
  }, [open])

  const effective = catalog.length > 0 ? catalog : SEED
  const isFull = effective.length >= MIN_FULL
  const groups = useMemo(() => groupAirportsByCity(effective), [effective])
  const catalogReady = groups.length >= 20

  const allCities = useMemo(() => {
    if (!catalogReady) return seedFallbackCities()
    return groups
      .map(toOpt)
      .filter((c) => c.slug)
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [groups, catalogReady])

  const allOrdered = useMemo(() => {
    if (!catalogReady) return seedFallbackCities()
    const popular = resolvePopularCityGroups(groups, effective)
      .map(toOpt)
      .filter((c) => c.slug)
    const seen = new Set(popular.map((c) => c.slug))
    const rest = allCities.filter((c) => !seen.has(c.slug))
    return popular.length ? [...popular, ...rest] : rest
  }, [groups, effective, allCities, catalogReady])

  const selected =
    allCities.find((c) => c.slug === valueSlug) ||
    groups
      .map(toOpt)
      .find((c) => c.slug === valueSlug) ||
    (valueSlug ? { slug: valueSlug, label: valueLabel || valueSlug } : null)

  const showPlaceholder = !selected

  useEffect(() => {
    if (!showPlaceholder) return
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_CITIES.length)
    }, 2200)
    return () => clearInterval(id)
  }, [showPlaceholder])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allOrdered
    return allCities.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.slug.includes(q.replace(/\s+/g, '-')) ||
        (c.country || '').toLowerCase().includes(q),
    )
  }, [query, allCities, allOrdered])

  const placeholder = PLACEHOLDER_CITIES[placeholderIndex]

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.92 }]}
      >
        {selected?.country ? (
          <CountryFlag
            country={selected.country}
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
          <View style={styles.flagFallback} />
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
                {selected?.label}
              </Text>
              <Text style={styles.triggerSub} numberOfLines={1}>
                {selected?.country || 'Destination'}
              </Text>
            </>
          )}
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.sheet, { paddingTop: 12, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Ville</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Text style={styles.sheetClose}>Fermer</Text>
            </Pressable>
          </View>
          <Text style={styles.sheetHint}>
            {query.trim()
              ? 'Résultats de recherche'
              : isFull
                ? `${groups.length} villes`
                : loadingFull
                  ? 'Chargement du catalogue…'
                  : 'Catalogue incomplet — réessaie'}
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
          <FlatList
            data={filtered}
            keyExtractor={(item) => `${item.slug}-${item.country || ''}`}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 16 }}
            renderItem={({ item }) => {
              const on = item.slug === valueSlug
              return (
                <Pressable
                  onPress={() => {
                    onChange(item)
                    setQuery('')
                    setOpen(false)
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    on && styles.rowActive,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <CountryFlag
                    country={item.country}
                    size={{ width: 22, height: 15 }}
                  />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowCity} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.country ? (
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {item.country}
                      </Text>
                    ) : null}
                  </View>
                  {on ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              )
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>Aucune ville trouvée.</Text>
            }
          />
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 52,
    gap: 10,
  },
  triggerFlag: { borderRadius: 2 },
  flagFallback: {
    width: 28,
    height: 20,
    borderRadius: 2,
    backgroundColor: colors.line,
  },
  triggerBody: { flex: 1, minWidth: 0 },
  triggerTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  triggerPlaceholder: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.faint,
  },
  triggerSub: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  chevron: {
    fontSize: 18,
    color: colors.muted,
    fontFamily: fonts.medium,
  },
  sheet: { flex: 1, backgroundColor: colors.canvas },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  sheetClose: { fontFamily: fonts.semibold, fontSize: 15, color: colors.primary },
  sheetHint: {
    paddingHorizontal: 16,
    marginBottom: 8,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  search: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  loadingText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  retryBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  retryText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    marginBottom: 4,
    backgroundColor: colors.white,
  },
  rowActive: { backgroundColor: colors.primarySoft },
  rowBody: { flex: 1, minWidth: 0 },
  rowCity: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  rowMeta: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  check: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.primary,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
    fontFamily: fonts.medium,
    color: colors.muted,
  },
})
