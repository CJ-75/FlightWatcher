import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  buildItineraryMapsUrl,
  buildItineraryMarkerTiles,
  buildItinerarySticky,
  citySlugDisplayNameFr,
  cityImageUrl,
  groupItemsByDay,
  itineraryDatedLabelFr,
  itineraryInfoChips,
  itineraryOccasionPhaseLabel,
  type Itinerary,
  type ItineraryItem,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import {
  ensureLikedParcoursIds,
  getParcoursCached,
  getParcoursDetailMemory,
  peekLikedParcoursId,
  setLikedParcoursIdLocal,
} from '../lib/parcoursCache'
import { coverUri } from '../lib/coverUri'
import { useAuth } from '../context/AuthContext'
import { useAuthSheet } from '../components/onboarding/AuthSheetHost'
import { ItineraryDetailChrome } from '../components/parcours/ItineraryDetailChrome'
import { MakeTripSheet } from '../components/parcours/MakeTripSheet'
import { ParcoursDayHeader } from '../components/parcours/ParcoursDayHeader'
import { ParcoursStepBlock } from '../components/parcours/ParcoursStepBlock'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'ItineraryDetail'>

const CITY_LS = 'fw_parcours_city'

function initialItinerary(
  itineraryId: string,
  preview?: RootStackParamList['ItineraryDetail']['preview'],
): Itinerary | null {
  const cached = getParcoursDetailMemory(itineraryId)
  if (cached) return cached
  if (preview?.id || preview?.title) {
    return { ...(preview as Itinerary), id: preview.id || itineraryId }
  }
  return null
}

function stepsCount(it: Itinerary | null | undefined): number {
  return Array.isArray(it?.itinerary_items) ? it!.itinerary_items!.length : 0
}

function hasSteps(it: Itinerary | null): boolean {
  return stepsCount(it) > 0
}

function sameParcours(
  a: Itinerary | null | undefined,
  b: Itinerary | null | undefined,
): boolean {
  if (!a || !b) return false
  if (a.id && b.id && a.id === b.id) return true
  if (a.slug && b.slug && a.slug === b.slug) return true
  return false
}

export function ItineraryDetailScreen({ route, navigation }: Props) {
  const { itineraryId, preview } = route.params
  const { user } = useAuth()
  const { openAuthSheet } = useAuthSheet()
  const [itin, setItin] = useState<Itinerary | null>(() =>
    initialItinerary(itineraryId, preview),
  )
  /** Full detail (with steps) still in flight — chrome can already paint. */
  const [loadingSteps, setLoadingSteps] = useState(
    () => !hasSteps(initialItinerary(itineraryId, preview)),
  )
  const [error, setError] = useState<string | null>(null)
  const [userCity, setUserCity] = useState('paris')
  const [toast, setToast] = useState<string | null>(null)
  const [liked, setLiked] = useState(false)
  const [makeTripOpen, setMakeTripOpen] = useState(false)

  useEffect(() => {
    void AsyncStorage.getItem(CITY_LS).then((v) => {
      if (v) setUserCity(v)
    })
  }, [])

  const refreshLiked = useCallback(
    async (id: string) => {
      if (!user) {
        setLiked(false)
        return
      }
      const known = peekLikedParcoursId(id)
      if (known !== null) {
        setLiked(known)
        return
      }
      try {
        const ids = await ensureLikedParcoursIds(async () => {
          const res = await getApi().listLikedItineraryIds()
          return res.ids || []
        })
        setLiked(ids.has(id))
      } catch {
        setLiked(false)
      }
    },
    [user],
  )

  useEffect(() => {
    let cancelled = false
    const boot = initialItinerary(itineraryId, preview)
    if (boot) {
      setItin((prev) => {
        // Never clobber a detail that already has steps with a chrome-only preview.
        if (
          prev &&
          sameParcours(prev, boot) &&
          stepsCount(prev) > stepsCount(boot)
        ) {
          return prev
        }
        return boot
      })
    }
    const needFetch = !hasSteps(boot)
    if (needFetch) setLoadingSteps(true)

    // Shares in-flight HTTP with catalog prefetch (singleflight).
    void getParcoursCached(itineraryId)
      .then((row) => {
        if (cancelled) return
        setItin(row)
        setError(null)
        void getApi()
          .trackActivityEvent({
            domain: 'itinerary',
            event: 'view',
            surface: 'parcours',
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            meta: { id: itineraryId },
          })
          .catch(() => {})
      })
      .catch(() => {
        if (cancelled) return
        // Keep chrome preview if we have one; only hard-fail with no boot.
        if (!boot) {
          setItin((prev) => (hasSteps(prev) ? prev : null))
          setError('Parcours introuvable')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSteps(false)
      })
    return () => {
      cancelled = true
    }
    // preview omitted on purpose: new object identity was re-booting without steps.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itineraryId is the load key
  }, [itineraryId])

  useEffect(() => {
    if (!itin?.id) return
    void refreshLiked(itin.id)
  }, [itin?.id, refreshLiked])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(t)
  }, [toast])

  const sticky = useMemo(() => {
    if (!itin) return null
    return buildItinerarySticky({ itinerary: itin, userCitySlug: userCity })
  }, [itin, userCity])

  if (!itin && loadingSteps) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  if (error || !itin) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || 'Introuvable'}</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Retour</Text>
        </Pressable>
      </View>
    )
  }

  const cover =
    coverUri(itin.cover_image, {
      width: 1920,
      citySlug: itin.city_slug,
      slug: itin.slug,
    }) ||
    coverUri(cityImageUrl(itin.city_slug || 'paris'), {
      width: 1920,
      citySlug: itin.city_slug || 'paris',
      slug: itin.slug,
    }) ||
    'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1920&q=90&fm=jpg'
  const cityLabel =
    citySlugDisplayNameFr(itin.city_slug) || itin.city_slug || ''
  const chips = [cityLabel, ...itineraryInfoChips(itin)].filter(Boolean) as string[]
  const phaseLabel = itineraryOccasionPhaseLabel(itin)
  const dateLabel = itineraryDatedLabelFr(itin)
  const markers = buildItineraryMarkerTiles(itin)
  const items = (itin.itinerary_items || []) as ItineraryItem[]
  const days = groupItemsByDay(items)
  const shareUrl = `https://flightwatcher.app/parcours/${itin.slug || itin.id}`

  const onSticky = async () => {
    if (!sticky) return
    if (sticky.ctaAction === 'launch_maps') {
      // Toujours Google Maps multi-étapes (pas Apple Maps)
      const url = buildItineraryMapsUrl(items)
      if (url) {
        void getApi()
          .trackActivityEvent({
            domain: 'itinerary',
            event: 'itinerary_launch_maps',
            surface: 'parcours',
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            meta: { id: itin.id },
          })
          .catch(() => {})
        void Linking.openURL(url)
      } else setToast('Ajoute des lieux pour lancer le parcours.')
      return
    }
    // Auth only at create inside MakeTripSheet
    setMakeTripOpen(true)
  }

  const doLike = async () => {
    const next = !liked
    // Optimistic — heart flips before Supabase RTT (~3s).
    setLiked(next)
    setLikedParcoursIdLocal(itin.id, next)
    try {
      const api = getApi()
      if (next) {
        await api.likeItinerary({
          itinerary_id: itin.id,
          itinerary_data: {
            id: itin.id,
            slug: itin.slug,
            title: itin.title,
            subtitle: itin.subtitle,
            city_slug: itin.city_slug,
            cover_image: itin.cover_image,
            duration_kind: itin.duration_kind,
          },
        })
      } else {
        await api.unlikeItinerary(itin.id)
      }
    } catch (e) {
      setLiked(!next)
      setLikedParcoursIdLocal(itin.id, !next)
      setToast(e instanceof Error ? e.message : 'Favori impossible')
    }
  }

  const toggleLike = async () => {
    if (!user) {
      openAuthSheet({
        trigger: 'favorite',
        pending: {
          type: 'like_itinerary',
          trigger: 'favorite',
          payload: { itineraryId: itin.id },
          createdAt: Date.now(),
        },
        onAuthenticated: () => {
          void doLike()
        },
      })
      return
    }
    await doLike()
  }

  return (
    <View style={{ flex: 1 }}>
      <ItineraryDetailChrome
        heroUrl={cover}
        title={itin.title}
        metaChips={chips}
        phaseLabel={phaseLabel}
        dateLabel={dateLabel}
        onBack={() => navigation.goBack()}
        shareUrl={shareUrl}
        liked={liked}
        onLike={() => void toggleLike()}
        stickyLeft={sticky?.leftLabel}
        stickyCta={sticky?.ctaLabel}
        onStickyCta={() => void onSticky()}
      >
        <View style={styles.body}>
          {itin.intro ? <Text style={styles.intro}>{itin.intro}</Text> : null}

          {markers.length ? (
            <View style={styles.markers}>
              {markers.map((m) => (
                <View key={m.id} style={styles.marker}>
                  <Text style={styles.markerLabel}>{m.label}</Text>
                  <Text style={styles.markerDetail}>{m.detail}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Les étapes</Text>
          {loadingSteps && !items.length ? (
            <View style={{ gap: 12 }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={styles.stepSkeleton}>
                  <View style={styles.stepNum} />
                  <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
                    <View style={[styles.skLine, { width: '36%' }]} />
                    <View style={[styles.skLine, { width: '68%', height: 14 }]} />
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {!loadingSteps && !items.length ? (
            <Text style={styles.stepNote}>Aucune étape pour l’instant.</Text>
          ) : null}
          {days.map((day) => (
            <View key={day.dayOffset} style={{ marginBottom: 16 }}>
              <ParcoursDayHeader label={day.label} items={day.items} />
              {day.items.map((it, i) => (
                <ParcoursStepBlock
                  key={it.id || `${day.dayOffset}-${i}`}
                  item={it}
                  index={i}
                />
              ))}
            </View>
          ))}
        </View>
      </ItineraryDetailChrome>

      <MakeTripSheet
        visible={makeTripOpen}
        itinerary={itin}
        onClose={() => setMakeTripOpen(false)}
        onCreated={(tripId) => {
          setMakeTripOpen(false)
          navigation.navigate('TripDetail', {
            tripId,
            autoScan: true,
            fromParcours: true,
          })
        }}
      />

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: 12,
    backgroundColor: '#F7F4EF',
  },
  error: { fontFamily: fonts.semibold, color: colors.ink },
  backLink: { fontFamily: fonts.bold, color: colors.primary },
  body: { gap: 20 },
  intro: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: '#3D342C',
  },
  markers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  marker: {
    flexGrow: 1,
    minWidth: '22%',
    backgroundColor: '#F7F4EF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  markerLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: '#A3988C',
    textTransform: 'uppercase',
  },
  markerDetail: {
    marginTop: 4,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#1A120E',
    textAlign: 'center',
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: '#1A120E',
  },
  stepSkeleton: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 14,
    overflow: 'hidden',
  },
  stepNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF0E8',
  },
  skLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EDE8E1',
  },
  stepNote: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: '#6B5C50',
    lineHeight: 20,
  },
  toast: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: '#1A120E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toastText: { color: '#fff', fontFamily: fonts.semibold, fontSize: 13 },
})
