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
import { LinearGradient } from 'expo-linear-gradient'
import type { AddTripMemberRequest, TripMember } from '@flightwatcher/shared'
import {
  partyModeFromCount,
  partyModeKickerFr,
  partyModeSubtitleFr,
  partyModeTitleFr,
} from '@flightwatcher/shared'
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
  const seatTotal = Math.min(6, Math.max(seats, count, 1))
  const progress = Math.min(100, Math.round((count / seatTotal) * 100))
  const partyMode = partyModeFromCount(Math.max(seatTotal, count, 1))
  const partyTitle = partyModeTitleFr(partyMode)
  const partyKicker = partyModeKickerFr(partyMode)
  const partySubtitle = partyModeSubtitleFr(partyMode)

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
      <LinearGradient
        colors={['#151D2A', '#27202A', '#6B2A16']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerHero}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.headerKicker}>{partyKicker.toUpperCase()}</Text>
            <Text style={styles.title}>{partyTitle}</Text>
            <Text style={styles.seats}>
              {count} / {seatTotal} places
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
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </LinearGradient>

      {!isOrganizer ? (
        <Text style={styles.roleNote}>
          Lecture seule — seul l’organisateur gère la liste.
        </Text>
      ) : (
        <Text style={styles.roleNote}>
          {partyMode === 'solo'
            ? partySubtitle
            : 'Ajoute un ami (prénom + email). Il pourra rejoindre via le lien ; toi tu décides du vol.'}
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
    backgroundColor: '#FFFCF9',
    borderRadius: 24,
    padding: 14,
    gap: 14,
  },
  headerHero: { borderRadius: 19, padding: 16, gap: 14, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerKicker: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1.3, color: '#FDBA8C' },
  title: { fontFamily: fonts.extrabold, fontSize: 19, color: colors.white },
  seats: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.62)' },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressFill: { height: 7, borderRadius: 999, backgroundColor: '#FF8A5B' },
  roleNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  addBtn: {
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnText: { fontFamily: fonts.bold, fontSize: 12, color: colors.primaryDeep },
  fullHint: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white },
  empty: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.primarySoft,
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
