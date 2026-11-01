import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Platform,
  ScrollView,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  ACTIVITY_ADD_LABEL_FR,
  ACTIVITY_BOOK_VIATOR_FR,
  ACTIVITY_BOOKED_PROMPT_FR,
  ACTIVITY_BROWSE_CATALOG_FR,
  ACTIVITY_SKIP_LABEL_FR,
  ACTIVITY_VALIDATE_LABEL_FR,
  reorderKeysMoving,
  tripItemStatusLabelFr,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { openInAppBrowser } from '../lib/openInApp'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, spacing } from '../theme'

type ItemRow = {
  id: string
  status?: string
  sort_key?: string
  meta?: Record<string, unknown>
  places?: { name?: string } | null
}

export function ActivityStepPanel(props: {
  draftToken?: string | null
  plannedTripId?: string | null
  citySlug?: string | null
  enabled?: boolean
  surface?: string
}) {
  const { draftToken, plannedTripId, enabled = true, surface = 'my_trip' } = props
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Record<string, unknown>[]>([])
  const [pendingBook, setPendingBook] = useState<ItemRow | null>(null)
  const [askBooked, setAskBooked] = useState(false)
  const pendingRef = useRef<ItemRow | null>(null)

  const platform = Platform.OS === 'ios' ? 'ios' : 'android'

  const load = useCallback(async () => {
    if (!draftToken && !plannedTripId) return
    setLoading(true)
    try {
      const res = await getApi().listTripItems({
        draft_token: draftToken || undefined,
        planned_trip_id: plannedTripId || undefined,
      })
      setItems((res.items || []) as ItemRow[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [draftToken, plannedTripId])

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  useEffect(() => {
    pendingRef.current = pendingBook
  }, [pendingBook])

  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === 'active' && pendingRef.current) setAskBooked(true)
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [])

  const track = (event: string, meta?: Record<string, unknown>) => {
    void getApi()
      .trackActivityEvent({
        domain: 'activity',
        event,
        surface,
        platform,
        draft_token: draftToken || undefined,
        planned_trip_id: plannedTripId || undefined,
        meta,
      })
      .catch(() => undefined)
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    await getApi().patchTripItem(id, {
      ...body,
      draft_token: draftToken || undefined,
    })
    await load()
  }

  const move = async (from: number, to: number) => {
    const keys = reorderKeysMoving(
      items.map((i) => i.id),
      from,
      to,
    )
    await getApi().reorderTripItems(keys, {
      draft_token: draftToken || undefined,
      planned_trip_id: plannedTripId || undefined,
    })
    await load()
  }

  const titleOf = (it: ItemRow) => String(it.places?.name || it.meta?.title || 'Activité')

  if (!enabled) {
    return <Text style={styles.muted}>Activités bientôt disponibles.</Text>
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          style={styles.cta}
          onPress={() => {
            track('browse_catalog')
            navigation.navigate('Main', {
              screen: 'Activities',
              params: { city: props.citySlug || 'paris' },
            })
          }}
        >
          <Text style={styles.ctaText}>{ACTIVITY_BROWSE_CATALOG_FR}</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={async () => {
            setPickerOpen(true)
            try {
              const res = await getApi().listCityActivities(props.citySlug || 'paris', 2)
              setSuggestions(Array.isArray(res.items) ? res.items.slice(0, 12) : [])
            } catch {
              setSuggestions([])
            }
          }}
        >
          <Text style={styles.secondaryText}>{ACTIVITY_ADD_LABEL_FR}</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={async () => {
            track('skip')
            try {
              await getApi().addTripItem({
                product_code: `skip-${Date.now()}`,
                title: ACTIVITY_SKIP_LABEL_FR,
                draft_token: draftToken || undefined,
                planned_trip_id: plannedTripId || undefined,
                platform,
                surface,
              })
              const res = await getApi().listTripItems({
                draft_token: draftToken || undefined,
                planned_trip_id: plannedTripId || undefined,
              })
              const last = (res.items || []).slice(-1)[0] as ItemRow | undefined
              if (last?.id) await patch(last.id, { status: 'skipped' })
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Erreur')
            }
          }}
        >
          <Text style={styles.secondaryText}>{ACTIVITY_SKIP_LABEL_FR}</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}

      {items.map((it, idx) => (
        <View key={it.id} style={styles.card}>
          <Text style={styles.title}>{titleOf(it)}</Text>
          <Text style={styles.muted}>{tripItemStatusLabelFr(it.status)}</Text>
          <View style={styles.row}>
            {idx > 0 ? (
              <Pressable onPress={() => void move(idx, idx - 1)}>
                <Text style={styles.link}>Monter</Text>
              </Pressable>
            ) : null}
            {idx < items.length - 1 ? (
              <Pressable onPress={() => void move(idx, idx + 1)}>
                <Text style={styles.link}>Descendre</Text>
              </Pressable>
            ) : null}
            {it.status !== 'validated' && it.status !== 'booked' && it.status !== 'skipped' ? (
              <Pressable onPress={() => void patch(it.id, { status: 'validated' })}>
                <Text style={styles.link}>{ACTIVITY_VALIDATE_LABEL_FR}</Text>
              </Pressable>
            ) : null}
            {it.meta?.product_url ? (
              <Pressable
                onPress={() => {
                  setPendingBook(it)
                  track('book_click', { trip_item_id: it.id })
                  openInAppBrowser(navigation, String(it.meta?.product_url), titleOf(it))
                }}
              >
                <Text style={styles.linkPrimary}>{ACTIVITY_BOOK_VIATOR_FR}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}

      <Modal visible={pickerOpen} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>Suggestions</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {suggestions.map((s) => (
                <Pressable
                  key={String(s.product_code)}
                  style={styles.suggest}
                  onPress={async () => {
                    await getApi().addTripItem({
                      product_code: s.product_code,
                      title: s.title,
                      product_url: s.product_url,
                      draft_token: draftToken || undefined,
                      planned_trip_id: plannedTripId || undefined,
                      platform,
                      surface,
                    })
                    setPickerOpen(false)
                    await load()
                  }}
                >
                  <Text style={styles.title}>{String(s.title || '')}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.secondary} onPress={() => setPickerOpen(false)}>
              <Text style={styles.secondaryText}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={askBooked && !!pendingBook} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>
              {ACTIVITY_BOOKED_PROMPT_FR(pendingBook ? titleOf(pendingBook) : 'cette activité')}
            </Text>
            <View style={styles.row}>
              <Pressable
                style={[styles.cta, { flex: 1 }]}
                onPress={() => {
                  if (pendingBook) void patch(pendingBook.id, { status: 'booked' })
                  track('booked_yes')
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                <Text style={styles.ctaText}>Oui</Text>
              </Pressable>
              <Pressable
                style={[styles.secondary, { flex: 1 }]}
                onPress={() => {
                  if (pendingBook) void patch(pendingBook.id, { status: 'validated' })
                  track('booked_no')
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                <Text style={styles.secondaryText}>Pas encore</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ctaText: { color: '#fff', fontFamily: fonts.bold, fontSize: 13 },
  secondary: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryText: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 13 },
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 12,
    gap: 4,
  },
  title: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14 },
  muted: { fontFamily: fonts.regular, color: colors.muted, fontSize: 12 },
  err: { color: colors.danger, fontFamily: fonts.medium, fontSize: 12 },
  link: { fontFamily: fonts.semibold, color: colors.inkSoft, fontSize: 12 },
  linkPrimary: { fontFamily: fonts.bold, color: colors.primary, fontSize: 12 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  suggest: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
})
