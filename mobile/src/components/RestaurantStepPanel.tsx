import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native'
import {
  evaluateOpening,
  RESTAURANT_ADD_LABEL_FR,
  RESTAURANT_BUDGET_HINT_FR,
  RESTAURANT_EMPTY_BODY_FR,
  RESTAURANT_EMPTY_TITLE_FR,
  RESTAURANT_MAPS_LABEL_FR,
  RESTAURANT_SKIP_LABEL_FR,
  RESTAURANT_VALIDATE_LABEL_FR,
  tripItemStatusLabelFr,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type ItemRow = {
  id: string
  status?: string
  inherited?: boolean
  item_type?: string
  moment?: string | null
  availability_state?: string
  places?: {
    id?: string
    name?: string
    restaurant_details?: {
      opening_hours_raw?: string
      cuisine?: string
      website?: string
      phone?: string
    }
  } | null
}

export function RestaurantStepPanel(props: {
  draftToken?: string | null
  plannedTripId?: string | null
  citySlug?: string | null
  cityLabel?: string | null
  dateIso?: string | null
  enabled?: boolean
  hotelLat?: number | null
  hotelLng?: number | null
}) {
  const {
    draftToken,
    plannedTripId,
    enabled = true,
    citySlug,
    cityLabel,
    dateIso,
  } = props
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, unknown>[]>([])
  const [skipped, setSkipped] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!draftToken && !plannedTripId) return
    setLoading(true)
    try {
      const res = await getApi().listTripItems({
        draft_token: draftToken || undefined,
        planned_trip_id: plannedTripId || undefined,
      })
      const all = ((res.items || []) as ItemRow[]).filter(
        (i) => i.item_type === 'restaurant',
      )
      setItems(all)
      setSkipped(all.some((i) => i.status === 'skipped'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [draftToken, plannedTripId])

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  const city = cityLabel || citySlug || 'ta ville'
  const visible = items.filter((i) => i.status !== 'skipped')

  const mapsSearchUrl = useMemo(() => {
    const q = encodeURIComponent(`restaurants near ${city}`)
    if (props.hotelLat != null && props.hotelLng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${q}&center=${props.hotelLat},${props.hotelLng}`
    }
    return `https://www.google.com/maps/search/?api=1&query=${q}`
  }, [city, props.hotelLat, props.hotelLng])

  const runImport = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await getApi().importRestaurantLinks({
        text,
        draft_token: draftToken || undefined,
        planned_trip_id: plannedTripId || undefined,
        city_slug: citySlug || undefined,
      })
      setResults(res.results || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import impossible')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (row: Record<string, unknown>) => {
    const placeId = row.place_id as string | undefined
    if (!placeId) return
    try {
      await getApi().confirmRestaurantPlace({
        place_id: placeId,
        draft_token: draftToken || undefined,
        planned_trip_id: plannedTripId || undefined,
        item_type: 'restaurant',
        save_address: true,
        city_slug: citySlug,
      })
      setToast('Ajouté au voyage')
      setTimeout(() => setToast(null), 2200)
      setImportOpen(false)
      setText('')
      setResults([])
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ajout impossible')
    }
  }

  const skipRestaurants = async () => {
    setSkipped(true)
    try {
      await getApi().addTripItem({
        product_code: `skip-resto-${Date.now()}`,
        title: RESTAURANT_SKIP_LABEL_FR,
        draft_token: draftToken || undefined,
        planned_trip_id: plannedTripId || undefined,
        platform: 'mobile',
        surface: 'restaurants',
        meta: { skip_restaurants: true },
      })
    } catch {
      /* optional */
    }
  }

  if (!enabled) {
    return <Text style={styles.muted}>Adresses bientôt disponibles.</Text>
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.budget}>{RESTAURANT_BUDGET_HINT_FR}</Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {toast ? <Text style={styles.toast}>{toast}</Text> : null}

      {!loading && visible.length === 0 ? (
        <View style={[styles.empty, shadow.soft]}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyGlyph}>🍽</Text>
          </View>
          <Text style={styles.emptyTitle}>{RESTAURANT_EMPTY_TITLE_FR(String(city))}</Text>
          <Text style={styles.emptyBody}>{RESTAURANT_EMPTY_BODY_FR}</Text>
          <Pressable
            onPress={() => setImportOpen(true)}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}
          >
            <Text style={styles.primaryBtnText}>{RESTAURANT_ADD_LABEL_FR}</Text>
          </Pressable>
          <Pressable
            onPress={() => void Linking.openURL(mapsSearchUrl)}
            style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.ghostBtnText}>Restaurants autour de ton hôtel</Text>
          </Pressable>
          <Pressable onPress={() => void skipRestaurants()}>
            <Text style={styles.skip}>{RESTAURANT_SKIP_LABEL_FR}</Text>
          </Pressable>
          <Text style={styles.hint}>
            Astuce : Instagram ou Maps → Partager → FlightWatcher
          </Text>
        </View>
      ) : null}

      {importOpen || visible.length > 0 ? (
        <View style={styles.importBox}>
          <View style={styles.importHead}>
            <Text style={styles.importTitle}>Ajouter</Text>
            <Pressable onPress={() => setImportOpen((o) => !o)}>
              <Text style={styles.link}>
                {importOpen ? 'Masquer' : RESTAURANT_ADD_LABEL_FR}
              </Text>
            </Pressable>
          </View>
          {importOpen ? (
            <>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Colle tes liens Maps, Instagram…"
                placeholderTextColor={colors.muted}
                multiline
                style={styles.input}
              />
              <Pressable
                onPress={() => void runImport()}
                disabled={busy || !text.trim()}
                style={[
                  styles.primaryBtn,
                  (!text.trim() || busy) && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.primaryBtnText}>
                  {busy ? 'Analyse…' : 'Analyser'}
                </Text>
              </Pressable>
              {results.map((row, i) => {
                const place = row.place as { name?: string } | undefined
                const parse = row.parse as { name?: string; url_clean?: string } | undefined
                const name = place?.name || parse?.name || 'Lieu'
                const bucket = String(row.bucket || 'restaurant')
                return (
                  <View key={String(row.place_id || i)} style={styles.resultCard}>
                    <View style={styles.resultRow}>
                      <View
                        style={[
                          styles.resultIcon,
                          bucket === 'attraction' && styles.resultIconAttraction,
                        ]}
                      >
                        <Text style={styles.emptyGlyph}>
                          {bucket === 'attraction' ? '◎' : '🍽'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resultName}>{name}</Text>
                        {parse?.url_clean ? (
                          <Pressable
                            onPress={() => void Linking.openURL(String(parse.url_clean))}
                          >
                            <Text style={styles.linkSmall}>Ouvrir la source</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                    <Pressable
                      onPress={() => void confirm(row)}
                      style={styles.secondaryBtn}
                    >
                      <Text style={styles.secondaryBtnText}>Oui, ajouter</Text>
                    </Pressable>
                  </View>
                )
              })}
            </>
          ) : null}
        </View>
      ) : null}

      {visible.map((item) => {
        const name = item.places?.name || 'Restaurant'
        const cuisine = item.places?.restaurant_details?.cuisine
        const chip = dateIso
          ? evaluateOpening({
              openingHoursRaw: item.places?.restaurant_details?.opening_hours_raw,
              dateIso,
              moment: (item.moment as 'evening') || 'evening',
            })
          : null
        return (
          <View key={item.id} style={[styles.card, shadow.soft]}>
            <View style={styles.cardTop}>
              <View style={styles.cardIcon}>
                <Text style={styles.emptyGlyph}>🍽</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {name}
                </Text>
                {item.inherited ? (
                  <Text style={styles.groupBadge}>IDÉE DU GROUPE</Text>
                ) : null}
                {cuisine ? <Text style={styles.muted}>{cuisine}</Text> : null}
                {chip ? (
                  <Text
                    style={[
                      styles.chip,
                      chip.status === 'open'
                        ? styles.chipOpen
                        : chip.status === 'closed'
                          ? styles.chipClosed
                          : styles.chipUnknown,
                    ]}
                  >
                    {chip.label}
                  </Text>
                ) : null}
                <Text style={styles.statusLine}>
                  {tripItemStatusLabelFr((item.status as 'idea') || 'idea')}
                  {item.availability_state === 'needs_check'
                    ? ' · À vérifier pour tes nouvelles dates'
                    : ''}
                </Text>
              </View>
            </View>
            <View style={styles.row}>
              {!item.inherited && item.status === 'idea' ? (
                <Pressable
                  onPress={() =>
                    void getApi()
                      .patchTripItem(item.id, { status: 'validated' })
                      .then(() => load())
                  }
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>
                    {RESTAURANT_VALIDATE_LABEL_FR}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() =>
                  void Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      name,
                    )}`,
                  )
                }
              >
                <Text style={styles.link}>{RESTAURANT_MAPS_LABEL_FR}</Text>
              </Pressable>
              {item.places?.id ? (
                <Pressable
                  onPress={() =>
                    void getApi().reportPlace({
                      place_id: item.places!.id!,
                      reason: 'closed',
                    })
                  }
                >
                  <Text style={styles.report}>C’était fermé ?</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )
      })}

      {skipped && visible.length === 0 ? (
        <Text style={styles.muted}>Pas de restaurant prévu pour ce voyage.</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  budget: { fontFamily: fonts.bold, fontSize: 11, color: colors.muted },
  muted: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  err: { fontFamily: fonts.semibold, fontSize: 13, color: colors.danger },
  toast: { fontFamily: fonts.semibold, fontSize: 13, color: colors.success },
  empty: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFDCC8',
    gap: 10,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGlyph: { fontSize: 20 },
  emptyTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  emptyBody: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { fontFamily: fonts.bold, color: colors.white, fontSize: 14 },
  ghostBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  ghostBtnText: { fontFamily: fonts.bold, fontSize: 13, color: colors.inkSoft },
  skip: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 4,
  },
  secondaryBtn: {
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryBtnText: { fontFamily: fonts.bold, color: colors.white, fontSize: 13 },
  link: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryDeep },
  linkSmall: {
    marginTop: 2,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primaryDeep,
  },
  report: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted },
  hint: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted },
  importBox: {
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  importHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  importTitle: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  input: {
    minHeight: 88,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 12,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.canvas,
    textAlignVertical: 'top',
  },
  resultCard: {
    backgroundColor: colors.canvas,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 10,
  },
  resultRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultIconAttraction: { backgroundColor: '#E8F4FF' },
  resultName: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 10,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  groupBadge: {
    alignSelf: 'flex-start',
    marginTop: 5,
    fontFamily: fonts.bold,
    fontSize: 8,
    color: colors.primaryInk,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  statusLine: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  chip: {
    alignSelf: 'flex-start',
    marginTop: 6,
    fontFamily: fonts.bold,
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  chipOpen: { backgroundColor: '#ECFDF5', color: '#065F46' },
  chipClosed: { backgroundColor: '#FFFBEB', color: '#92400E' },
  chipUnknown: { backgroundColor: colors.primarySoft, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
})
