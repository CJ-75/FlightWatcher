import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getApi } from '../../lib/client'
import { colors, fonts, radius, shadow, spacing } from '../../theme'

export type DraftStep = {
  localId: string
  kind: 'free' | 'place'
  title: string
  note: string
  day_offset: number
  moment: 'morning' | 'afternoon' | 'evening' | null
  photo: string | null
  photos: string[]
  maps_url: string
  lat: number | null
  lng: number | null
  /** € for this step — 0 = gratuit, null = non renseigné */
  budget_eur: number | null
}

type Props = {
  visible: boolean
  initial?: DraftStep | null
  onClose: () => void
  onSave: (step: DraftStep) => void
}

const MOMENTS: { id: NonNullable<DraftStep['moment']>; label: string }[] = [
  { id: 'morning', label: 'Matin' },
  { id: 'afternoon', label: 'Après-midi' },
  { id: 'evening', label: 'Soir' },
]

const BUDGET_CHIPS: { label: string; value: number }[] = [
  { label: 'Gratuit', value: 0 },
  { label: '15 €', value: 15 },
  { label: '30 €', value: 30 },
  { label: '50 €', value: 50 },
]

function emptyStep(): DraftStep {
  return {
    localId: `tmp-${Date.now()}`,
    kind: 'free',
    title: '',
    note: '',
    day_offset: 0,
    moment: 'afternoon',
    photo: null,
    photos: [],
    maps_url: '',
    lat: null,
    lng: null,
    budget_eur: 0,
  }
}

export function AddParcoursStepSheet({
  visible,
  initial,
  onClose,
  onSave,
}: Props) {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<DraftStep>(emptyStep)
  const [mapsInput, setMapsInput] = useState('')
  const [parsing, setParsing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [whenOpen, setWhenOpen] = useState(false)
  const [budgetCustom, setBudgetCustom] = useState('')

  useEffect(() => {
    if (!visible) return
    const base = initial
      ? {
          ...initial,
          photos: [...(initial.photos || [])],
          budget_eur:
            typeof initial.budget_eur === 'number' ? initial.budget_eur : 0,
        }
      : emptyStep()
    setStep(base)
    setMapsInput(base.maps_url || '')
    setHint(null)
    setWhenOpen(!!initial)
    const preset = BUDGET_CHIPS.some((c) => c.value === base.budget_eur)
    setBudgetCustom(
      typeof base.budget_eur === 'number' && !preset && base.budget_eur > 0
        ? String(base.budget_eur)
        : '',
    )
  }, [visible, initial])

  const patch = useCallback((p: Partial<DraftStep>) => {
    setStep((s) => ({ ...s, ...p }))
  }, [])

  const parseMaps = async () => {
    const url = mapsInput.trim()
    if (!url) return
    setParsing(true)
    setHint(null)
    try {
      const res = await getApi().adminParseMapsUrl(url)
      if (!res.ok) throw new Error('Lien Maps non reconnu')
      const p = res.parsed || {}
      const name = (p.name || '').trim()
      patch({
        maps_url: p.url_clean || url,
        lat: typeof p.lat === 'number' ? p.lat : null,
        lng: typeof p.lng === 'number' ? p.lng : null,
        title: step.title.trim() || name || step.title,
        kind: 'free',
      })
      setHint(name ? `Lieu trouvé : ${name}` : 'Lien enregistré')
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setParsing(false)
    }
  }

  const pickPhotos = async () => {
    if (step.photos.length >= 5) {
      setHint('Maximum 5 photos')
      return
    }
    setPicking(true)
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(
          'Photos',
          'Autorise l’accès à la galerie pour illustrer ce lieu.',
        )
        return
      }
      const remaining = 5 - step.photos.length
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.85,
      })
      if (result.canceled || !result.assets?.length) return
      const uris = result.assets.map((a) => a.uri).filter(Boolean)
      const photos = [...step.photos, ...uris].slice(0, 5)
      patch({ photos, photo: photos[0] || null })
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'Galerie indisponible')
    } finally {
      setPicking(false)
    }
  }

  const submit = () => {
    const title = step.title.trim()
    if (!title) {
      setHint('Donne un nom à ce lieu')
      return
    }
    onSave({
      ...step,
      title,
      maps_url: mapsInput.trim() || step.maps_url,
      note: step.note.trim(),
      photo: step.photos[0] || step.photo,
    })
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.kicker}>UN LIEU</Text>
              <Text style={styles.title}>
                {initial ? 'Retoucher' : 'Ajouter au parcours'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Fermer</Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.form}
          >
            {/* 1. Maps first — magical entry */}
            <View style={[styles.block, shadow.soft]}>
              <Text style={styles.blockTitle}>Colle le lien Google Maps</Text>
              <Text style={styles.blockHint}>
                Pour remplir le nom et la position.
              </Text>
              <TextInput
                value={mapsInput}
                onChangeText={setMapsInput}
                onEndEditing={() => void parseMaps()}
                placeholder="https://maps.app.goo.gl/…"
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.mapsInput}
              />
              <Pressable
                onPress={() => void parseMaps()}
                disabled={parsing || !mapsInput.trim()}
                style={styles.parseLink}
              >
                {parsing ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Text style={styles.parseLinkText}>Lire le lien</Text>
                )}
              </Pressable>
              {hint ? <Text style={styles.hint}>{hint}</Text> : null}
            </View>

            {/* 2. Identity */}
            <View style={[styles.block, shadow.soft]}>
              <Text style={styles.fieldLabel}>Nom du lieu</Text>
              <TextInput
                value={step.title}
                onChangeText={(t) => patch({ title: t })}
                placeholder="Café, musée, belvédère…"
                placeholderTextColor={colors.faint}
                style={styles.titleInput}
              />
              <View style={styles.line} />
              <Text style={styles.fieldLabel}>Note</Text>
              <TextInput
                value={step.note}
                onChangeText={(t) => patch({ note: t })}
                placeholder="Info utile (horaires, conseil…)"
                placeholderTextColor={colors.faint}
                multiline
                style={styles.noteInput}
              />
              <View style={styles.line} />
              <Text style={styles.fieldLabel}>Budget</Text>
              <View style={styles.budgetChips}>
                {BUDGET_CHIPS.map((c) => {
                  const on = step.budget_eur === c.value && !budgetCustom
                  return (
                    <Pressable
                      key={c.label}
                      onPress={() => {
                        setBudgetCustom('')
                        patch({ budget_eur: c.value })
                      }}
                      style={[styles.budgetChip, on && styles.budgetChipOn]}
                    >
                      <Text
                        style={[
                          styles.budgetChipText,
                          on && styles.budgetChipTextOn,
                        ]}
                      >
                        {c.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <View style={styles.budgetCustomRow}>
                <TextInput
                  value={budgetCustom}
                  onChangeText={(v) => {
                    setBudgetCustom(v)
                    const n = Number(v.replace(',', '.'))
                    if (v.trim() && Number.isFinite(n) && n >= 0) {
                      patch({ budget_eur: n })
                    }
                  }}
                  placeholder="Autre €"
                  placeholderTextColor={colors.faint}
                  keyboardType="decimal-pad"
                  style={styles.budgetCustomInput}
                />
              </View>
            </View>

            {/* 3. Photos */}
            <Text style={styles.section}>Photos du lieu</Text>
            <Pressable
              onPress={() => void pickPhotos()}
              disabled={picking}
              style={[styles.photoCta, shadow.soft]}
            >
              {picking ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Text style={styles.photoCtaTitle}>
                    {step.photos.length
                      ? `Ajouter encore (${step.photos.length}/5)`
                      : 'Choisir dans la galerie'}
                  </Text>
                  <Text style={styles.photoCtaSub}>Jusqu’à 5 images</Text>
                </>
              )}
            </Pressable>
            {step.photos.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 12 }}
              >
                {step.photos.map((uri, i) => (
                  <Pressable
                    key={`${uri}-${i}`}
                    onPress={() => {
                      const photos = step.photos.filter((_, j) => j !== i)
                      patch({ photos, photo: photos[0] || null })
                    }}
                    style={styles.thumbWrap}
                  >
                    <Image source={{ uri }} style={styles.thumb} />
                    <View style={styles.thumbX}>
                      <Text style={styles.thumbXText}>×</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {/* 4. When — progressive */}
            <Pressable
              onPress={() => setWhenOpen((v) => !v)}
              style={styles.whenToggle}
            >
              <Text style={styles.whenToggleText}>
                {whenOpen ? 'Masquer le moment' : 'Placer dans le parcours (jour / moment)'}
              </Text>
            </Pressable>
            {whenOpen ? (
              <>
                <View style={styles.segRow}>
                  {[0, 1, 2].map((d) => {
                    const on = step.day_offset === d
                    return (
                      <Pressable
                        key={d}
                        onPress={() => patch({ day_offset: d })}
                        style={[styles.seg, on && styles.segOn]}
                      >
                        <Text style={[styles.segText, on && styles.segTextOn]}>
                          Jour {d + 1}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
                <View style={styles.segRow}>
                  {MOMENTS.map((m) => {
                    const on = step.moment === m.id
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => patch({ moment: m.id })}
                        style={[styles.seg, on && styles.segOn]}
                      >
                        <Text style={[styles.segText, on && styles.segTextOn]}>
                          {m.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </>
            ) : null}
          </ScrollView>

          <Pressable
            onPress={submit}
            style={({ pressed }) => [
              styles.cta,
              shadow.lift,
              pressed && { transform: [{ scale: 0.985 }] },
            ]}
          >
            <Text style={styles.ctaText}>
              {initial ? 'Enregistrer' : 'Ajouter au parcours'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,18,14,0.45)',
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    maxHeight: '94%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: 14,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.1,
    color: colors.primary,
    marginBottom: 2,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: colors.ink,
  },
  close: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
  },
  form: { paddingBottom: 16 },
  block: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: 14,
    marginBottom: 10,
  },
  blockTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  blockHint: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
    marginBottom: 10,
    lineHeight: 17,
  },
  mapsInput: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  parseLink: { alignSelf: 'flex-start', marginTop: 10, minHeight: 22 },
  parseLinkText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primary,
  },
  hint: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primaryDeep,
    marginTop: 8,
  },
  fieldLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
    marginBottom: 4,
  },
  titleInput: {
    fontFamily: fonts.extrabold,
    fontSize: 17,
    letterSpacing: -0.3,
    color: colors.ink,
    paddingVertical: 6,
  },
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: 8,
  },
  noteInput: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
    minHeight: 60,
    textAlignVertical: 'top',
    paddingVertical: 6,
  },
  budgetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 8,
  },
  budgetChip: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  budgetChipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  budgetChipText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.ink,
  },
  budgetChipTextOn: { color: '#FFF8F3' },
  budgetCustomRow: { marginTop: 8 },
  budgetCustomInput: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  section: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
    marginBottom: 8,
  },
  photoCta: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  photoCtaTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  photoCtaSub: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  thumbWrap: { marginRight: 10, position: 'relative' },
  thumb: {
    width: 68,
    height: 68,
    borderRadius: 14,
    backgroundColor: colors.primaryMuted,
  },
  thumbX: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(26,18,14,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbXText: { color: '#fff', fontSize: 13, fontFamily: fonts.bold, marginTop: -1 },
  whenToggle: { marginTop: 14, marginBottom: 8 },
  whenToggleText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryDeep,
  },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8 },
  seg: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
  },
  segOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  segText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
  segTextOn: { color: '#FFF8F3' },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 15, color: '#fff' },
})
