import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { InvitePreview } from '@flightwatcher/shared'
import { cityDisplayNameFr, parseAirportCodes } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'PlannerInvite'>

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  const s = String(dateStr).slice(0, 10)
  return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

function routeLabel(value?: string | null): string {
  const codes = parseAirportCodes(value || '')
  if (!codes.length) return value || '—'
  const cities = [...new Set(codes.map((c) => cityDisplayNameFr(c)))]
  if (cities.length === 1) {
    return codes.length > 1 ? `${cities[0]} · ${codes.join(' · ')}` : `${cities[0]} · ${codes[0]}`
  }
  return codes.map((c) => `${cityDisplayNameFr(c)} (${c})`).join(' · ')
}

export function PlannerInviteScreen({ route, navigation }: Props) {
  const { token } = route.params
  const insets = useSafeAreaInsets()
  const { user, isGuest } = useAuth()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const load = useCallback(async () => {
    if (!token) {
      setError('Lien invalide')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await getApi().getInvitePreview(token)
      setPreview(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invitation introuvable')
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const join = async () => {
    if (!token) return
    if (!user || isGuest) {
      setError('Connecte-toi pour rejoindre ce voyage')
      return
    }
    setJoining(true)
    setError(null)
    try {
      const res = await getApi().joinInvite(token)
      navigation.replace('TripDetail', { tripId: res.trip_id })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de rejoindre')
    } finally {
      setJoining(false)
    }
  }

  const outStr = preview?.dates_depart?.[0]?.date || ''
  const innStr = preview?.dates_retour?.[0]?.date || ''

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: 16,
          paddingBottom: insets.bottom + 40,
        }}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : error && !preview ? (
          <View style={[styles.card, shadow.soft]}>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.btn} onPress={() => void load()}>
              <Text style={styles.btnText}>Réessayer</Text>
            </Pressable>
          </View>
        ) : preview ? (
          <View style={[styles.card, shadow.soft]}>
            <Text style={styles.kicker}>Invitation</Text>
            <Text style={styles.name}>{preview.name}</Text>
            <Text style={styles.meta}>
              {routeLabel(preview.departure_airport)}
              {preview.arrival_airport
                ? ` → ${routeLabel(preview.arrival_airport)}`
                : ' → destination ouverte'}
            </Text>
            <Text style={styles.meta}>
              {formatDate(outStr)} → {formatDate(innStr)} · {preview.passengers}{' '}
              pers. · max {preview.budget_max} €/pers
            </Text>
            {preview.organizer_name ? (
              <Text style={styles.org}>Organisé par {preview.organizer_name}</Text>
            ) : (
              <Text style={styles.org}>Organisé avec FlightWatcher</Text>
            )}
            {preview.members_count != null ? (
              <Text style={styles.meta}>{preview.members_count} participant(s)</Text>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!user || isGuest ? (
              <Text style={styles.loginHint}>
                Connecte-toi (Profil) pour rejoindre ce voyage.
              </Text>
            ) : null}
            <Pressable
              style={[styles.btn, joining && styles.btnDisabled]}
              onPress={() => void join()}
              disabled={joining}
            >
              <Text style={styles.btnText}>
                {joining ? '…' : 'Rejoindre le voyage'}
              </Text>
            </Pressable>
            {(!user || isGuest) && (
              <Pressable
                style={styles.later}
                onPress={() => navigation.navigate('Main', { screen: 'Profile' })}
              >
                <Text style={styles.laterText}>Se connecter dans Profil</Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  card: {
    marginTop: 4,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 22,
    gap: 10,
  },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  name: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink, letterSpacing: -0.5 },
  meta: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  org: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkSoft },
  loginHint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primaryInk,
    lineHeight: 18,
  },
  error: { fontFamily: fonts.medium, fontSize: 14, color: '#B91C1C' },
  btn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  later: { paddingVertical: 10, alignItems: 'center' },
  laterText: { fontFamily: fonts.medium, fontSize: 14, color: colors.primary },
})
