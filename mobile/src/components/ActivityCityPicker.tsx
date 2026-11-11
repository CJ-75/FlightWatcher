/** Ville Activités — même UI / sheet que CityAirportPicker (Séjours), sans aéroports. */
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
  ACTIVITY_CITY_OPTIONS_FR,
  activityCitySlugFromLabel,
  countryIsoFromIata,
  countryToFlagIso,
  groupAirportsByCity,
  PARCOURS_CITY_OPTIONS_FR,
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
import { colors, fonts, shadow } from '../theme'
import { CountryFlag } from './CountryFlag'

type CityOpt = { slug: string; label: string; country?: string; iso?: string }

type Props = {
  valueSlug: string
  valueLabel?: string
  onChange: (city: CityOpt) => void
  /**
   * Parcours only — injecte le top 30 FR (hors catalogue aéroports).
   * Ne pas activer pour Activités / Vols.
   */
  includeParcoursFrCities?: boolean
}

const PLACEHOLDER_CITIES = [
  { city: 'Paris', country: 'France' },
  { city: 'Lyon', country: 'France' },
  { city: 'Marseille', country: 'France' },
] as const

/** Curated hubs — same flag/country chrome as a picked city (ex. Lisbonne). */
const CURATED_CITY_META: Record<string, { country: string; iso: string }> = {
  paris: { country: 'France', iso: 'FR' },
  lyon: { country: 'France', iso: 'FR' },
  marseille: { country: 'France', iso: 'FR' },
  nice: { country: 'France', iso: 'FR' },
  bordeaux: { country: 'France', iso: 'FR' },
  toulouse: { country: 'France', iso: 'FR' },
  nantes: { country: 'France', iso: 'FR' },
  montpellier: { country: 'France', iso: 'FR' },
  strasbourg: { country: 'France', iso: 'FR' },
  lille: { country: 'France', iso: 'FR' },
  rennes: { country: 'France', iso: 'FR' },
  toulon: { country: 'France', iso: 'FR' },
  ajaccio: { country: 'France', iso: 'FR' },
  bastia: { country: 'France', iso: 'FR' },
  lisbonne: { country: 'Portugal', iso: 'PT' },
  porto: { country: 'Portugal', iso: 'PT' },
  barcelone: { country: 'Espagne', iso: 'ES' },
  madrid: { country: 'Espagne', iso: 'ES' },
  rome: { country: 'Italie', iso: 'IT' },
  milan: { country: 'Italie', iso: 'IT' },
  venise: { country: 'Italie', iso: 'IT' },
  florence: { country: 'Italie', iso: 'IT' },
  amsterdam: { country: 'Pays-Bas', iso: 'NL' },
  berlin: { country: 'Allemagne', iso: 'DE' },
  bruxelles: { country: 'Belgique', iso: 'BE' },
  athenes: { country: 'Grèce', iso: 'GR' },
  cracovie: { country: 'Pologne', iso: 'PL' },
  stockholm: { country: 'Suède', iso: 'SE' },
  copenhague: { country: 'Danemark', iso: 'DK' },
  londres: { country: 'Royaume-Uni', iso: 'GB' },
}

const SEED = seedPopularAirports()
const MIN_FULL = 80

function withCuratedMeta(opt: CityOpt): CityOpt {
  const meta = CURATED_CITY_META[opt.slug]
  if (!meta) return opt
  return {
    ...opt,
    country: opt.country || meta.country,
    iso: opt.iso || meta.iso,
  }
}

function isFranceCity(c: CityOpt): boolean {
  if (c.iso === 'FR') return true
  return (c.country || '').trim().toLowerCase() === 'france'
}

/** France d’abord, puis A→Z. */
function compareCityFrFirst(a: CityOpt, b: CityOpt): number {
  const af = isFranceCity(a) ? 0 : 1
  const bf = isFranceCity(b) ? 0 : 1
  if (af !== bf) return af - bf
  return a.label.localeCompare(b.label, 'fr')
}

function toOpt(g: CityAirportGroup): CityOpt {
  // Prefer IATA→ISO (stable) over country label (can be wrong after city merges).
  let iso: string | undefined
  for (const a of g.airports) {
    const fromIata = countryIsoFromIata(a.code)
    if (fromIata) {
      iso = fromIata
      break
    }
  }
  if (!iso) iso = countryToFlagIso(g.country) || undefined
  return {
    slug: activityCitySlugFromLabel(g.city),
    label: g.city,
    country: g.country || undefined,
    iso,
  }
}

/** Merge same slug: keep first country/iso (curated / first hub wins). */
function mergeCityOpt(prev: CityOpt | undefined, next: CityOpt): CityOpt {
  if (!prev) return next
  return {
    slug: next.slug || prev.slug,
    label: prev.label || next.label,
    country: prev.country || next.country,
    iso: prev.iso || next.iso,
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
    return withCuratedMeta(hit || { slug: c.slug, label: c.label })
  })
}

export function ActivityCityPicker({
  valueSlug,
  valueLabel,
  onChange,
  includeParcoursFrCities = false,
}: Props) {
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [catalog, setCatalog] = useState<Airport[]>(() => {
    const peeked = peekCachedAirports()
    return peeked.length >= MIN_FULL ? peeked : SEED
  })
  const [loadingFull, setLoadingFull] = useState(() => !hasFullAirportsCatalog())
  const lockedRef = useRef(false)
  const enterAnim = useRef(new Animated.Value(0)).current

  useEffect(
    () =>
      subscribeAirports((list) => {
        setCatalog(list)
        setLoadingFull(list.length < MIN_FULL)
      }),
    [],
  )

  // Prefetch catalogue dès le mount — pas au premier open.
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

  const effective = catalog.length > 0 ? catalog : SEED
  const isFull = effective.length >= MIN_FULL
  const groups = useMemo(() => groupAirportsByCity(effective), [effective])
  const catalogReady = groups.length >= 20

  const allCities = useMemo(() => {
    const bySlug = new Map<string, CityOpt>()
    if (includeParcoursFrCities) {
      for (const c of PARCOURS_CITY_OPTIONS_FR) {
        if (!c.slug) continue
        bySlug.set(c.slug, {
          slug: c.slug,
          label: c.label,
          country: c.country,
          iso: c.iso,
        })
      }
    }
    for (const c of seedFallbackCities()) {
      if (c.slug) bySlug.set(c.slug, mergeCityOpt(bySlug.get(c.slug), c))
    }
    if (catalogReady) {
      // Prefer EU/seed hubs: sort so groups with known IATA ISO come before orphans,
      // but never let a later CA "London" overwrite curated Londres (GB).
      for (const g of groups) {
        const opt = toOpt(g)
        if (!opt.slug) continue
        bySlug.set(opt.slug, mergeCityOpt(bySlug.get(opt.slug), opt))
      }
    }
    return [...bySlug.values()].sort(compareCityFrFirst)
  }, [groups, catalogReady, includeParcoursFrCities])

  // Parcours: top 30 FR d’abord. Sinon curated → FR → popular → reste.
  const allOrdered = useMemo(() => {
    const seen = new Set<string>()
    const merged: CityOpt[] = []

    if (includeParcoursFrCities) {
      for (const c of PARCOURS_CITY_OPTIONS_FR) {
        if (!c.slug || seen.has(c.slug)) continue
        seen.add(c.slug)
        const hit = allCities.find((x) => x.slug === c.slug)
        merged.push(
          withCuratedMeta({
            slug: c.slug,
            label: c.label,
            country: hit?.country || c.country,
            iso: hit?.iso || c.iso,
          }),
        )
      }
    }

    const curated = seedFallbackCities().map(withCuratedMeta)
    for (const c of curated) {
      if (!c.slug || seen.has(c.slug)) continue
      seen.add(c.slug)
      const hit = allCities.find((x) => x.slug === c.slug)
      merged.push(
        hit
          ? {
              ...c,
              country: c.country || hit.country,
              iso: c.iso || hit.iso,
            }
          : c,
      )
    }
    if (!catalogReady) return merged

    const frenchRest = allCities
      .filter((c) => c.slug && !seen.has(c.slug) && isFranceCity(c))
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    for (const c of frenchRest) {
      seen.add(c.slug)
      merged.push(c)
    }

    // Hors mode Parcours : garder les hubs EU. En Parcours, rester FR-first
    // (le top 30 + FR catalogue suffisent ; le reste reste cherchable).
    if (!includeParcoursFrCities) {
      const popular = resolvePopularCityGroups(groups, effective)
        .map(toOpt)
        .map(withCuratedMeta)
        .filter((c) => c.slug && !seen.has(c.slug))
        .sort(compareCityFrFirst)
      for (const c of popular) {
        seen.add(c.slug)
        merged.push(c)
      }
    }
    const rest = allCities
      .filter((c) => !seen.has(c.slug))
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    return [...merged, ...rest]
  }, [
    groups,
    allCities,
    catalogReady,
    effective,
    includeParcoursFrCities,
  ])

  const selectedRaw =
    allCities.find((c) => c.slug === valueSlug) ||
    groups.map(toOpt).find((c) => c.slug === valueSlug) ||
    (valueSlug
      ? { slug: valueSlug, label: valueLabel || valueSlug }
      : null)
  const selected = selectedRaw ? withCuratedMeta(selectedRaw) : null

  // Default city (Paris…) must look selected — never the rotating placeholder.
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
    const qSlug = activityCitySlugFromLabel(query)
    return allCities
      .filter((c) => {
        const labelSlug = activityCitySlugFromLabel(c.label)
        const countrySlug = activityCitySlugFromLabel(c.country || '')
        return (
          c.label.toLowerCase().includes(q) ||
          (c.country || '').toLowerCase().includes(q) ||
          labelSlug.includes(qSlug) ||
          c.slug.includes(qSlug) ||
          countrySlug.includes(qSlug)
        )
      })
      .sort(compareCityFrFirst)
  }, [query, allCities, allOrdered])

  const selectCity = useCallback(
    (city: CityOpt) => {
      if (!city.slug || lockedRef.current) return
      lockedRef.current = true
      setOpen(false)
      onChange(city)
      setTimeout(() => {
        lockedRef.current = false
      }, 250)
    },
    [onChange],
  )

  const placeholder = PLACEHOLDER_CITIES[placeholderIndex]

  const renderCity = useCallback(
    ({ item }: { item: CityOpt }) => {
      const active = item.slug === valueSlug
      return (
        <TouchableOpacity
          onPress={() => selectCity(item)}
          activeOpacity={0.65}
          delayPressIn={0}
          style={[styles.row, active && styles.rowActive]}
        >
          <CountryFlag
            country={item.country}
            iso={item.iso}
            size={{ width: 22, height: 15 }}
          />
          <View style={styles.rowBody}>
            <Text style={styles.rowCity} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {item.country || 'Destination'}
            </Text>
          </View>
          {active ? <Text style={styles.check}>✓</Text> : null}
        </TouchableOpacity>
      )
    },
    [selectCity, valueSlug],
  )

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        delayPressIn={0}
        style={styles.trigger}
        accessibilityRole="button"
        accessibilityLabel="Choisir une ville"
      >
        {selected?.country || selected?.iso ? (
          <CountryFlag
            country={selected.country}
            iso={selected.iso}
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
                {selected?.label}
              </Text>
              <Text style={styles.triggerSub} numberOfLines={1}>
                {selected?.country || 'Destination'}
              </Text>
            </>
          )}
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

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
            <Text style={styles.sheetTitle}>Ville</Text>
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
          <View style={styles.listWrap}>
            <FlatList
              style={styles.list}
              data={filtered}
              keyExtractor={(item) => item.slug}
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
                <Text style={styles.empty}>
                  {query.trim()
                    ? 'Aucune ville trouvée'
                    : 'Aucune ville disponible'}
                </Text>
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
  triggerFlag: { borderRadius: 4 },
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
  triggerSub: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  chevron: { fontSize: 22, color: colors.faint, fontFamily: fonts.bold },
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
  rowBody: { flex: 1, minWidth: 0 },
  rowCity: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  rowMeta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
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
