import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { getApi } from '../lib/client'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'ItineraryDetail'>

export function ItineraryDetailScreen({ route }: Props) {
  const { itineraryId } = route.params
  const [enabled, setEnabled] = useState(false)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const [draftToken, setDraftToken] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getApi()
      .getConfig()
      .then((c) => setEnabled(c.itineraries_enabled === true))
      .catch(() => setEnabled(false))
  }, [])

  useEffect(() => {
    void getApi()
      .getParcours(itineraryId)
      .then((r) =>
        setDetail((r.itinerary || null) as Record<string, unknown> | null),
      )
      .catch(() => {
        if (!enabled) return
        void getApi()
          .getItinerary(itineraryId)
          .then((r) =>
            setDetail((r.itinerary || null) as Record<string, unknown> | null),
          )
          .catch(() => setDetail(null))
      })
  }, [itineraryId, enabled])

  const items = Array.isArray(detail?.itinerary_items)
    ? (detail!.itinerary_items as Record<string, unknown>[])
    : []

  return (
    <ScreenBackground>
      <View style={styles.pad}>
        <Text style={styles.title}>{String(detail?.title || 'Parcours')}</Text>
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
        {items.map((it) => (
          <Text key={String(it.id)} style={styles.item}>
            {String((it.places as { name?: string } | undefined)?.name || 'Item')}
          </Text>
        ))}
        <TextInput
          style={styles.input}
          placeholder="draft_token pour apply"
          value={draftToken}
          onChangeText={setDraftToken}
          autoCapitalize="none"
        />
        <Pressable
          style={styles.cta}
          onPress={async () => {
            setBusy(true)
            try {
              const res = await getApi().applyItinerary(itineraryId, {
                draft_token: draftToken || undefined,
              })
              setMsg(`Appliqué · ${res.created ?? 0}`)
            } catch (e) {
              setMsg(e instanceof Error ? e.message : 'Erreur')
            } finally {
              setBusy(false)
            }
          }}
        >
          <Text style={styles.ctaText}>Réappliquer</Text>
        </Pressable>
        {msg ? <Text style={styles.muted}>{msg}</Text> : null}
      </View>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  pad: { padding: spacing.xl, gap: 10 },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.ink },
  item: { fontFamily: fonts.medium, color: colors.inkSoft, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    fontFamily: fonts.regular,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontFamily: fonts.bold },
  muted: { fontFamily: fonts.regular, color: colors.muted, padding: spacing.xl },
})
