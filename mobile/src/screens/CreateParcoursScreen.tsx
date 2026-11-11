import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  cityImageUrl,
  citySlugDisplayNameFr,
} from '@flightwatcher/shared'
import { ActivityCityPicker } from '../components/ActivityCityPicker'
import { CreateFlowProgress } from '../components/parcours/CreateFlowProgress'
import { ScreenBackground } from '../components/ScreenBackground'
import { useAuth } from '../context/AuthContext'
import { canCreateParcoursOnDevice } from '../lib/parcoursAccess'
import {
  clearParcoursCreateSession,
  getParcoursCreateSession,
  startParcoursCreateSession,
} from '../lib/parcoursCreateSession'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'CreateParcours'>

export function CreateParcoursScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const allowed = canCreateParcoursOnDevice(user?.email)
  const existing = getParcoursCreateSession()

  const [title, setTitle] = useState(existing?.title || '')
  const [titleTouched, setTitleTouched] = useState(!!existing?.title)
  const [citySlug, setCitySlug] = useState(existing?.city_slug || 'paris')
  const [cityLabel, setCityLabel] = useState(
    citySlugDisplayNameFr(existing?.city_slug || 'paris') || 'Paris',
  )
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

  const onCityChange = (city: { slug?: string; label?: string }) => {
    const slug = city.slug || 'paris'
    const label = city.label || city.slug || 'Paris'
    setCitySlug(slug)
    setCityLabel(label)
    if (!titleTouched) setTitle(suggestTitle(label))
  }

  const discardAndClose = useCallback(() => {
    clearParcoursCreateSession()
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.navigate('Main')
  }, [navigation])

  const continueToSteps = useCallback(() => {
    const t = title.trim()
    if (!t) {
      setError('Donne un titre à ton parcours')
      return
    }
    if (!citySlug.trim()) {
      setError('Choisis une ville')
      return
    }
    setError(null)
    // Mémoire seule — rien en base tant que non publié
    startParcoursCreateSession({
      title: t,
      city_slug: citySlug,
      cover_image: cover,
    })
    navigation.replace('CreateParcoursSteps', {
      seed: { title: t, city_slug: citySlug, cover_image: cover },
    })
  }, [title, cover, citySlug, navigation])

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
            onPress={discardAndClose}
            hitSlop={14}
            style={styles.closeHit}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
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

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            onPress={continueToSteps}
            disabled={!canContinue}
            style={({ pressed }) => [
              styles.cta,
              shadow.lift,
              !canContinue && { opacity: 0.55 },
              pressed && canContinue && { transform: [{ scale: 0.985 }] },
            ]}
          >
            <Text style={styles.ctaText}>Ajouter les lieux</Text>
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
