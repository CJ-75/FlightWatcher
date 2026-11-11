import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  citySlugDisplayNameFr,
  groupItemsByDay,
  type Itinerary,
  type ItineraryItem,
} from '@flightwatcher/shared'
import { CreateFlowProgress } from '../components/parcours/CreateFlowProgress'
import { ItineraryCard } from '../components/parcours/ItineraryCard'
import { ItineraryDetailChrome } from '../components/parcours/ItineraryDetailChrome'
import { ScreenBackground } from '../components/ScreenBackground'
import { useAuth } from '../context/AuthContext'
import { coverUri } from '../lib/coverUri'
import { canCreateParcoursOnDevice } from '../lib/parcoursAccess'
import { getParcoursCreateSession } from '../lib/parcoursCreateSession'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'
import { sumStepBudgets } from './CreateParcoursStepsScreen'
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
): Itinerary {
  const total = sumStepBudgets(steps)
  return {
    id: 'local',
    title,
    city_slug: citySlug,
    cover_image: cover,
    budget_estimate_eur: total,
    budget_basis: 'for_two',
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

  const closeKeepDraft = () => {
    // Brouillon cache conservé
    navigation.navigate('Main')
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
          heroUri={heroUrl}
          title={itin.title || 'Parcours'}
          metaChips={[
            cityLabel,
            budgetLabel,
            `${items.length} étape${items.length > 1 ? 's' : ''}`,
          ].filter(Boolean) as string[]}
          phaseLabel="Aperçu"
          onBack={() => navigation.navigate('CreateParcoursSteps')}
          stickyLeft="Brouillon en cache"
          stickyCta="Fermer"
          onStickyCta={closeKeepDraft}
        >
          <View style={styles.previewBanner}>
            <CreateFlowProgress
              step={3}
              style={{ marginHorizontal: 0, marginTop: 0 }}
            />
            <Text style={styles.previewHint}>
              Brouillon en cache — rien en base tant que tu ne publies pas.
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
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>LE RENDU</Text>
        <Text style={styles.heading}>Aperçu</Text>
        <Text style={[styles.lead, { marginBottom: 18 }]}>
          Brouillon en cache — pas encore en base.
        </Text>

        <ItineraryCard
          itinerary={itin}
          variant="landscape"
          badge="Aperçu"
          style={{ alignSelf: 'center', marginBottom: 16 }}
        />

        <Pressable onPress={() => setMode('fiche')} style={styles.switchMode}>
          <Text style={styles.switchModeText}>Voir la fiche</Text>
        </Pressable>
      </ScrollView>
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
})
