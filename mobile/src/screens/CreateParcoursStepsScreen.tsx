import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  canCreateParcours,
  canPublish,
  groupItemsByDay,
  type Itinerary,
  type ItineraryItem,
} from '@flightwatcher/shared'
import {
  AddParcoursStepSheet,
  type DraftStep,
} from '../components/parcours/AddParcoursStepSheet'
import { CreateFlowProgress } from '../components/parcours/CreateFlowProgress'
import { ScreenBackground } from '../components/ScreenBackground'
import { tabScreenHeaderStyles } from '../components/TabScreenHeader'
import { useAuth } from '../context/AuthContext'
import { getApi } from '../lib/client'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'CreateParcoursSteps'>

const MOMENT_FR: Record<string, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  evening: 'Soir',
}

const FAB = 48

function itemToDraft(it: ItineraryItem, index: number): DraftStep {
  const meta = it.meta || {}
  const photos = Array.isArray(meta.photos)
    ? meta.photos.map(String).filter(Boolean)
    : it.photo
      ? [String(it.photo)]
      : []
  return {
    localId: it.id || `srv-${index}`,
    kind: it.kind === 'place' ? 'place' : 'free',
    title: String(it.title || ''),
    note: String(it.note || ''),
    day_offset: Number(it.day_offset || 0),
    moment: (it.moment as DraftStep['moment']) || null,
    photo: it.photo || photos[0] || null,
    photos,
    maps_url: String(meta.maps_url || ''),
    lat: typeof meta.lat === 'number' ? meta.lat : null,
    lng: typeof meta.lng === 'number' ? meta.lng : null,
  }
}

function draftToPayload(steps: DraftStep[]) {
  return steps.map((s, i) => {
    const photos = s.photos.filter(Boolean).slice(0, 5)
    const meta: Record<string, unknown> = {}
    if (s.maps_url) meta.maps_url = s.maps_url
    if (s.lat != null) meta.lat = s.lat
    if (s.lng != null) meta.lng = s.lng
    if (photos.length) meta.photos = photos
    return {
      kind: 'free' as const,
      title: s.title,
      note: s.note || null,
      day_offset: s.day_offset,
      moment: s.moment,
      photo: photos[0] || s.photo || null,
      position: i,
      meta,
    }
  })
}

export function CreateParcoursStepsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { itineraryId } = route.params
  const allowed = canCreateParcours({ email: user?.email })

  const [itin, setItin] = useState<Itinerary | null>(null)
  const [steps, setSteps] = useState<DraftStep[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<DraftStep | null>(null)

  useEffect(() => {
    if (!allowed) navigation.goBack()
  }, [allowed, navigation])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getApi().adminGetParcours(itineraryId)
      if (!res.ok || !res.itinerary) throw new Error('Parcours introuvable')
      const raw = res.itinerary as unknown as Itinerary
      setItin(raw)
      setSteps(((raw.itinerary_items || []) as ItineraryItem[]).map(itemToDraft))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [itineraryId])

  useEffect(() => {
    void load()
  }, [load])

  const byDay = useMemo(() => {
    const fake = steps.map(
      (s, i) =>
        ({
          id: s.localId,
          itinerary_id: itineraryId,
          kind: s.kind,
          position: i,
          title: s.title,
          day_offset: s.day_offset,
          moment: s.moment,
          photo: s.photo,
        }) as ItineraryItem,
    )
    return groupItemsByDay(fake)
  }, [steps, itineraryId])

  const persist = async (nextSteps: DraftStep[]) => {
    setSaving(true)
    setError(null)
    try {
      const res = await getApi().adminUpdateParcours(itineraryId, {
        items: draftToPayload(nextSteps),
      })
      if (!res.ok) throw new Error(res.error || 'Enregistrement impossible')
      if (res.itinerary) setItin(res.itinerary as unknown as Itinerary)
      const items = ((res.itinerary as { itinerary_items?: ItineraryItem[] })
        ?.itinerary_items || []) as ItineraryItem[]
      if (items.length) setSteps(items.map(itemToDraft))
      else setSteps(nextSteps)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      return false
    } finally {
      setSaving(false)
    }
  }

  const onSaveStep = async (step: DraftStep) => {
    const idx = steps.findIndex((s) => s.localId === step.localId)
    const next =
      idx >= 0 ? steps.map((s, i) => (i === idx ? step : s)) : [...steps, step]
    setSteps(next)
    setSheetOpen(false)
    setEditing(null)
    await persist(next)
  }

  const removeStep = (localId: string) => {
    Alert.alert('Supprimer cette étape ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          const next = steps.filter((s) => s.localId !== localId)
          setSteps(next)
          void persist(next)
        },
      },
    ])
  }

  const goPreview = async () => {
    const ok = await persist(steps)
    if (!ok) return
    navigation.navigate('CreateParcoursPreview', { itineraryId })
  }

  const tryPublish = async () => {
    const items = draftToPayload(steps) as unknown as ItineraryItem[]
    if (!canPublish(itin, items)) {
      Alert.alert(
        'Pas encore publiable',
        'Complète depuis l’admin web (intro, lieux vérifiés…).',
      )
      return
    }
    try {
      await persist(steps)
      const res = await getApi().adminPublishParcours(itineraryId)
      if (!res.ok) {
        Alert.alert(
          'Publication refusée',
          (res.blockers || []).map((b) => b.message).join('\n') ||
            res.error ||
            'Erreur',
        )
        return
      }
      const published = (res.itinerary || itin) as Itinerary | null
      navigation.replace('ItineraryDetail', {
        itineraryId: published?.slug || itineraryId,
        preview: published
          ? {
              id: published.id,
              slug: published.slug,
              title: published.title,
              cover_image: published.cover_image,
              city_slug: published.city_slug,
            }
          : undefined,
      })
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Erreur')
    }
  }

  if (!allowed) return null

  return (
    <View style={[styles.root, { paddingTop: insets.top + 4 }]}>
      <ScreenBackground />
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.navigate('CreateParcours', { itineraryId })}
          hitSlop={12}
        >
          <Text style={styles.navMuted}>Retour</Text>
        </Pressable>
        <Pressable onPress={() => void goPreview()} disabled={saving} hitSlop={12}>
          <Text style={styles.navCta}>{saving ? '…' : 'Aperçu'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 120,
          }}
          showsVerticalScrollIndicator={false}
        >
          <CreateFlowProgress step={2} />
          <Text style={tabScreenHeaderStyles.kicker}>ÉTAPES</Text>
          <Text style={tabScreenHeaderStyles.title} numberOfLines={2}>
            {itin?.title || 'Parcours'}
          </Text>
          <Text style={[tabScreenHeaderStyles.subtitle, { marginBottom: 22 }]}>
            Maps, photos et une courte description par lieu.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {steps.length === 0 ? (
            <View style={[styles.empty, shadow.soft]}>
              <View style={styles.emptyDot} />
              <Text style={styles.emptyTitle}>Ajoute une première étape</Text>
              <Text style={styles.emptyBody}>
                Lien Google Maps, photos, et une petite description.
              </Text>
            </View>
          ) : (
            byDay.map((day) => (
              <View key={day.dayOffset} style={styles.dayBlock}>
                <View style={styles.dayHead}>
                  <View style={styles.dayDot} />
                  <Text style={styles.dayLabel}>{day.label}</Text>
                </View>
                {day.items.map((it) => {
                  const draft = steps.find((s) => s.localId === it.id)
                  if (!draft) return null
                  const meta = [
                    draft.moment ? MOMENT_FR[draft.moment] : null,
                    draft.maps_url ? 'Maps' : null,
                    draft.photos.length
                      ? `${draft.photos.length} photo${draft.photos.length > 1 ? 's' : ''}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <Pressable
                      key={draft.localId}
                      onPress={() => {
                        setEditing(draft)
                        setSheetOpen(true)
                      }}
                      onLongPress={() => removeStep(draft.localId)}
                      style={({ pressed }) => [
                        styles.card,
                        shadow.soft,
                        pressed && { opacity: 0.92 },
                      ]}
                    >
                      {draft.photo ? (
                        <Image source={{ uri: draft.photo }} style={styles.thumb} />
                      ) : (
                        <View style={[styles.thumb, styles.thumbEmpty]}>
                          <Text style={styles.thumbMark}>+</Text>
                        </View>
                      )}
                      <View style={styles.cardBody}>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                          {draft.title}
                        </Text>
                        {draft.note ? (
                          <Text style={styles.cardNote} numberOfLines={2}>
                            {draft.note}
                          </Text>
                        ) : null}
                        {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            ))
          )}

          {steps.length > 0 ? (
            <Pressable
              onPress={() => void goPreview()}
              style={[styles.previewCta, shadow.lift]}
            >
              <Text style={styles.previewCtaText}>Voir le rendu</Text>
            </Pressable>
          ) : null}

          {steps.length > 0 ? (
            <Pressable onPress={() => void tryPublish()} style={styles.publish}>
              <Text style={styles.publishText}>Publier (optionnel)</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <Pressable
        onPress={() => {
          setEditing(null)
          setSheetOpen(true)
        }}
        accessibilityLabel="Ajouter une étape"
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 22 },
          pressed && { transform: [{ scale: 0.96 }] },
        ]}
      >
        <View style={styles.fabGlyph}>
          <View style={styles.fabH} />
          <View style={styles.fabV} />
        </View>
      </Pressable>

      <AddParcoursStepSheet
        visible={sheetOpen}
        initial={editing}
        onClose={() => {
          setSheetOpen(false)
          setEditing(null)
        }}
        onSave={(s) => void onSaveStep(s)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: 10,
  },
  navMuted: { fontFamily: fonts.semibold, fontSize: 15, color: colors.muted },
  navCta: { fontFamily: fonts.bold, fontSize: 15, color: colors.primary },
  error: { color: colors.danger, fontFamily: fonts.medium, marginBottom: 12 },
  empty: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.xl,
    padding: 22,
    alignItems: 'flex-start',
  },
  emptyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginBottom: 12,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 20,
  },
  dayBlock: { marginBottom: 18 },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  dayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  dayLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.muted,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 10,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.primaryMuted,
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbMark: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.primaryInk,
    opacity: 0.45,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  cardNote: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 3,
    lineHeight: 18,
  },
  cardMeta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  previewCta: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  previewCtaText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: '#fff',
  },
  publish: { marginTop: 14, alignSelf: 'center', paddingVertical: 10 },
  publishText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.muted,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    backgroundColor: colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: colors.primaryDeep,
        shadowOpacity: 0.32,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  fabGlyph: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabH: {
    position: 'absolute',
    width: 16,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: '#fff',
  },
  fabV: {
    position: 'absolute',
    width: 2.5,
    height: 16,
    borderRadius: 1.5,
    backgroundColor: '#fff',
  },
})
