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
  Alert,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
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
  isEditingParcours,
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
  const [customCover, setCustomCover] = useState<string | null>(() => {
    const c = existing?.cover_image || null
    if (!c) return null
    // URI locale / upload = choix user ; sinon on laisse la ville piloter
    if (c.startsWith('file:') || c.startsWith('content:') || c.startsWith('ph://')) {
      return c
    }
    return c
  })
  const [pickingCover, setPickingCover] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cityCover = useMemo(
    () => cityImageUrl(cityLabel || citySlugDisplayNameFr(citySlug) || citySlug),
    [cityLabel, citySlug],
  )
  const cover = customCover || cityCover

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

  const pickHero = async () => {
    setPickingCover(true)
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(
          'Photos',
          'Autorise l’accès à la galerie pour choisir la photo hero.',
        )
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.88,
      })
      if (result.canceled || !result.assets?.[0]?.uri) return
      setCustomCover(result.assets[0].uri)
    } catch (e) {
      Alert.alert(
        'Galerie',
        e instanceof Error ? e.message : 'Galerie indisponible',
      )
    } finally {
      setPickingCover(false)
    }
  }

  const closeKeepDraft = useCallback(() => {
    // Brouillon cache conservé — slot unique tant que non publié / abandonné
    const t = title.trim()
    if (t && citySlug.trim()) {
      startParcoursCreateSession({
        title: t,
        city_slug: citySlug,
        cover_image: cover,
      })
    }
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.navigate('Main')
  }, [navigation, title, citySlug, cover])

  const abandonDraft = useCallback(() => {
    Alert.alert(
      'Abandonner ce brouillon ?',
      'Tu pourras ensuite en créer un nouveau. Rien n’a été publié.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Abandonner',
          style: 'destructive',
          onPress: () => {
            clearParcoursCreateSession()
            if (navigation.canGoBack()) navigation.goBack()
            else navigation.navigate('Main')
          },
        },
      ],
    )
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
    // Cache local — rien en base tant que non publié
    startParcoursCreateSession({
      title: t,
      city_slug: citySlug,
      cover_image: cover,
      editing_id: existing?.editing_id ?? null,
    })
    navigation.replace('CreateParcoursSteps', {
      itineraryId: existing?.editing_id || undefined,
      seed: { title: t, city_slug: citySlug, cover_image: cover },
    })
  }, [title, cover, citySlug, navigation, existing?.editing_id])

  if (!allowed) return null

  const canContinue = !!title.trim() && !!citySlug
  const isResume = !!existing
  const isEdit = isEditingParcours()

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ paddingTop: insets.top + 8 }}>
          <View style={styles.topRow}>
            <Pressable
              onPress={closeKeepDraft}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Text style={styles.close}>Fermer</Text>
            </Pressable>
            {isResume || !!title.trim() ? (
              <Pressable onPress={abandonDraft} hitSlop={14}>
                <Text style={styles.abandon}>Abandonner</Text>
              </Pressable>
            ) : null}
          </View>
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
          <Text style={styles.kicker}>
            {isEdit ? 'ÉDITION' : isResume ? 'BROUILLON' : 'CRÉER UN PARCOURS'}
          </Text>
          <Text style={styles.heading}>
            {isEdit
              ? 'Modifier le parcours'
              : isResume
                ? 'Reprendre'
                : 'Nouveau parcours'}
          </Text>
          <Text style={styles.lead}>
            {isEdit
              ? 'Infos et hero — ensuite les lieux, puis enregistre.'
              : isResume
                ? 'Un seul brouillon à la fois — publie ou abandonne pour en créer un autre.'
                : 'Un titre pour le retrouver, une ville pour le situer.'}
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
            <Text style={styles.q}>Photo hero</Text>
            <Pressable
              onPress={() => void pickHero()}
              disabled={pickingCover}
              style={styles.coverWrap}
              accessibilityRole="button"
              accessibilityLabel="Choisir la photo hero"
            >
              <Image source={{ uri: cover }} style={styles.cover} />
              <LinearGradient
                colors={['transparent', 'rgba(18,10,6,0.72)']}
                style={styles.coverGrad}
              />
              <View style={styles.coverActions}>
                {pickingCover ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.coverCta}>
                    {customCover ? 'Changer la photo' : 'Choisir une photo'}
                  </Text>
                )}
              </View>
            </Pressable>
            {customCover ? (
              <Pressable
                onPress={() => setCustomCover(null)}
                hitSlop={8}
                style={styles.resetCover}
              >
                <Text style={styles.resetCoverText}>
                  Revenir à la photo ville
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.coverHint}>
                Par défaut : photo de {cityLabel}. Tu peux en choisir une autre.
              </Text>
            )}

            <View style={styles.line} />
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: spacing.xl,
    minHeight: 36,
  },
  close: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.muted,
  },
  abandon: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.danger,
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
    height: 148,
    borderRadius: radius.lg,
    overflow: 'hidden',
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
  coverActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverCta: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#fff',
    backgroundColor: 'rgba(18,10,6,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    overflow: 'hidden',
  },
  coverHint: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
    lineHeight: 17,
  },
  resetCover: { marginTop: 8, alignSelf: 'flex-start' },
  resetCoverText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: 14,
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
