import React, { useEffect, useMemo, useState } from 'react'
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
  cityDisplayNameFr,
  cityImageUrl,
  formatDurationMinutes,
  groupItemsByDay,
  itineraryBudgetLabel,
  itineraryInfoChips,
  stepKindLabel,
  type Itinerary,
  type ItineraryItem,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { ItineraryDetailChrome } from '../components/parcours/ItineraryDetailChrome'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'ItineraryDetail'>

const CITY_LS = 'fw_parcours_city'

export function ItineraryDetailScreen({ route, navigation }: Props) {
  const { itineraryId } = route.params
  const [itin, setItin] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userCity, setUserCity] = useState('paris')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    void AsyncStorage.getItem(CITY_LS).then((v) => {
      if (v) setUserCity(v)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    void getApi()
      .getParcours(itineraryId)
      .then((r) => {
        if (!r.ok || !r.itinerary) throw new Error('not_found')
        setItin(r.itinerary as unknown as Itinerary)
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
        setItin(null)
        setError('Parcours introuvable')
      })
      .finally(() => setLoading(false))
  }, [itineraryId])

  const sticky = useMemo(() => {
    if (!itin) return null
    return buildItinerarySticky({ itinerary: itin, userCitySlug: userCity })
  }, [itin, userCity])

  if (loading) {
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
    itin.cover_image ||
    (itin.city_slug ? cityImageUrl(itin.city_slug) : cityImageUrl('paris'))
  const cityLabel =
    cityDisplayNameFr(null, itin.city_slug || '') || itin.city_slug || ''
  const chips = [cityLabel, ...itineraryInfoChips(itin)].filter(Boolean) as string[]
  const budget = itineraryBudgetLabel(itin)
  const markers = buildItineraryMarkerTiles(itin)
  const items = (itin.itinerary_items || []) as ItineraryItem[]
  const days = groupItemsByDay(items)
  const shareUrl = `https://flightwatcher.app/parcours/${itin.slug || itin.id}`

  const onSticky = () => {
    if (!sticky) return
    if (sticky.ctaAction === 'launch_maps') {
      const url = buildItineraryMapsUrl(items)
      if (url) void Linking.openURL(url)
      else setToast('Ajoute des lieux pour lancer le parcours.')
      return
    }
    setToast('Bientôt : créer un voyage depuis ce parcours.')
    navigation.navigate('Main', { screen: 'Planner' })
  }

  return (
    <View style={{ flex: 1 }}>
      <ItineraryDetailChrome
        heroUrl={cover}
        title={itin.title}
        metaChips={chips}
        budgetLabel={budget}
        onBack={() => navigation.goBack()}
        shareUrl={shareUrl}
        stickyLeft={sticky?.leftLabel}
        stickyCta={sticky?.ctaLabel}
        onStickyCta={onSticky}
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
          {days.map((day) => (
            <View key={day.dayOffset} style={{ marginBottom: 16 }}>
              {days.length > 1 ? (
                <Text style={styles.dayLabel}>{day.label}</Text>
              ) : null}
              {day.items.map((it, i) => {
                const title = it.title || it.places?.name || `Étape ${i + 1}`
                const dur = formatDurationMinutes(it.duration_minutes)
                return (
                  <View key={it.id || `${day.dayOffset}-${i}`} style={styles.step}>
                    <View style={styles.stepNum}>
                      <Text style={styles.stepNumText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stepKind}>
                        {stepKindLabel(it.kind)}
                        {dur ? ` · ${dur}` : ''}
                      </Text>
                      <Text style={styles.stepTitle}>{title}</Text>
                      {it.note ? (
                        <Text style={styles.stepNote}>{it.note}</Text>
                      ) : null}
                      {it.kind === 'place' && (it.places?.name || it.title) ? (
                        <Pressable
                          onPress={() => {
                            const q = it.places?.name || it.title
                            if (!q) return
                            void Linking.openURL(
                              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
                            )
                          }}
                        >
                          <Text style={styles.stepAction}>Ouvrir dans Maps</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                )
              })}
            </View>
          ))}

          <Text style={styles.attr}>
            Sources : OSM, Geoapify, Viator, Wikimedia, Panoramax.
          </Text>
        </View>
      </ItineraryDetailChrome>

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
  dayLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#1A120E',
    marginBottom: 10,
  },
  step: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF0E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#FF6B35',
  },
  stepKind: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: '#A3988C',
    textTransform: 'uppercase',
  },
  stepTitle: {
    marginTop: 2,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#1A120E',
  },
  stepNote: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: '#6B5C50',
    lineHeight: 20,
  },
  stepAction: {
    marginTop: 6,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#FF6B35',
  },
  attr: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: '#A3988C',
    lineHeight: 16,
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
