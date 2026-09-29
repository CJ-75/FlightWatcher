import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { colors, fonts, shadow } from '../theme'

type Props = {
  visible: boolean
  defaultName?: string
  loading?: boolean
  onSave: (name: string) => Promise<void>
  onClose: () => void
}

export function SaveSearchModal({ visible, defaultName, loading, onSave, onClose }: Props) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (visible) {
      setName(defaultName || `Recherche ${new Date().toLocaleDateString('fr-FR')}`)
      setError(null)
    }
  }, [visible, defaultName])

  const submit = async () => {
    if (!name.trim()) {
      setError('Entre un nom pour la recherche')
      return
    }
    try {
      setError(null)
      await onSave(name.trim())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de sauvegarde')
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, shadow.lift]}>
          <Text style={styles.title}>Sauvegarder la recherche</Text>
          <Text style={styles.hint}>Retrouve-la plus tard dans tes recherches sauvegardées.</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nom de la recherche"
            placeholderTextColor={colors.faint}
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Annuler</Text>
            </Pressable>
            <Pressable onPress={() => void submit()} style={styles.saveBtn} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.saveText}>Sauvegarder</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(12,18,34,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 22,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
    includeFontPadding: false,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 6,
    marginBottom: 16,
    includeFontPadding: false,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.canvas,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.danger,
    marginTop: 8,
    includeFontPadding: false,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  cancelText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.inkSoft },
  saveBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  saveText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
})
