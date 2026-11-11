import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Alert,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  canPublish,
  citySlugDisplayNameFr,
  groupItemsByDay,
  itineraryBadgeLabel,
  type Itinerary,
  type ItineraryItem,
} from '@flightwatcher/shared'
import { CreateFlowProgress } from '../components/parcours/CreateFlowProgress'
import { ItineraryCard } from '../components/parcours/ItineraryCard'
import { ItineraryDetailChrome } from '../components/parcours/ItineraryDetailChrome'
import { ScreenBackground } from '../components/ScreenBackground'
import { useAuth } from '../context/AuthContext'
import { coverUri } from '../lib/coverUri'
import { getApi } from '../lib/client'
import { canCreateParcoursOnDevice } from '../lib/parcoursAccess'
import {
  clearParcoursCreateSession,
  getParcoursCreateSession,
} from '../lib/parcoursCreateSession'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'
import {
  draftToPayload,
  sumStepBudgets,
} from './CreateParcoursStepsScreen'
import type { DraftStep } from '../components/parcours/AddParcoursStepSheet'

type Props = NativeStackScreenProps<RootStackParamList, 'CreateParcoursPreview'>

const MOMENT_FR: Record<string, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  evening: 'Soir',
}

function sessionToItinerary(
  title: string,
  citySlug: string,
  cover: string | null,
  steps: DraftStep[],
  occasions: string[] = [],
): Itinerary {
  const total = sumStepBudgets(steps)
  return {
    id: 'local',
    title,
    city_slug: citySlug,
    cover_image: cover,
    budget_estimate_eur: total,
    budget_basis: 'per_person',
    occasions,
    itinerary_items: steps.map(
      (s, i) =>
        ({
          id: s.localId,
          itinerary_id: 'local',
          kind: 'free',
          position: i,
          title: s.title,
          note: s.note,
          day_offset: s.day_offset,
          moment: s.moment,
          photo: s.photo || s.photos[0] || null,
          meta: {
            maps_url: s.maps_url,
            lat: s.lat,
            lng: s.lng,
            photos: s.photos,
            budget_eur: s.budget_eur,
            description: s.description,
          },
        }) as ItineraryItem,
    ),
  } as Itinerary
}

export function CreateParcoursPreviewScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const allowed = canCreateParcoursOnDevice(user?.email)
  const session = getParcoursCreateSession()
  const [mode, setMode] = useState<'card' | 'fiche'>('fiche')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!allowed) navigation.goBack()
  }, [allowed, navigation])

  const itin = useMemo(() => {
    if (!session) return null
    return sessionToItinerary(
      session.title,
      session.city_slug,
      session.cover_image,
      session.steps,
      session.occasions || [],
    )
  }, [session])

  const items = useMemo(
    () => (itin?.itinerary_items || []) as ItineraryItem[],
    [itin],
  )
  const byDay = useMemo(() => groupItemsByDay(items), [items])

  const heroUrl = useMemo(
    () =>
      coverUri(itin?.cover_image || '', {
        width: 1400,
        citySlug: itin?.city_slug,
      }),
    [itin],
  )

  const cityLabel = itin?.city_slug
    ? citySlugDisplayNameFr(itin.city_slug) || itin.city_slug
    : ''

  const budgetLabel =
    itin?.budget_estimate_eur === 0
      ? 'Gratuit'
      : itin?.budget_estimate_eur != null
        ? `~${itin.budget_estimate_eur} €`
        : null

  const badge =
    itineraryBadgeLabel({ occasions: session?.occasions || [] }) || null

  const closeKeepDraft = () => {
    navigation.navigate('Main')
  }

  const tryPublish = async () => {
    if (!session || !session.steps.length) {
      Alert.alert('Ajoute au moins un lieu avant de publier.')
      return
    }
    const itemsPayload = draftToPayload(session.steps)
    const total = sumStepBudgets(session.steps)
    const intro = `Parcours à ${citySlugDisplayNameFr(session.city_slug) || session.city_slug}.`
    const probe = {
      title: session.title,
      city_slug: session.city_slug,
      cover_image: session.cover_image,
      intro,
      slug: 'ok',
    } as unknown as Itinerary
    if (!canPublish(probe, itemsPayload as unknown as ItineraryItem[])) {
      Alert.alert(
        'Pas encore publiable',
        'Il manque titre, couverture ou au moins une étape.',
      )
      return
    }

    setSaving(true)
    try {
      const res = await getApi().adminPublishNewParcours({
        title: session.title,
        city_slug: session.city_slug,
        cover_image: session.cover_image,
        intro,
        budget_estimate_eur: total,
        budget_basis: 'per_person',
        occasions: session.occasions || [],
        items: itemsPayload as unknown as Record<string, unknown>[],
      })
      if (!res.ok || !res.itinerary?.id) {
        Alert.alert(
          'Publication refusée',
          (res.blockers || []).map((b) => b.message).join('\n') ||
            res.error ||
            'Erreur',
        )
        return
      }
      clearParcoursCreateSession()
      const published = res.itinerary as unknown as Itinerary
      const id = String(published.id)
      navigation.replace('ItineraryDetail', {
        itineraryId: published?.slug || id,
        preview: {
          id: published.id,
          slug: published.slug,
          title: published.title,
          cover_image: published.cover_image,
          city_slug: published.city_slug,
        },
      })
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  if (!allowed) return null

  if (!itin || !session) {
    return (
      <View style={[styles.root, styles.center, { padding: spacing.xl }]}>
        <ScreenBackground />
        <Text style={styles.error}>Parcours non commencé</Text>
        <Pressable onPress={() => navigation.navigate('Main')}>
          <Text style={styles.link}>Fermer</Text>
        </Pressable>
      </View>
    )
  }

  if (mode === 'fiche') {
    return (
      <View style={styles.root}>
        <ItineraryDetailChrome
          heroUrl={heroUrl}
          title={itin.title || 'Parcours'}
          metaChips={[
            badge,
            cityLabel,
            budgetLabel,
            `${items.length} étape${items.length > 1 ? 's' : ''}`,
          ].filter(Boolean) as string[]}
          phaseLabel={badge || 'Rendu'}
          onBack={() => navigation.navigate('CreateParcoursSteps')}
          stickySecondary="Modifier"
          onStickySecondary={() => navigation.navigate('CreateParcoursSteps')}
          stickySecondaryDisabled={saving}
          stickyCta={saving ? 'Publication…' : 'Publier'}
          stickyCtaDisabled={saving}
          onStickyCta={() => {
            if (!saving) void tryPublish()
          }}
        >
          <View style={styles.previewBanner}>
            <CreateFlowProgress
              step={3}
              style={{ marginHorizontal: 0, marginTop: 0 }}
            />
            <Text style={styles.previewHint}>
              Rendu final — publie pour le valider, ou modifie les lieux.
            </Text>
            <Pressable onPress={() => setMode('card')} style={styles.switchMode}>
              <Text style={styles.switchModeText}>Voir la carte</Text>
            </Pressable>
          </View>

          {byDay.length === 0 ? (
            <Text style={styles.emptySteps}>Aucune étape pour l’instant.</Text>
          ) : (
            byDay.map((day) => (
              <View key={day.dayOffset} style={styles.dayBlock}>
                <Text style={styles.dayLabel}>{day.label}</Text>
                {day.items.map((it) => {
                  const photos =
                    (it.meta?.photos as string[] | undefined) ||
                    (it.photo ? [it.photo] : [])
                  const moment = it.moment ? MOMENT_FR[it.moment] : null
                  return (
                    <View key={it.id} style={[styles.stepCard, shadow.soft]}>
                      {photos[0] ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.gallery}
                        >
                          {photos.slice(0, 5).map((uri, i) => (
                            <Image
                              key={`${uri}-${i}`}
                              source={{ uri }}
                              style={styles.galleryImg}
                            />
                          ))}
                        </ScrollView>
                      ) : null}
                      <Text style={styles.stepTitle}>{it.title}</Text>
                      {moment ? <Text style={styles.stepMeta}>{moment}</Text> : null}
                      {it.note ? (
                        <Text style={styles.stepNote}>{it.note}</Text>
                      ) : null}
                    </View>
                  )
                })}
              </View>
            ))
          )}
        </ItineraryDetailChrome>
      </View>
    )
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <ScreenBackground />
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.navigate('CreateParcoursSteps')}
          hitSlop={12}
        >
          <Text style={styles.navMuted}>Retour</Text>
        </Pressable>
        <Pressable onPress={closeKeepDraft} hitSlop={12}>
          <Text style={styles.navCta}>Fermer</Text>
        </Pressable>
      </View>
      <CreateFlowProgress step={3} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>LE RENDU</Text>
        <Text style={styles.heading}>Aperçu</Text>
        <Text style={[styles.lead, { marginBottom: 18 }]}>
          Comme dans la liste Parcours — publie ou modifie.
        </Text>

        <ItineraryCard
          itinerary={itin}
          variant="landscape"
          badge={badge || 'Aperçu'}
          style={{ alignSelf: 'center', marginBottom: 16 }}
        />

        <Pressable onPress={() => setMode('fiche')} style={styles.switchMode}>
          <Text style={styles.switchModeText}>Voir la fiche</Text>
        </Pressable>
      </ScrollView>

      <View
        style={[
          styles.publishBar,
          { paddingBottom: Math.max(insets.bottom, 12) + 4 },
        ]}
      >
        <Pressable
          onPress={() => navigation.navigate('CreateParcoursSteps')}
          disabled={saving}
          style={({ pressed }) => [
            styles.modify,
            saving && { opacity: 0.45 },
            pressed && !saving && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.modifyText}>Modifier</Text>
        </Pressable>
        <Pressable
          onPress={() => void tryPublish()}
          disabled={saving}
          style={({ pressed }) => [
            styles.publish,
            shadow.lift,
            saving && { opacity: 0.6 },
            pressed && !saving && { transform: [{ scale: 0.985 }] },
          ]}
        >
          <Text style={styles.publishText}>
            {saving ? 'Publication…' : 'Publier'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  center: { alignItems: 'center', justifyContent: 'center' },
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
  navCta: { fontFamily: fonts.bold, fontSize: 14, color: colors.primary },
  previewBanner: {
    marginBottom: 8,
  },
  previewHint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
  },
  switchMode: { alignSelf: 'flex-start', marginBottom: 16 },
  switchModeText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
  emptySteps: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
  },
  dayBlock: { marginBottom: 18 },
  dayLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
  },
  stepCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 8,
  },
  gallery: { marginBottom: 8 },
  galleryImg: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: colors.primaryMuted,
  },
  stepTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  stepMeta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
  },
  stepNote: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 6,
    lineHeight: 18,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.danger,
    marginBottom: 12,
  },
  link: { fontFamily: fonts.bold, fontSize: 14, color: colors.primary },
  publishBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.canvas,
  },
  modify: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
  },
  modifyText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  publish: {
    flex: 1,
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
