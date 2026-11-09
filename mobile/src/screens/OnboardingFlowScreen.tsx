/**
 * Lot 3 — entre canvas app et ancrage photo (Promise → Ville → Envie).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Animated,
  Easing,
  ImageBackground,
  Dimensions,
  PixelRatio,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  TRAVEL_PREFERENCE_CARDS,
  airportSelectionLabel,
  cityImageUrl,
  encodeAirportCodes,
  findCityGroupByCodes,
  groupAirportsByCity,
  loadOnboardingPrefs,
  markOnboardingCompleted,
  parseAirportCodes,
  setDepartureCity,
  setTravelPreference,
  suggestCityFromLocale,
  type Airport,
  type TravelPreference,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import {
  peekCachedAirports,
  subscribeAirports,
} from '../lib/airportsCache'
import { CityAirportPicker } from '../components/CityAirportPicker'
import { ScreenBackground } from '../components/ScreenBackground'
import { colors, fonts, shadow } from '../theme'

type Props = {
  onDone: () => void
}

const { width: W } = Dimensions.get('window')
const PHOTO_W = Math.min(
  1600,
  Math.round(Math.max(W, 390) * Math.min(PixelRatio.get(), 2.5)),
)

const PROMISE_PHOTO = `https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=${PHOTO_W}&q=85&fm=jpg`

const PREF_VISUAL: Record<TravelPreference, { photo: string; line: string }> = {
  amis: {
    photo: `https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=${PHOTO_W}&q=80&fm=jpg`,
    line: 'Week-ends à plusieurs, sans tableur',
  },
  couple: {
    photo: `https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=${PHOTO_W}&q=80&fm=jpg`,
    line: 'Deux places, une même envie',
  },
  solo: {
    photo: `https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=${PHOTO_W}&q=80&fm=jpg`,
    line: 'Tu pars quand tu veux',
  },
  famille: {
    photo: `https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=${PHOTO_W}&q=80&fm=jpg`,
    line: 'Des idées qui tiennent la route',
  },
}

function slugifyCity(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function cityPhoto(label: string) {
  const raw = cityImageUrl(label)
  if (!raw) return PROMISE_PHOTO
  if (raw.includes('w=')) return raw.replace(/w=\d+/, `w=${PHOTO_W}`)
  return `${raw}${raw.includes('?') ? '&' : '?'}w=${PHOTO_W}&q=85`
}

function track(event: string, meta?: Record<string, unknown>) {
  void getApi()
    .trackActivityEvent({
      domain: 'onboarding',
      event,
      surface: 'onboarding',
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      meta: meta || {},
    })
    .catch(() => {})
}

export function OnboardingFlowScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const suggested = useMemo(
    () =>
      suggestCityFromLocale(
        Intl.DateTimeFormat().resolvedOptions().locale,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    [],
  )
  const [airports, setAirports] = useState<Airport[]>(() => peekCachedAirports())
  const [airport, setAirport] = useState('')
  const [pref, setPref] = useState<TravelPreference | null>(null)
  const defaultedOriginRef = useRef(false)

  const fade = useRef(new Animated.Value(1)).current
  const rise = useRef(new Animated.Value(0)).current
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    track('onboarding_started')
  }, [])

  useEffect(() => subscribeAirports(setAirports), [])

  useEffect(() => {
    void loadOnboardingPrefs().then((p) => {
      if (p.departureAirportCodes) setAirport(p.departureAirportCodes)
    })
  }, [])

  useEffect(() => {
    if (!airports.length || defaultedOriginRef.current) return
    if (airport) {
      defaultedOriginRef.current = true
      return
    }
    defaultedOriginRef.current = true
    const groups = groupAirportsByCity(airports)
    const paris = groups.find((g) => g.city.toLowerCase() === 'paris')
    if (paris) {
      const encoded = encodeAirportCodes(paris.airports.map((a) => a.code))
      if (encoded) {
        setAirport(encoded)
        return
      }
    }
    const want = suggested.label.toLowerCase()
    const match = groups.find((g) => g.city.toLowerCase() === want)
    if (match) {
      const encoded = encodeAirportCodes(match.airports.map((a) => a.code))
      if (encoded) setAirport(encoded)
      return
    }
    const fallback = findCityGroupByCodes(groups, ['CDG', 'ORY', 'BVA'])
    if (fallback) {
      const encoded = encodeAirportCodes(fallback.airports.map((a) => a.code))
      if (encoded) setAirport(encoded)
    }
  }, [airports, airport, suggested.label])

  useEffect(() => {
    fade.setValue(0)
    rise.setValue(12)
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: step / 2,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start()
  }, [step, fade, rise, progress])

  const cityGroups = useMemo(() => groupAirportsByCity(airports), [airports])
  const codes = useMemo(() => parseAirportCodes(airport), [airport])
  const cityLabel = useMemo(() => {
    const group = findCityGroupByCodes(cityGroups, codes)
    if (group) return group.city
    return airportSelectionLabel(airport, cityGroups) || suggested.label
  }, [airport, cityGroups, codes, suggested.label])

  const finish = async () => {
    await markOnboardingCompleted()
    track('onboarding_completed', {
      city: slugifyCity(cityLabel),
      preference: pref,
    })
    onDone()
  }

  const persistCity = () => {
    const slug = slugifyCity(cityLabel) || suggested.slug
    void setDepartureCity({
      slug,
      label: cityLabel,
      airportCodes: airport || null,
    })
    track('onboarding_city_set', { slug, codes: airport })
    void getApi()
      .updateProfile({
        home_city_slug: slug,
        home_airport: airport,
      })
      .catch(() => {})
  }

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['14%', '100%'],
  })

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + 12,
          paddingBottom: Math.max(insets.bottom, 12) + 14,
        },
      ]}
    >
      <StatusBar style="dark" />
      <ScreenBackground />

      <View style={styles.topMeta}>
        <Text style={styles.brand}>FlightWatcher</Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: barWidth }]} />
        </View>
        <Text style={styles.stepCount}>
          {step + 1}
          <Text style={styles.stepCountMuted}> / 3</Text>
        </Text>
      </View>

      <Animated.View
        style={[
          styles.pane,
          { opacity: fade, transform: [{ translateY: rise }] },
        ]}
      >
        {step === 0 ? (
          <>
            <View style={[styles.heroFrame, shadow.soft]}>
              <ImageBackground
                source={{ uri: PROMISE_PHOTO }}
                style={styles.heroImage}
                imageStyle={styles.heroImageBitmap}
              >
                <LinearGradient
                  colors={[
                    'rgba(26,18,14,0.05)',
                    'rgba(26,18,14,0.25)',
                    'rgba(26,18,14,0.72)',
                  ]}
                  locations={[0, 0.45, 1]}
                  style={styles.heroGrad}
                >
                  <Text style={styles.heroEyebrow}>WEEK-ENDS · PRÊTS À PARTIR</Text>
                  <Text style={styles.heroTitle}>
                    Le bon départ,{'\n'}le bon prix.
                  </Text>
                </LinearGradient>
              </ImageBackground>
            </View>

            <Text style={styles.lead}>
              Prix clairs depuis ta ville, parcours à partager, voyages à
              plusieurs — sans tableur.
            </Text>

            <View style={styles.chipRow}>
              {['Ta ville', 'Parcours', 'À plusieurs'].map((label) => (
                <View key={label} style={styles.chip}>
                  <Text style={styles.chipText}>{label}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.cta,
                pressed && styles.ctaPressed,
              ]}
              onPress={() => setStep(1)}
            >
              <Text style={styles.ctaText}>C’est parti</Text>
            </Pressable>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={styles.kicker}>Départ</Text>
            <Text style={styles.title}>
              Tu pars <Text style={styles.titleAccent}>d’où ?</Text>
            </Text>

            <View style={[styles.cityPreview, shadow.soft]}>
              <ImageBackground
                source={{ uri: cityPhoto(cityLabel) }}
                style={styles.cityPreviewImg}
                imageStyle={styles.cityPreviewBitmap}
              >
                <LinearGradient
                  colors={['transparent', 'rgba(26,18,14,0.65)']}
                  style={styles.cityPreviewGrad}
                >
                  <Text style={styles.cityPreviewLabel}>{cityLabel}</Text>
                </LinearGradient>
              </ImageBackground>
            </View>

            <Text style={styles.leadTight}>
              Même champ que dans Vols — change si besoin.
            </Text>

            <View style={[styles.card, shadow.soft]}>
              <Text style={styles.fieldLabel}>Ville de départ</Text>
              <CityAirportPicker
                airports={airports}
                value={airport}
                onChange={setAirport}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.cta,
                !codes.length && styles.ctaDisabled,
                pressed && codes.length > 0 && styles.ctaPressed,
              ]}
              disabled={!codes.length}
              onPress={() => {
                persistCity()
                setStep(2)
              }}
            >
              <Text style={styles.ctaText}>Continuer</Text>
            </Pressable>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.kicker}>Envie</Text>
            <Text style={styles.title}>
              Tu voyages <Text style={styles.titleAccent}>plutôt…</Text>
            </Text>
            <Text style={styles.leadTight}>
              On affine les idées. Tu pourras changer plus tard.
            </Text>

            <View style={styles.prefGrid}>
              {TRAVEL_PREFERENCE_CARDS.map((c) => {
                const on = pref === c.id
                const visual = PREF_VISUAL[c.id]
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setPref(c.id)}
                    style={({ pressed }) => [
                      styles.prefTile,
                      shadow.soft,
                      on && styles.prefTileOn,
                      pressed && { opacity: 0.95 },
                    ]}
                  >
                    <ImageBackground
                      source={{ uri: visual.photo }}
                      style={styles.prefBg}
                      imageStyle={styles.prefBgImg}
                    >
                      <LinearGradient
                        colors={
                          on
                            ? ['rgba(26,18,14,0.15)', 'rgba(232,90,40,0.88)']
                            : ['rgba(26,18,14,0.1)', 'rgba(26,18,14,0.78)']
                        }
                        style={styles.prefOverlay}
                      >
                        <Text style={styles.prefLabel}>{c.label}</Text>
                        <Text style={styles.prefLine}>{visual.line}</Text>
                      </LinearGradient>
                    </ImageBackground>
                  </Pressable>
                )
              })}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.cta,
                !pref && styles.ctaDisabled,
                pressed && pref && styles.ctaPressed,
              ]}
              disabled={!pref}
              onPress={() => {
                if (!pref) return
                persistCity()
                void setTravelPreference(pref)
                track('onboarding_pref_set', { preference: pref })
                void getApi()
                  .updateProfile({ travel_preference: pref })
                  .catch(() => {})
                void finish()
              }}
            >
              <Text style={styles.ctaText}>Voir des idées</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                persistCity()
                void setTravelPreference(null)
                void finish()
              }}
              style={styles.skip}
              hitSlop={10}
            >
              <Text style={styles.skipText}>Passer</Text>
            </Pressable>
          </>
        ) : null}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: colors.canvas,
  },
  topMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  brand: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(40,32,24,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  stepCount: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.ink,
  },
  stepCountMuted: {
    color: colors.muted,
    fontFamily: fonts.regular,
  },
  pane: { flex: 1 },
  heroFrame: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(40,32,24,0.06)',
  },
  heroImage: {
    width: '100%',
    height: Math.min(280, W * 0.72),
  },
  heroImageBitmap: { borderRadius: 24 },
  heroGrad: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 40,
  },
  heroEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: 'rgba(255,176,136,0.95)',
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.9,
    color: '#FFF9F5',
  },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.primary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    letterSpacing: -0.9,
    lineHeight: 38,
    color: colors.ink,
    marginBottom: 10,
  },
  titleAccent: {
    color: colors.primary,
  },
  lead: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.inkSoft,
    marginBottom: 14,
    maxWidth: 360,
  },
  leadTight: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
    marginBottom: 12,
    maxWidth: 360,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.inkSoft,
  },
  cityPreview: {
    height: 118,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(40,32,24,0.06)',
  },
  cityPreviewImg: { flex: 1 },
  cityPreviewBitmap: { borderRadius: 20 },
  cityPreviewGrad: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  cityPreviewLabel: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: '#FFF9F5',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 10,
  },
  prefGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  prefTile: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    height: 124,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  prefTileOn: {
    borderColor: colors.primary,
  },
  prefBg: { flex: 1 },
  prefBgImg: { borderRadius: 16 },
  prefOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
  },
  prefLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: '#FFF9F5',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  prefLine: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,249,245,0.82)',
  },
  cta: {
    marginTop: 'auto',
    backgroundColor: colors.ink,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  ctaDisabled: { opacity: 0.35 },
  ctaText: {
    fontFamily: fonts.bold,
    color: '#FFF9F5',
    fontSize: 16,
    letterSpacing: -0.2,
  },
  skip: { marginTop: 12, alignItems: 'center', paddingVertical: 6 },
  skipText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
  },
})
