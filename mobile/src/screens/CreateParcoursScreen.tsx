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
  ImageBackground,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  canCreateParcours,
  cityImageUrl,
  citySlugDisplayNameFr,
  type ItineraryBudgetBasis,
} from '@flightwatcher/shared'
import { ActivityCityPicker } from '../components/ActivityCityPicker'
import { CreateFlowProgress } from '../components/parcours/CreateFlowProgress'
import { ScreenBackground } from '../components/ScreenBackground'
import { tabScreenHeaderStyles } from '../components/TabScreenHeader'
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
  const [citySlug, setCitySlug] = useState('paris')
  const [cityLabel, setCityLabel] = useState('Paris')
  const [budgetEur, setBudgetEur] = useState('')
  const [budgetBasis, setBudgetBasis] = useState<ItineraryBudgetBasis>('for_two')
  const [loading, setLoading] = useState(!!itineraryId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cover = useMemo(
    () => cityImageUrl(cityLabel || citySlugDisplayNameFr(citySlug) || citySlug),
    [cityLabel, citySlug],
  )

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
        setTitle(String(it.title || ''))
        const slug = String(it.city_slug || 'paris')
        setCitySlug(slug)
        setCityLabel(citySlugDisplayNameFr(slug) || slug)
        const bud = it.budget_estimate_eur
        setBudgetEur(
          typeof bud === 'number' && Number.isFinite(bud) ? String(bud) : '',
        )
        const basis = it.budget_basis
        if (basis === 'for_two' || basis === 'per_person') {
          setBudgetBasis(basis)
        }
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

  const continueToSteps = useCallback(async () => {
    if (!citySlug.trim()) {
      setError('Choisis une ville')
      return
    }
    const t = title.trim()
    if (!t) {
      setError('Ajoute un titre')
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
      const budgetNum = budgetEur.trim()
        ? Number(budgetEur.replace(',', '.'))
        : null
      if (
        budgetEur.trim() &&
        (budgetNum == null || !Number.isFinite(budgetNum) || budgetNum < 0)
      ) {
        setError('Budget invalide')
        setSaving(false)
        return
      }
      const patch = await getApi().adminUpdateParcours(id, {
        title: t,
        city_slug: citySlug,
        cover_image: cover,
        budget_estimate_eur: budgetNum,
        budget_basis: budgetNum != null ? budgetBasis : null,
      })
      if (!patch.ok) throw new Error(patch.error || 'Enregistrement impossible')
      navigation.replace('CreateParcoursSteps', { itineraryId: id })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }, [title, cover, itineraryId, citySlug, budgetEur, budgetBasis, navigation])

  if (!allowed) return null

  return (
    <View style={styles.root}>
      <ScreenBackground />

      {/* Soft atmosphere — not a dominant hero */}
      <ImageBackground source={{ uri: cover }} style={styles.ambient} imageStyle={styles.ambientImg}>
        <LinearGradient
          colors={['rgba(255,236,224,0.15)', 'rgba(255,249,245,0.92)', colors.canvas]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.xl }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={14}>
            <Text style={styles.close}>Fermer</Text>
          </Pressable>
        </View>
      </ImageBackground>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 120,
            marginTop: -28,
          }}
        >
          <CreateFlowProgress step={1} />
          <Text style={tabScreenHeaderStyles.kicker}>PARCOURS</Text>
          <Text style={tabScreenHeaderStyles.title}>
            {itineraryId ? 'Modifier' : 'Nouveau parcours'}
          </Text>
          <Text style={[tabScreenHeaderStyles.subtitle, styles.lead]}>
            Ville, titre et budget sur place.
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={[styles.panel, shadow.soft]}>
              <Text style={styles.label}>Ville</Text>
              <ActivityCityPicker
                valueSlug={citySlug}
                valueLabel={cityLabel}
                onChange={(city) => {
                  setCitySlug(city.slug || 'paris')
                  setCityLabel(city.label || city.slug || 'Paris')
                }}
              />

              <View style={styles.sep} />

              <Text style={styles.label}>Titre</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Ex. Week-end à Lyon"
                placeholderTextColor={colors.faint}
                style={styles.titleInput}
              />

              <View style={styles.sep} />

              <Text style={styles.label}>Budget sur place</Text>
              <View style={styles.budgetRow}>
                <View style={styles.budgetInputWrap}>
                  <TextInput
                    value={budgetEur}
                    onChangeText={setBudgetEur}
                    placeholder="120"
                    placeholderTextColor={colors.faint}
                    keyboardType="decimal-pad"
                    style={styles.budgetInput}
                  />
                  <Text style={styles.budgetSuffix}>€</Text>
                </View>
                <View style={styles.basisRow}>
                  {(
                    [
                      { id: 'for_two' as const, label: 'Pour 2' },
                      { id: 'per_person' as const, label: 'Par pers.' },
                    ] as const
                  ).map((b) => {
                    const on = budgetBasis === b.id
                    return (
                      <Pressable
                        key={b.id}
                        onPress={() => setBudgetBasis(b.id)}
                        style={[styles.basisChip, on && styles.basisChipOn]}
                      >
                        <Text
                          style={[styles.basisText, on && styles.basisTextOn]}
                        >
                          {b.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
              <Text style={styles.budgetHint}>Optionnel — affiché sur la fiche</Text>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            onPress={() => void continueToSteps()}
            disabled={saving || loading}
            style={({ pressed }) => [
              styles.cta,
              shadow.lift,
              (saving || loading) && { opacity: 0.7 },
              pressed && { transform: [{ scale: 0.985 }] },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Continuer → étapes</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  ambient: {
    height: 148,
    width: '100%',
  },
  ambientImg: { resizeMode: 'cover' },
  close: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  lead: { marginBottom: 20 },
  panel: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.xl,
    padding: 18,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: 18,
  },
  titleInput: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: colors.ink,
    paddingVertical: 4,
  },
  budgetRow: {
    gap: 12,
  },
  budgetInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  budgetInput: {
    flex: 1,
    fontFamily: fonts.extrabold,
    fontSize: 24,
    letterSpacing: -0.5,
    color: colors.ink,
    paddingVertical: 10,
  },
  budgetSuffix: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.muted,
  },
  basisRow: {
    flexDirection: 'row',
    gap: 8,
  },
  basisChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    alignItems: 'center',
  },
  basisChipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  basisText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
  },
  basisTextOn: { color: '#FFF8F3' },
  budgetHint: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.faint,
    marginTop: 10,
  },
  error: {
    marginTop: 16,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.danger,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 17,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: '#fff',
  },
})
