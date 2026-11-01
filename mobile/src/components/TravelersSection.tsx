import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native'
import type { AddTripMemberRequest, TripMember } from '@flightwatcher/shared'
import { colors, fonts, shadow } from '../theme'

function memberLabel(m: TripMember, currentUserId?: string | null): string {
  if (m.display_name?.trim()) return m.display_name.trim()
  if (m.user_id && currentUserId && m.user_id === currentUserId) return 'Toi'
  if (m.role === 'organizer') return 'Organisateur'
  return 'Voyageur'
}

function initialOf(name: string): string {
  const t = name.trim()
  return t ? t[0]!.toUpperCase() : '?'
}

function sortMembers(list: TripMember[]): TripMember[] {
  return [...list].sort((a, b) => {
    const rank = (m: TripMember) =>
      m.role === 'organizer' ? 0 : m.status === 'joined' ? 1 : 2
    const d = rank(a) - rank(b)
    if (d !== 0) return d
    return (a.joined_at || '').localeCompare(b.joined_at || '')
  })
}

function validEmail(v: string): boolean {
  const e = v.trim().toLowerCase()
  return e.length >= 5 && e.includes('@') && e.includes('.')
}

type Props = {
  members: TripMember[]
  seats: number
  currentUserId?: string | null
  isOrganizer: boolean
  busy?: boolean
  onAdd: (body: AddTripMemberRequest) => Promise<void>
  onRemove: (member: TripMember) => Promise<void>
}

export function TravelersSection({
  members,
  seats,
  currentUserId,
  isOrganizer,
  busy,
  onAdd,
  onRemove,
}: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const sorted = useMemo(() => sortMembers(members || []), [members])
  const count = sorted.length
  const full = count >= 6

  useEffect(() => {
    if (addOpen) {
      setFirstName('')
      setLastName('')
      setEmail('')
      setFormError(null)
    }
  }, [addOpen])

  const submitAdd = async () => {
    const first = firstName.trim()
    const last = lastName.trim()
    const em = email.trim().toLowerCase()
    if (first.length < 1) {
      setFormError('Prénom requis')
      return
    }
    if (!validEmail(em)) {
      setFormError('Email invalide')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await onAdd({ first_name: first, last_name: last || undefined, email: em })
      setAddOpen(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Ajout impossible')
    } finally {
      setSaving(false)
    }
  }

  const confirmRemove = (m: TripMember) => {
    const label = memberLabel(m, currentUserId)
    Alert.alert('Retirer', `Retirer ${label} du voyage ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: () => {
          void onRemove(m).catch((e) =>
            Alert.alert('Erreur', e instanceof Error ? e.message : 'Suppression échouée'),
          )
        },
      },
    ])
  }

  return (
    <View style={[styles.card, shadow.soft]}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>Voyageurs</Text>
          <Text style={styles.seats}>
            {count} / {Math.max(seats, count)} places
          </Text>
        </View>
        {isOrganizer && !full ? (
          <Pressable
            onPress={() => setAddOpen(true)}
            disabled={busy}
            style={[styles.addBtn, busy && { opacity: 0.5 }]}
          >
            <Text style={styles.addBtnText}>+ Ajouter</Text>
          </Pressable>
        ) : null}
        {isOrganizer && full ? (
          <Text style={styles.fullHint}>Complet</Text>
        ) : null}
      </View>

      {!isOrganizer ? (
        <Text style={styles.roleNote}>
          Lecture seule — seul l’organisateur gère la liste.
        </Text>
      ) : (
        <Text style={styles.roleNote}>
          Ajoute un ami (prénom + email). Il pourra rejoindre via le lien ; toi
          tu décides du vol.
        </Text>
      )}

      {sorted.length === 0 ? (
        <Text style={styles.empty}>Aucun voyageur pour l’instant.</Text>
      ) : (
        <View style={styles.list}>
          {sorted.map((m) => {
            const label = memberLabel(m, currentUserId)
            const onApp = m.status === 'joined' && !!m.user_id
            const isOrg = m.role === 'organizer'
            const canRemove = isOrganizer && !isOrg
            return (
              <View key={m.id} style={styles.row}>
                <View
                  style={[
                    styles.avatar,
                    isOrg
                      ? styles.avatarOrg
                      : onApp
                        ? styles.avatarOn
                        : styles.avatarOff,
                  ]}
                >
                  <Text style={styles.avatarText}>{initialOf(label)}</Text>
                </View>
                <View style={styles.meta}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {label}
                    </Text>
                    {isOrg ? (
                      <View style={styles.badgeOrg}>
                        <Text style={styles.badgeOrgText}>Organisateur</Text>
                      </View>
                    ) : null}
                  </View>
                  <View
                    style={[styles.pill, onApp ? styles.pillOn : styles.pillOff]}
                  >
                    <View
                      style={[styles.dot, onApp ? styles.dotOn : styles.dotOff]}
                    />
                    <Text
                      style={[
                        styles.pillText,
                        onApp ? styles.pillTextOn : styles.pillTextOff,
                      ]}
                    >
                      {onApp ? 'Sur l’app' : 'Hors app'}
                    </Text>
                  </View>
                </View>
                {canRemove ? (
                  <Pressable
                    onPress={() => confirmRemove(m)}
                    disabled={busy}
                    hitSlop={10}
                    style={styles.removeBtn}
                  >
                    <Text style={styles.removeText}>Retirer</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          })}
        </View>
      )}

      <Modal
        visible={addOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddOpen(false)} />
          <View style={[styles.modalCard, shadow.lift]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Nouveau voyageur</Text>
              <Text style={styles.modalHint}>
                Prénom + email suffisent. Quand il rejoindra via le lien, son
                statut passera sur l’app.
              </Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Prénom"
                placeholderTextColor={colors.faint}
                autoFocus
                maxLength={40}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Nom (optionnel)"
                placeholderTextColor={colors.faint}
                maxLength={40}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={colors.faint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={120}
                returnKeyType="done"
                onSubmitEditing={() => void submitAdd()}
              />
              {formError ? <Text style={styles.formError}>{formError}</Text> : null}
              <View style={styles.modalActions}>
                <Pressable onPress={() => setAddOpen(false)} style={styles.cancelBtn}>
                  <Text style={styles.cancelText}>Annuler</Text>
                </Pressable>
                <Pressable
                  onPress={() => void submitAdd()}
                  style={styles.saveBtn}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.saveText}>Ajouter</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  seats: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  roleNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  addBtn: {
    backgroundColor: colors.primarySoft || '#FFF3E8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  addBtnText: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryInk },
  fullHint: { fontFamily: fonts.semibold, fontSize: 12, color: colors.faint },
  empty: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOrg: { backgroundColor: colors.primarySoft },
  avatarOn: { backgroundColor: colors.successSoft },
  avatarOff: { backgroundColor: colors.canvas },
  avatarText: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  meta: { flex: 1, gap: 4, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, flexShrink: 1 },
  badgeOrg: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeOrgText: { fontFamily: fonts.bold, fontSize: 10, color: colors.primaryInk },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillOn: { backgroundColor: colors.successSoft },
  pillOff: { backgroundColor: colors.canvas },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOn: { backgroundColor: colors.success },
  dotOff: { backgroundColor: colors.faint },
  pillText: { fontFamily: fonts.medium, fontSize: 11 },
  pillTextOn: { color: colors.success },
  pillTextOff: { color: colors.muted },
  removeBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  removeText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.danger },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 22,
    gap: 12,
    maxHeight: '85%',
  },
  modalTitle: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  modalHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.canvas,
    marginBottom: 8,
  },
  formError: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: colors.canvas,
  },
  cancelText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.muted },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  saveText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
})
