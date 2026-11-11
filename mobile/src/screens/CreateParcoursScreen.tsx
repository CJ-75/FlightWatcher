import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  canCreateParcours,
  cityImageUrl,
  citySlugDisplayNameFr,
} from '@flightwatcher/shared'
import { ActivityCityPicker } from '../components/ActivityCityPicker'
import { CreateFlowProgress } from '../components/parcours/CreateFlowProgress'
import { ScreenBackground } from '../components/ScreenBackground'
import { useAuth } from '../context/AuthContext'
import { getApi } from '../lib/client'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'CreateParcours'>

export function CreateParcoursScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const itineraryId = route.params?.itineraryId
  const allowed = canCreateParcours({ email: user?.email })

  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [citySlug, setCitySlug] = useState('paris')
  const [cityLabel, setCityLabel] = useState('Paris')
  const [loading, setLoading] = useState(!!itineraryId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cover = useMemo(
    () => cityImageUrl(cityLabel || citySlugDisplayNameFr(citySlug) || citySlug),
    [cityLabel, citySlug],
  )

  const suggestTitle = useCallback((label: string) => {
    const name = (label || '').trim()
    if (!name) return ''
    return `Week-end à ${name}`
  }, [])

  useEffect(() => {
    if (!allowed) navigation.goBack()
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
        const loadedTitle = String(it.title || '')
        setTitle(loadedTitle)
        setTitleTouched(!!loadedTitle)
        const slug = String(it.city_slug || 'paris')
        setCitySlug(slug)
        setCityLabel(citySlugDisplayNameFr(slug) || slug)
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

  const onCityChange = (city: { slug?: string; label?: string }) => {
    const slug = city.slug || 'paris'
    const label = city.label || city.slug || 'Paris'
    setCitySlug(slug)
    setCityLabel(label)
    if (!titleTouched) setTitle(suggestTitle(label))
  }

  const continueToSteps = useCallback(async () => {
    const t = title.trim()
    if (!t) {
      setError('Donne un titre à ton parcours')
      return
    }
    if (!citySlug.trim()) {
      setError('Choisis une ville')
      return
    }
    setSaving(true)
    setError(null)
    try {
      let id = itineraryId
      if (!id) {
        const created = await getApi().adminCreateParcours({
          title: t,
          city_slug: citySlug,
          cover_image: cover,
        })
        if (!created.ok || !created.itinerary?.id) {
          throw new Error('Création impossible')
        }
        id = String(created.itinerary.id)
      }
      const patch = await getApi().adminUpdateParcours(id, {
        title: t,
        city_slug: citySlug,
        cover_image: cover,
      })
      if (!patch.ok) throw new Error(patch.error || 'Enregistrement impossible')
      navigation.replace('CreateParcoursSteps', { itineraryId: id })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }, [title, cover, itineraryId, citySlug, navigation])

  if (!allowed) return null

  const canContinue = !!title.trim() && !!citySlug

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ paddingTop: insets.top + 8 }}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={14}
            style={styles.closeHit}
          >
            <Text style={styles.close}>Fermer</Text>
          </Pressable>
          <CreateFlowProgress step={1} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 130,
          }}
        >
          <Text style={styles.kicker}>CRÉER UN PARCOURS</Text>
          <Text style={styles.heading}>Nouveau parcours</Text>
          <Text style={styles.lead}>
            Un titre pour le retrouver, une ville pour le situer.
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <>
              <View style={[styles.card, shadow.soft]}>
                <Text style={styles.q}>Titre</Text>
                <TextInput
                  value={title}
                  onChangeText={(v) => {
                    setTitle(v)
                    setTitleTouched(true)
                  }}
                  placeholder="Ex. Week-end à Lyon"
                  placeholderTextColor={colors.faint}
                  style={styles.titleInput}
                />
              </View>

              <View style={[styles.card, shadow.soft]}>
                <View style={styles.coverWrap}>
                  <Image source={{ uri: cover }} style={styles.cover} />
                  <LinearGradient
                    colors={['transparent', 'rgba(18,10,6,0.72)']}
                    style={styles.coverGrad}
                  />
                  <Text style={styles.coverLabel} numberOfLines={1}>
                    {cityLabel}
                  </Text>
                </View>
                <Text style={styles.q}>Ville</Text>
                <ActivityCityPicker
                  valueSlug={citySlug}
                  valueLabel={cityLabel}
                  onChange={onCityChange}
                  includeParcoursFrCities
                />
              </View>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            onPress={() => void continueToSteps()}
            disabled={saving || loading || !canContinue}
            style={({ pressed }) => [
              styles.cta,
              shadow.lift,
              (!canContinue || saving || loading) && { opacity: 0.55 },
              pressed && canContinue && { transform: [{ scale: 0.985 }] },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Ajouter les lieux</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  closeHit: {
    alignSelf: 'flex-start',
    marginBottom: 6,
    paddingHorizontal: spacing.xl,
  },
  close: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.muted,
  },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.primary,
    marginBottom: 4,
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
    marginBottom: 16,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  coverWrap: {
    height: 132,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: colors.primaryMuted,
  },
  cover: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  coverGrad: {
    ...StyleSheet.absoluteFillObject,
  },
  coverLabel: {
    position: 'absolute',
    left: 14,
    bottom: 12,
    right: 14,
    fontFamily: fonts.extrabold,
    fontSize: 18,
    letterSpacing: -0.4,
    color: '#fff',
  },
  q: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
    marginBottom: 10,
  },
  titleInput: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    letterSpacing: -0.3,
    color: colors.ink,
    paddingVertical: 2,
  },
  error: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.danger,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#fff',
  },
})
