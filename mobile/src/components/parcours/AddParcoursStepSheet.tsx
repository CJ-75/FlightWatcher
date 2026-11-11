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
}

type Props = {
  visible: boolean
  initial?: DraftStep | null
  onClose: () => void
  onSave: (step: DraftStep) => void
}

const MOMENTS: { id: NonNullable<DraftStep['moment']>; label: string }[] = [
  { id: 'morning', label: 'Matin' },
  { id: 'afternoon', label: 'Midi' },
  { id: 'evening', label: 'Soir' },
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

  useEffect(() => {
    if (!visible) return
    const base = initial
      ? { ...initial, photos: [...(initial.photos || [])] }
      : emptyStep()
    setStep(base)
    setMapsInput(base.maps_url || '')
    setHint(null)
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
      setHint(name ? `Lieu : ${name}` : 'Lien Maps enregistré')
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setParsing(false)
    }
  }

  const pickPhotos = async () => {
    if (step.photos.length >= 5) {
      setHint('Max 5 photos')
      return
    }
    setPicking(true)
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Photos', 'Autorise l’accès à la galerie pour ajouter des images.')
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
      setHint(e instanceof Error ? e.message : 'Impossible d’ouvrir la galerie')
    } finally {
      setPicking(false)
    }
  }

  const submit = () => {
    const title = step.title.trim()
    if (!title) {
      setHint('Ajoute un titre')
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
            <View>
              <Text style={styles.kicker}>ÉTAPE</Text>
              <Text style={styles.title}>
                {initial ? 'Modifier' : 'Ajouter'}
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
            <View style={[styles.panel, shadow.soft]}>
              <Text style={styles.fieldLabel}>Titre</Text>
              <TextInput
                value={step.title}
                onChangeText={(t) => patch({ title: t })}
                placeholder="Café, musée, balade…"
                placeholderTextColor={colors.faint}
                style={styles.input}
              />

              <View style={styles.line} />

              <Text style={styles.fieldLabel}>Petite description</Text>
              <TextInput
                value={step.note}
                onChangeText={(t) => patch({ note: t })}
                placeholder="Une phrase pour le voyageur"
                placeholderTextColor={colors.faint}
                multiline
                style={[styles.input, styles.desc]}
              />

              <View style={styles.line} />

              <Text style={styles.fieldLabel}>Google Maps</Text>
              <TextInput
                value={mapsInput}
                onChangeText={setMapsInput}
                onEndEditing={() => void parseMaps()}
                placeholder="Colle le lien Maps"
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              {parsing ? (
                <ActivityIndicator
                  color={colors.primary}
                  style={{ marginBottom: 10, alignSelf: 'flex-start' }}
                />
              ) : hint ? (
                <Text style={styles.hint}>{hint}</Text>
              ) : null}
            </View>

            <Text style={styles.section}>Photos</Text>
            <Pressable
              onPress={() => void pickPhotos()}
              disabled={picking}
              style={[styles.photoBtn, shadow.soft]}
            >
              {picking ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.photoBtnText}>
                  {step.photos.length
                    ? `Ajouter des photos (${step.photos.length}/5)`
                    : 'Ajouter des photos'}
                </Text>
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
                  >
                    <Image source={{ uri }} style={styles.thumb} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <Text style={styles.section}>Quand</Text>
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
              {initial ? 'Enregistrer' : 'Ajouter l’étape'}
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
    backgroundColor: 'rgba(26,18,14,0.42)',
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    maxHeight: '92%',
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
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.primary,
    marginBottom: 2,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    letterSpacing: -0.8,
    color: colors.ink,
  },
  close: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.muted,
    marginTop: 6,
  },
  form: { paddingBottom: 18 },
  panel: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  fieldLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
  },
  input: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
    paddingVertical: 12,
  },
  desc: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  hint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primaryDeep,
    paddingBottom: 10,
  },
  section: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
    marginTop: 18,
    marginBottom: 10,
  },
  photoBtn: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  photoBtnText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 14,
    marginRight: 8,
    backgroundColor: colors.primaryMuted,
  },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  seg: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
  },
  segOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  segText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
  },
  segTextOn: { color: '#FFF8F3' },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 16, color: '#fff' },
})
