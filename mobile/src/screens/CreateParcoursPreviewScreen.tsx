import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  citySlugDisplayNameFr,
  groupItemsByDay,
  itineraryBudgetLabel,
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
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'CreateParcoursPreview'>

const MOMENT_FR: Record<string, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  evening: 'Soir',
}

export function CreateParcoursPreviewScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { itineraryId } = route.params
  const allowed = canCreateParcoursOnDevice(user?.email)

  const [itin, setItin] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'card' | 'fiche'>('fiche')

  useEffect(() => {
    if (!allowed) navigation.goBack()
  }, [allowed, navigation])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getApi().adminGetParcours(itineraryId)
      if (!res.ok || !res.itinerary) throw new Error('Parcours introuvable')
      setItin(res.itinerary as unknown as Itinerary)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [itineraryId])

  useEffect(() => {
    void load()
  }, [load])

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
        slug: itin?.slug,
      }),
    [itin],
  )

  const cityLabel = itin?.city_slug
    ? citySlugDisplayNameFr(itin.city_slug) || itin.city_slug
    : ''
  const budgetLabel = itin ? itineraryBudgetLabel(itin) : null

  const done = () => {
    navigation.navigate('Main')
  }

  if (!allowed) return null

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ScreenBackground />
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  if (error || !itin) {
    return (
      <View style={[styles.root, styles.center, { padding: spacing.xl }]}>
        <ScreenBackground />
        <Text style={styles.error}>{error || 'Introuvable'}</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Retour</Text>
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
            cityLabel,
            budgetLabel ? budgetLabel.replace(' sur place', '').trim() : null,
            `${items.length} étape${items.length > 1 ? 's' : ''}`,
          ].filter(Boolean) as string[]}
          phaseLabel="Aperçu"
          onBack={() =>
            navigation.navigate('CreateParcoursSteps', { itineraryId })
          }
          stickyLeft="Brouillon"
          stickyCta="Terminer"
          onStickyCta={done}
        >
          <View style={styles.previewBanner}>
            <CreateFlowProgress
              step={3}
              style={{ marginHorizontal: 0, marginTop: 0 }}
            />
            <Text style={styles.previewHint}>
              Aperçu du parcours tel qu’il sera affiché.
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
                      {it.meta?.maps_url ? (
                        <Text style={styles.stepMaps}>Google Maps lié</Text>
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
          onPress={() =>
            navigation.navigate('CreateParcoursSteps', { itineraryId })
          }
          hitSlop={12}
        >
          <Text style={styles.navMuted}>Retour</Text>
        </Pressable>
        <Pressable onPress={done} hitSlop={12}>
          <Text style={styles.navCta}>Terminer</Text>
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
          Comme dans la liste Parcours.
        </Text>

        <ItineraryCard
          itinerary={itin}
          variant="landscape"
          badge="Brouillon"
          style={{ alignSelf: 'center', marginBottom: 16 }}
        />
        <ItineraryCard
          itinerary={itin}
          variant="portrait"
          badge="Brouillon"
          style={{ alignSelf: 'center' }}
        />

        <Pressable
          onPress={() => setMode('fiche')}
          style={[styles.cta, shadow.lift, { marginTop: 28 }]}
        >
          <Text style={styles.ctaText}>Voir la fiche</Text>
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
  stepMaps: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.primaryDeep,
    marginTop: 8,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 15, color: '#fff' },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.danger,
    marginBottom: 12,
  },
  link: { fontFamily: fonts.bold, fontSize: 14, color: colors.primary },
})
