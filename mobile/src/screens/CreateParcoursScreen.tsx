import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ImageBackground,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  canCreateParcours,
  cityImageUrl,
  citySlugDisplayNameFr,
  ITINERARY_OCCASION_LABELS,
  ITINERARY_OCCASIONS,
  type ItineraryOccasion,
} from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { getApi } from '../lib/client'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, spacing } from '../theme'

const CITIES = ['paris', 'marseille', 'lyon', 'lisbon', 'porto', 'barcelona', 'rome'] as const

type Props = NativeStackScreenProps<RootStackParamList, 'CreateParcours'>

export function CreateParcoursScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const itineraryId = route.params?.itineraryId

  const allowed = canCreateParcours({ email: user?.email })
  const [title, setTitle] = useState('')
  const [city, setCity] = useState<string>('paris')
  const [occasions, setOccasions] = useState<ItineraryOccasion[]>([])
  const [coverUrl, setCoverUrl] = useState('')
  const [intro, setIntro] = useState('')
  const [loading, setLoading] = useState(!!itineraryId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defaultHero = useMemo(
    () => cityImageUrl(citySlugDisplayNameFr(city) || city),
    [city],
  )
  const heroUri = coverUrl.trim() || defaultHero

  useEffect(() => {
    if (!allowed) {
      navigation.goBack()
    }
  }, [allowed, navigation])

  useEffect(() => {
    if (!itineraryId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await getApi().adminGetParcours(itineraryId)
        if (!res.ok || !res.itinerary) throw new Error('Parcours introuvable')
        if (cancelled) return
        const it = res.itinerary as Record<string, unknown>
        setTitle(String(it.title || ''))
        setCity(String(it.city_slug || 'paris'))
        setCoverUrl(String(it.cover_image || ''))
        setIntro(String(it.intro || ''))
        const occ = Array.isArray(it.occasions)
          ? (it.occasions as string[]).filter(Boolean)
          : []
        setOccasions(occ as ItineraryOccasion[])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [itineraryId])

  const toggleOccasion = (o: ItineraryOccasion) => {
    setOccasions((prev) =>
      prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o],
    )
  }

  const useCityPhoto = () => setCoverUrl(defaultHero)

  const continueToSteps = useCallback(async () => {
    const t = title.trim()
    if (!t) {
      setError('Donne un titre au parcours')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const cover = coverUrl.trim() || defaultHero
      let id = itineraryId
      if (!id) {
        const created = await getApi().adminCreateParcours({
          title: t,
          city_slug: city,
          cover_image: cover,
        })
        if (!created.ok || !created.itinerary?.id) {
          throw new Error('Création impossible')
        }
        id = String(created.itinerary.id)
      }
      const patch = await getApi().adminUpdateParcours(id, {
        title: t,
        city_slug: city,
        cover_image: cover,
        occasions,
        intro: intro.trim() || null,
      })
      if (!patch.ok) throw new Error(patch.error || 'Enregistrement impossible')
      navigation.replace('CreateParcoursSteps', { itineraryId: id })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }, [
    title,
    coverUrl,
    defaultHero,
    itineraryId,
    city,
    occasions,
    intro,
    navigation,
  ])

  if (!allowed) return null

  return (
    <View style={styles.root}>
      <ImageBackground source={{ uri: heroUri }} style={styles.hero} imageStyle={styles.heroImg}>
        <View style={[styles.heroScrim, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.back}>← Retour</Text>
          </Pressable>
          <Text style={styles.brand}>FlightWatcher</Text>
          <Text style={styles.heroTitle}>
            {itineraryId ? 'Modifier le parcours' : 'Nouveau parcours'}
          </Text>
          <Text style={styles.heroSub}>Titre, ville, photo — puis les étapes.</Text>
        </View>
      </ImageBackground>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            contentContainerStyle={{
              padding: spacing.xl,
              paddingBottom: insets.bottom + 40,
              gap: 14,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>Titre</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Week-end à Lisbonne…"
              placeholderTextColor={colors.faint}
              style={styles.input}
            />

            <Text style={styles.label}>Ville</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {CITIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCity(c)}
                  style={[styles.chip, city === c && styles.chipOn]}
                >
                  <Text style={[styles.chipText, city === c && styles.chipTextOn]}>
                    {citySlugDisplayNameFr(c) || c}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.label}>Occasions</Text>
            <View style={styles.wrap}>
              {ITINERARY_OCCASIONS.map((o) => {
                const on = occasions.includes(o)
                return (
                  <Pressable
                    key={o}
                    onPress={() => toggleOccasion(o)}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {ITINERARY_OCCASION_LABELS[o]}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <View style={styles.rowBetween}>
              <Text style={styles.label}>Photo hero</Text>
              <Pressable onPress={useCityPhoto}>
                <Text style={styles.link}>Photo ville</Text>
              </Pressable>
            </View>
            <TextInput
              value={coverUrl}
              onChangeText={setCoverUrl}
              placeholder="URL image (vide = photo ville)"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              style={styles.input}
            />

            <Text style={styles.label}>Intro (optionnel)</Text>
            <TextInput
              value={intro}
              onChangeText={setIntro}
              placeholder="Deux phrases pour planter le décor…"
              placeholderTextColor={colors.faint}
              multiline
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={() => void continueToSteps()}
              disabled={saving}
              style={[styles.cta, saving && { opacity: 0.7 }]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>Continuer → étapes</Text>
              )}
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: { minHeight: 220 },
  heroImg: { resizeMode: 'cover' },
  heroScrim: {
    flex: 1,
    backgroundColor: 'rgba(20,12,8,0.42)',
    paddingHorizontal: spacing.xl,
    paddingBottom: 20,
    justifyContent: 'flex-end',
  },
  back: { fontFamily: fonts.semibold, fontSize: 14, color: '#fff', marginBottom: 8 },
  brand: {
    fontFamily: fonts.extrabold,
    fontSize: 13,
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroTitle: {
    fontFamily: fonts.serif,
    fontSize: 34,
    color: '#fff',
    lineHeight: 40,
  },
  heroSub: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 6,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
    marginRight: 8,
    marginBottom: 8,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  chipTextOn: { color: '#F5EFEA' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  link: { fontFamily: fonts.bold, fontSize: 13, color: colors.primary },
  error: { fontFamily: fonts.medium, color: colors.danger, fontSize: 14 },
  cta: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 16, color: '#fff' },
})
