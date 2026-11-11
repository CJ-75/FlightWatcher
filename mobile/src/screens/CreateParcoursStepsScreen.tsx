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
  const [publishing, setPublishing] = useState(false)
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
      const items = (raw.itinerary_items || []) as ItineraryItem[]
      setSteps(items.map(itemToDraft))
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
      idx >= 0
        ? steps.map((s, i) => (i === idx ? step : s))
        : [...steps, step]
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

  const finish = async () => {
    const ok = await persist(steps)
    if (!ok) return
    const status = String(itin?.status || 'draft')
    if (status === 'published' && itin) {
      const slugOrId = itin.slug || itineraryId
      navigation.replace('ItineraryDetail', {
        itineraryId: slugOrId,
        preview: {
          id: itin.id,
          slug: itin.slug,
          title: itin.title,
          subtitle: itin.subtitle,
          intro: itin.intro,
          cover_image: itin.cover_image,
          city_slug: itin.city_slug,
          duration_kind: itin.duration_kind,
          occasions: itin.occasions as string[],
          featured_from: itin.featured_from,
          featured_to: itin.featured_to,
          budget_estimate_eur: itin.budget_estimate_eur,
          budget_basis: itin.budget_basis,
        },
      })
      return
    }
    // Draft stays private — Parcours tab shows « Mes brouillons ».
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.navigate('Main')
  }

  const tryPublish = async () => {
    const items = draftToPayload(steps) as unknown as ItineraryItem[]
    if (!canPublish(itin, items)) {
      Alert.alert(
        'Pas encore publiable',
        'Il manque des champs (intro, cover, ou 3 lieux vérifiés). Tu peux publier depuis l’admin web.',
      )
      return
    }
    setPublishing(true)
    try {
      await persist(steps)
      const res = await getApi().adminPublishParcours(itineraryId)
      if (!res.ok) {
        const blockers = (res.blockers || [])
          .map((b) => b.message)
          .join('\n')
        Alert.alert('Publication refusée', blockers || res.error || 'Erreur')
        return
      }
      if (res.itinerary) setItin(res.itinerary as unknown as Itinerary)
      Alert.alert('Publié', 'Le parcours est au catalogue.')
      const published = (res.itinerary || itin) as Itinerary | null
      const slugOrId = published?.slug || itineraryId
      navigation.replace('ItineraryDetail', {
        itineraryId: slugOrId,
        preview: published
          ? {
              id: published.id,
              slug: published.slug,
              title: published.title,
              subtitle: published.subtitle,
              intro: published.intro,
              cover_image: published.cover_image,
              city_slug: published.city_slug,
              duration_kind: published.duration_kind,
              occasions: published.occasions as string[],
            }
          : undefined,
      })
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Erreur')
    } finally {
      setPublishing(false)
    }
  }

  if (!allowed) return null

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() =>
            navigation.navigate('CreateParcours', { itineraryId })
          }
        >
          <Text style={styles.back}>← Infos</Text>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {itin?.title || 'Étapes'}
        </Text>
        <Pressable onPress={() => void finish()} disabled={saving}>
          <Text style={styles.saveTop}>{saving ? '…' : 'OK'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 120,
          }}
        >
          <Text style={styles.kicker}>ÉTAPES</Text>
          <Text style={styles.title}>Compose ton parcours</Text>
          <Text style={styles.sub}>
            Ajoute des lieux via un lien Maps, des photos, une note.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {steps.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Aucune étape pour l’instant.</Text>
            </View>
          ) : (
            byDay.map((day) => (
              <View key={day.dayOffset} style={styles.dayBlock}>
                <Text style={styles.dayTitle}>{day.label}</Text>
                {day.items.map((it) => {
                  const draft = steps.find((s) => s.localId === it.id)
                  if (!draft) return null
                  return (
                    <Pressable
                      key={draft.localId}
                      onPress={() => {
                        setEditing(draft)
                        setSheetOpen(true)
                      }}
                      onLongPress={() => removeStep(draft.localId)}
                      style={[styles.card, shadow.soft]}
                    >
                      {draft.photo ? (
                        <Image
                          source={{ uri: draft.photo }}
                          style={styles.cardThumb}
                        />
                      ) : (
                        <View style={[styles.cardThumb, styles.cardThumbEmpty]} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                          {draft.title}
                        </Text>
                        <Text style={styles.cardMeta}>
                          {[
                            draft.moment ? MOMENT_FR[draft.moment] : null,
                            draft.maps_url ? 'Maps' : null,
                            draft.photos.length
                              ? `${draft.photos.length} photo${draft.photos.length > 1 ? 's' : ''}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Étape libre'}
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            ))
          )}

          <Pressable
            onPress={() => void tryPublish()}
            disabled={publishing || steps.length === 0}
            style={styles.publishLink}
          >
            <Text style={styles.publishText}>
              {publishing ? 'Publication…' : 'Publier (si règles OK)'}
            </Text>
          </Pressable>
        </ScrollView>
      )}

      <Pressable
        onPress={() => {
          setEditing(null)
          setSheetOpen(true)
        }}
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
      >
        <Text style={styles.fabText}>+ Ajouter</Text>
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
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: 8,
    gap: 12,
  },
  back: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
  topTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'center',
  },
  saveTop: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  kicker: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.muted,
    marginTop: 8,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 32,
    color: colors.ink,
    marginTop: 4,
  },
  sub: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    marginBottom: 16,
  },
  error: { color: colors.danger, fontFamily: fonts.medium, marginBottom: 12 },
  empty: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyText: { fontFamily: fonts.medium, color: colors.muted },
  dayBlock: { marginTop: 18 },
  dayTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.ink,
    marginBottom: 10,
  },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
  },
  cardThumbEmpty: { opacity: 0.5 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  cardMeta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    backgroundColor: colors.ink,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radius.full,
  },
  fabText: { fontFamily: fonts.bold, fontSize: 15, color: '#fff' },
  publishLink: { marginTop: 28, alignItems: 'center' },
  publishText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.primaryDeep,
  },
})
