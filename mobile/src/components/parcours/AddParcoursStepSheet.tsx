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
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getApi } from '../../lib/client'
import { colors, fonts, radius, spacing } from '../../theme'

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
  { id: 'afternoon', label: 'Après-midi' },
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
  const [photoUrl, setPhotoUrl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseHint, setParseHint] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    const base = initial ? { ...initial, photos: [...(initial.photos || [])] } : emptyStep()
    setStep(base)
    setMapsInput(base.maps_url || '')
    setPhotoUrl('')
    setParseHint(null)
  }, [visible, initial])

  const patch = useCallback((p: Partial<DraftStep>) => {
    setStep((s) => ({ ...s, ...p }))
  }, [])

  const parseMaps = async () => {
    const url = mapsInput.trim()
    if (!url) {
      setParseHint('Colle un lien Google Maps')
      return
    }
    setParsing(true)
    setParseHint(null)
    try {
      const res = await getApi().adminParseMapsUrl(url)
      if (!res.ok) throw new Error('Parse impossible')
      const p = res.parsed || {}
      const name = (p.name || '').trim()
      patch({
        maps_url: p.url_clean || url,
        lat: typeof p.lat === 'number' ? p.lat : null,
        lng: typeof p.lng === 'number' ? p.lng : null,
        title: step.title.trim() || name || step.title,
        kind: 'free',
      })
      setParseHint(
        name
          ? `Lieu détecté : ${name}`
          : p.lat != null
            ? 'Coords détectées'
            : 'Lien enregistré (nom non trouvé)',
      )
    } catch (e) {
      setParseHint(e instanceof Error ? e.message : 'Erreur parse')
    } finally {
      setParsing(false)
    }
  }

  const addPhoto = () => {
    const u = photoUrl.trim()
    if (!u) return
    if (step.photos.length >= 5) {
      setParseHint('Max 5 photos')
      return
    }
    const photos = [...step.photos, u].slice(0, 5)
    patch({ photos, photo: photos[0] || null })
    setPhotoUrl('')
  }

  const removePhoto = (idx: number) => {
    const photos = step.photos.filter((_, i) => i !== idx)
    patch({ photos, photo: photos[0] || null })
  }

  const submit = () => {
    const title = step.title.trim()
    if (!title) {
      setParseHint('Titre requis')
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
          <Text style={styles.title}>
            {initial ? 'Modifier l’étape' : 'Ajouter une étape'}
          </Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 14, paddingBottom: 24 }}
          >
            <Text style={styles.label}>Titre</Text>
            <TextInput
              value={step.title}
              onChangeText={(t) => patch({ title: t })}
              placeholder="Café, musée, balade…"
              placeholderTextColor={colors.faint}
              style={styles.input}
            />

            <Text style={styles.label}>Lien Google Maps</Text>
            <View style={styles.row}>
              <TextInput
                value={mapsInput}
                onChangeText={setMapsInput}
                placeholder="https://maps.app.goo.gl/…"
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { flex: 1 }]}
              />
              <Pressable onPress={() => void parseMaps()} style={styles.parseBtn}>
                {parsing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.parseBtnText}>Parse</Text>
                )}
              </Pressable>
            </View>
            {parseHint ? <Text style={styles.hint}>{parseHint}</Text> : null}

            <Text style={styles.label}>Jour</Text>
            <View style={styles.chips}>
              {[0, 1, 2].map((d) => (
                <Pressable
                  key={d}
                  onPress={() => patch({ day_offset: d })}
                  style={[styles.chip, step.day_offset === d && styles.chipOn]}
                >
                  <Text
                    style={[styles.chipText, step.day_offset === d && styles.chipTextOn]}
                  >
                    Jour {d + 1}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Moment</Text>
            <View style={styles.chips}>
              {MOMENTS.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => patch({ moment: m.id })}
                  style={[styles.chip, step.moment === m.id && styles.chipOn]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      step.moment === m.id && styles.chipTextOn,
                    ]}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Mini-galerie (0–5)</Text>
            <View style={styles.row}>
              <TextInput
                value={photoUrl}
                onChangeText={setPhotoUrl}
                placeholder="URL photo"
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                style={[styles.input, { flex: 1 }]}
              />
              <Pressable onPress={addPhoto} style={styles.parseBtn}>
                <Text style={styles.parseBtnText}>+</Text>
              </Pressable>
            </View>
            {step.photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {step.photos.map((uri, i) => (
                  <Pressable key={`${uri}-${i}`} onPress={() => removePhoto(i)}>
                    <Image source={{ uri }} style={styles.thumb} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <Text style={styles.label}>Note (optionnel)</Text>
            <TextInput
              value={step.note}
              onChangeText={(t) => patch({ note: t })}
              placeholder="Astuce, horaires…"
              placeholderTextColor={colors.faint}
              multiline
              style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
            />
          </ScrollView>

          <Pressable onPress={submit} style={styles.cta}>
            <Text style={styles.ctaText}>Enregistrer l’étape</Text>
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
    backgroundColor: '#FFF8F3',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: 12,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    marginBottom: 12,
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
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  parseBtn: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 64,
    alignItems: 'center',
  },
  parseBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#fff',
  },
  hint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primaryDeep,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  chipTextOn: { color: '#F5EFEA' },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: colors.primaryMuted,
  },
  cta: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 16, color: '#fff' },
})
