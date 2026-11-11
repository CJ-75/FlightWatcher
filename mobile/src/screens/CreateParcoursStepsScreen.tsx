import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  groupItemsByDay,
  ITINERARY_OCCASION_BADGE_LABELS,
  ITINERARY_OCCASIONS,
  type ItineraryItem,
  type ItineraryOccasion,
} from '@flightwatcher/shared'
import {
  AddParcoursStepSheet,
  type DraftStep,
} from '../components/parcours/AddParcoursStepSheet'
import { CreateFlowProgress } from '../components/parcours/CreateFlowProgress'
import { ScreenBackground } from '../components/ScreenBackground'
import { useAuth } from '../context/AuthContext'
import { canCreateParcoursOnDevice } from '../lib/parcoursAccess'
import {
  getParcoursCreateSession,
  patchParcoursCreateSession,
  startParcoursCreateSession,
} from '../lib/parcoursCreateSession'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'CreateParcoursSteps'>

const MOMENT_FR: Record<string, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  evening: 'Soir',
}

const MOMENT_ORDER: Record<string, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
}

export function sumStepBudgets(steps: DraftStep[]): number {
  return steps.reduce((acc, s) => {
    const n = typeof s.budget_eur === 'number' ? s.budget_eur : 0
    return acc + (Number.isFinite(n) && n >= 0 ? n : 0)
  }, 0)
}

export function draftToPayload(steps: DraftStep[]) {
  return steps.map((s, i) => {
    const photos = s.photos.filter(Boolean).slice(0, 5)
    const meta: Record<string, unknown> = {}
    if (s.maps_url) meta.maps_url = s.maps_url
    if (s.lat != null) meta.lat = s.lat
    if (s.lng != null) meta.lng = s.lng
    if (photos.length) meta.photos = photos
    if (s.description.trim()) meta.description = s.description.trim()
    meta.budget_eur =
      typeof s.budget_eur === 'number' && Number.isFinite(s.budget_eur)
        ? s.budget_eur
        : 0
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
  const routeSeed = route.params?.seed
  const allowed = canCreateParcoursOnDevice(user?.email)

  const session0 = getParcoursCreateSession()
  const [title] = useState(
    () => session0?.title || routeSeed?.title || 'Parcours',
  )
  const [citySlug] = useState(
    () => session0?.city_slug || routeSeed?.city_slug || 'paris',
  )
  const [coverImage, setCoverImage] = useState<string | null>(
    () => session0?.cover_image || routeSeed?.cover_image || null,
  )
  const [steps, setSteps] = useState<DraftStep[]>(() => session0?.steps || [])
  const [tag, setTag] = useState<ItineraryOccasion | null>(
    () => session0?.occasions?.[0] || null,
  )
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(steps.length === 0)
  const [editing, setEditing] = useState<DraftStep | null>(null)
  const autoOpenedRef = useRef(steps.length === 0)

  const stepPhotos = useMemo(() => {
    const out: string[] = []
    const seen = new Set<string>()
    for (const s of steps) {
      for (const uri of s.photos.length ? s.photos : s.photo ? [s.photo] : []) {
        if (!uri || seen.has(uri)) continue
        seen.add(uri)
        out.push(uri)
      }
    }
    return out
  }, [steps])

  const byDay = useMemo(() => {
    const fake = steps.map(
      (s, i) =>
        ({
          id: s.localId,
          itinerary_id: 'local',
          kind: s.kind,
          position: i,
          title: s.title,
          day_offset: s.day_offset,
          moment: s.moment,
          photo: s.photo,
        }) as ItineraryItem,
    )
    return groupItemsByDay(fake).map((day) => ({
      ...day,
      items: [...day.items].sort((a, b) => {
        const ma = MOMENT_ORDER[String(a.moment || '')] ?? 9
        const mb = MOMENT_ORDER[String(b.moment || '')] ?? 9
        if (ma !== mb) return ma - mb
        return (a.position || 0) - (b.position || 0)
      }),
    }))
  }, [steps])

  useEffect(() => {
    if (!allowed) navigation.goBack()
  }, [allowed, navigation])

  useEffect(() => {
    if (!getParcoursCreateSession() && routeSeed) {
      startParcoursCreateSession({
        title: routeSeed.title || 'Parcours',
        city_slug: routeSeed.city_slug || 'paris',
        cover_image: routeSeed.cover_image,
        steps,
      })
    }
  }, [routeSeed, steps])

  // Une seule ouverture auto de la sheet
  useEffect(() => {
    if (autoOpenedRef.current) return
    if (steps.length > 0) return
    autoOpenedRef.current = true
    setEditing(null)
    setSheetOpen(true)
  }, [steps.length])

  const persistLocal = (
    nextSteps: DraftStep[],
    nextCover: string | null = coverImage,
    nextTag: ItineraryOccasion | null = tag,
  ) => {
    setSteps(nextSteps)
    setCoverImage(nextCover)
    setTag(nextTag)
    patchParcoursCreateSession({
      title,
      city_slug: citySlug,
      cover_image: nextCover,
      occasions: nextTag ? [nextTag] : [],
      steps: nextSteps,
    })
  }

  const setHero = (uri: string) => {
    persistLocal(steps, uri)
  }

  const pickTag = (value: ItineraryOccasion) => {
    const next = tag === value ? null : value
    persistLocal(steps, coverImage, next)
  }

  const sortSteps = (list: DraftStep[]) =>
    [...list].sort((a, b) => {
      if (a.day_offset !== b.day_offset) return a.day_offset - b.day_offset
      const ma = MOMENT_ORDER[String(a.moment || '')] ?? 9
      const mb = MOMENT_ORDER[String(b.moment || '')] ?? 9
      return ma - mb
    })

  const onSaveStep = (step: DraftStep) => {
    const idx = steps.findIndex((s) => s.localId === step.localId)
    const next =
      idx >= 0 ? steps.map((s, i) => (i === idx ? step : s)) : [...steps, step]
    persistLocal(sortSteps(next))
    setSheetOpen(false)
    setEditing(null)
  }

  const removeStep = (localId: string) => {
    Alert.alert('Supprimer cette étape ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          persistLocal(steps.filter((s) => s.localId !== localId))
        },
      },
    ])
  }

  const moveStep = (localId: string, dir: -1 | 1) => {
    const idx = steps.findIndex((s) => s.localId === localId)
    const nextIdx = idx + dir
    if (idx < 0 || nextIdx < 0 || nextIdx >= steps.length) return
    const next = [...steps]
    const [item] = next.splice(idx, 1)
    next.splice(nextIdx, 0, item)
    persistLocal(next)
  }

  const goFinalRender = () => {
    persistLocal(steps)
    if (steps.length === 0) {
      Alert.alert('Ajoute au moins un lieu pour voir le rendu.')
      return
    }
    if (!tag) {
      Alert.alert('Choisis un tag', 'Le tag court apparaît sur le badge du parcours.')
      return
    }
    navigation.navigate('CreateParcoursPreview')
  }

  if (!allowed) return null

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <ScreenBackground />
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            persistLocal(steps)
            navigation.navigate('CreateParcours')
          }}
          hitSlop={12}
        >
          <Text style={styles.navMuted}>Retour</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            persistLocal(steps)
            navigation.navigate('Main')
          }}
          hitSlop={12}
        >
          <Text style={styles.navMuted}>Fermer</Text>
        </Pressable>
      </View>
      <CreateFlowProgress step={2} />

      <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: steps.length > 0 ? 24 : insets.bottom + 40,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.kicker}>LES LIEUX</Text>
          <Text style={styles.heading} numberOfLines={2}>
            {title}
          </Text>
          <Text
            style={[
              styles.lead,
              { marginBottom: steps.length > 0 ? 6 : 22 },
            ]}
          >
            Les endroits à faire, dans l’ordre.
          </Text>
          {steps.length > 0 ? (
            <Text style={styles.budgetTotal}>
              Budget ·{' '}
              {(() => {
                const total = sumStepBudgets(steps)
                return total === 0 ? 'Gratuit' : `${total} € / pers.`
              })()}
            </Text>
          ) : null}

          {steps.length === 0 ? (
            <Pressable
              onPress={() => {
                setEditing(null)
                setSheetOpen(true)
              }}
              style={[styles.empty, shadow.soft]}
            >
              <View style={styles.emptyDot} />
              <Text style={styles.emptyTitle}>Aucun lieu</Text>
              <Text style={styles.emptyBody}>
                Nom, notes, budget, lien Maps et photos.
              </Text>
              <Text style={styles.emptyCta}>Ajouter un lieu →</Text>
            </Pressable>
          ) : (
            <>
              {byDay.map((day) => (
                <View key={day.dayOffset} style={styles.dayBlock}>
                  <View style={styles.dayHead}>
                    <View style={styles.dayDot} />
                    <Text style={styles.dayLabel}>{day.label}</Text>
                  </View>
                  {day.items.map((it) => {
                    const draft = steps.find((s) => s.localId === it.id)
                    if (!draft) return null
                    const index = steps.findIndex(
                      (s) => s.localId === draft.localId,
                    )
                    const budgetLabel =
                      draft.budget_eur === 0
                        ? 'Gratuit'
                        : draft.budget_eur != null
                          ? `${draft.budget_eur} €`
                          : null
                    const meta = [
                      draft.moment ? MOMENT_FR[draft.moment] : null,
                      budgetLabel,
                      draft.maps_url ? 'Maps' : null,
                      draft.photos.length
                        ? `${draft.photos.length} photo${draft.photos.length > 1 ? 's' : ''}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                    const canUp = index > 0
                    const canDown = index < steps.length - 1
                    return (
                      <View
                        key={draft.localId}
                        style={[styles.card, shadow.soft]}
                      >
                        <Pressable
                          onPress={() => {
                            setEditing(draft)
                            setSheetOpen(true)
                          }}
                          onLongPress={() => removeStep(draft.localId)}
                          style={({ pressed }) => [
                            styles.cardMain,
                            pressed && { opacity: 0.92 },
                          ]}
                        >
                          {draft.photo ? (
                            <Image
                              source={{ uri: draft.photo }}
                              style={styles.thumb}
                            />
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
                            {meta ? (
                              <Text style={styles.cardMeta}>{meta}</Text>
                            ) : null}
                          </View>
                        </Pressable>
                        <View style={styles.reorder}>
                          <Pressable
                            onPress={() => moveStep(draft.localId, -1)}
                            disabled={!canUp}
                            hitSlop={8}
                            accessibilityLabel="Monter"
                            style={[
                              styles.reorderBtn,
                              !canUp && styles.reorderBtnOff,
                            ]}
                          >
                            <Text style={styles.reorderArrow}>↑</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => moveStep(draft.localId, 1)}
                            disabled={!canDown}
                            hitSlop={8}
                            accessibilityLabel="Descendre"
                            style={[
                              styles.reorderBtn,
                              !canDown && styles.reorderBtnOff,
                            ]}
                          >
                            <Text style={styles.reorderArrow}>↓</Text>
                          </Pressable>
                        </View>
                      </View>
                    )
                  })}
                </View>
              ))}

              <Pressable
                onPress={() => {
                  setEditing(null)
                  setSheetOpen(true)
                }}
                style={({ pressed }) => [
                  styles.addStep,
                  pressed && { opacity: 0.88 },
                ]}
              >
                <Text style={styles.addStepText}>Ajouter une étape</Text>
              </Pressable>

              <View style={styles.tagBlock}>
                <Text style={styles.heroLabel}>Tag</Text>
                <Text style={styles.heroHint}>
                  Court — affiché en badge sur la carte parcours.
                </Text>
                <View style={styles.tagRow}>
                  {ITINERARY_OCCASIONS.map((id) => {
                    const on = tag === id
                    return (
                      <Pressable
                        key={id}
                        onPress={() => pickTag(id)}
                        style={[styles.tagChip, on && styles.tagChipOn]}
                      >
                        <Text
                          style={[styles.tagChipText, on && styles.tagChipTextOn]}
                        >
                          {ITINERARY_OCCASION_BADGE_LABELS[id]}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>

              {stepPhotos.length > 0 ? (
                <View style={styles.heroBlock}>
                  <Text style={styles.heroLabel}>Photo hero</Text>
                  <Text style={styles.heroHint}>
                    Choisis l’image de couverture du parcours.
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.heroRow}
                  >
                    {stepPhotos.map((uri) => {
                      const on = coverImage === uri
                      return (
                        <Pressable
                          key={uri}
                          onPress={() => setHero(uri)}
                          style={[styles.heroThumbWrap, on && styles.heroThumbOn]}
                        >
                          <Image source={{ uri }} style={styles.heroThumb} />
                        </Pressable>
                      )
                    })}
                  </ScrollView>
                </View>
              ) : null}
            </>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

      {steps.length > 0 ? (
        <View
          style={[
            styles.publishBar,
            { paddingBottom: Math.max(insets.bottom, 12) + 4 },
          ]}
        >
          <Pressable
            onPress={goFinalRender}
            style={({ pressed }) => [
              styles.publish,
              shadow.lift,
              pressed && { transform: [{ scale: 0.985 }] },
            ]}
          >
            <Text style={styles.publishText}>Voir le rendu final</Text>
          </Pressable>
        </View>
      ) : null}

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
  scroll: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: 2,
    minHeight: 36,
  },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.primary,
    marginBottom: 2,
  },
  heading: {
    fontFamily: fonts.extrabold,
    fontSize: 24,
    letterSpacing: -0.6,
    lineHeight: 30,
    color: colors.ink,
  },
  lead: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    marginTop: 4,
  },
  navMuted: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  budgetTotal: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
    marginBottom: 20,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: 13,
    marginBottom: 12,
  },
  empty: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.xl,
    padding: 18,
    alignItems: 'flex-start',
  },
  emptyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginBottom: 10,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 18,
  },
  emptyCta: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primary,
    marginTop: 12,
  },
  dayBlock: { marginBottom: 16 },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dayDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  dayLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.muted,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.lg,
    paddingVertical: 8,
    paddingLeft: 11,
    paddingRight: 6,
    marginBottom: 8,
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    paddingVertical: 3,
  },
  thumb: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbMark: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.primaryInk,
    opacity: 0.45,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  cardNote: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
    lineHeight: 17,
  },
  cardMeta: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
    marginTop: 3,
  },
  reorder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginLeft: 4,
  },
  reorderBtn: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  reorderBtnOff: { opacity: 0.22 },
  reorderArrow: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 18,
    color: colors.ink,
  },
  addStep: {
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
  },
  addStepText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primary,
  },
  tagBlock: {
    marginTop: 10,
    marginBottom: 6,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  tagChip: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  tagChipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  tagChipText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.ink,
  },
  tagChipTextOn: { color: '#FFF8F3' },
  heroBlock: {
    marginTop: 10,
    marginBottom: 6,
  },
  heroLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
  },
  heroHint: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    marginBottom: 10,
  },
  heroRow: { gap: 8, paddingRight: 8 },
  heroThumbWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  heroThumbOn: { borderColor: colors.primary },
  heroThumb: {
    width: 72,
    height: 72,
    backgroundColor: colors.primaryMuted,
  },
  publishBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.canvas,
  },
  publish: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  publishText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#fff',
  },
})
