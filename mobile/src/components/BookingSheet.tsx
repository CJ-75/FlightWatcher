import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Modal, Linking, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EnrichedTripResponse } from '@flightwatcher/shared'
import { buildRyanairBookingUrl } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { colors, fonts, shadow } from '../theme'

type Props = {
  trip: EnrichedTripResponse | null
  passengers?: number
  searchEventId?: string | null
  onClose: () => void
  onSaveFavorite?: () => void
}

const DELAY = 3

export function BookingSheet({
  trip,
  passengers = 1,
  searchEventId,
  onClose,
  onSaveFavorite,
}: Props) {
  const insets = useSafeAreaInsets()
  const [countdown, setCountdown] = useState(DELAY)
  const [redirecting, setRedirecting] = useState(false)
  const tracked = useRef(false)

  useEffect(() => {
    if (!trip) {
      setCountdown(DELAY)
      setRedirecting(false)
      tracked.current = false
      return
    }
    setCountdown(DELAY)
    tracked.current = false
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id)
          void redirect()
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip])

  const redirect = async () => {
    if (!trip || tracked.current) return
    tracked.current = true
    setRedirecting(true)
    const url = buildRyanairBookingUrl(trip, passengers)
    void getApi()
      .trackBookingSasEvent({
        trip,
        partner_id: 'ryanair',
        partner_name: 'Ryanair',
        redirect_url: url,
        source: 'mobile',
        search_event_id: searchEventId || undefined,
      })
      .catch(() => undefined)
    try {
      await Linking.openURL(url)
    } finally {
      onClose()
    }
  }

  if (!trip) return null

  const city = trip.aller.destinationFull?.split(',')[0]?.trim() || trip.destination_code

  return (
    <Modal visible={!!trip} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, shadow.lift, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Réserver {city}</Text>
        <Text style={styles.sub}>
          {Math.round(trip.prix_total)}€ / pers.
          {passengers > 1 ? ` · ${Math.round(trip.prix_total * passengers)}€ pour ${passengers}` : ''}
          {' · '}
          {trip.aller.origin} → {trip.destination_code}
        </Text>

        <View style={styles.partner}>
          <Text style={styles.partnerEmoji}>✈️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.partnerName}>Ryanair</Text>
            <Text style={styles.partnerDesc}>Site officiel — redirection automatique</Text>
          </View>
          {redirecting ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.countdown}>{countdown}s</Text>
          )}
        </View>

        <Pressable onPress={() => void redirect()} style={styles.cta}>
          <Text style={styles.ctaText}>Ouvrir Ryanair maintenant</Text>
        </Pressable>

        {onSaveFavorite ? (
          <Pressable onPress={onSaveFavorite} style={styles.fav}>
            <Text style={styles.favText}>Ajouter aux favoris</Text>
          </Pressable>
        ) : null}

        <Pressable onPress={onClose}>
          <Text style={styles.cancel}>Annuler</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,18,34,0.5)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: 14,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
    includeFontPadding: false,
  },
  sub: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 18,
    includeFontPadding: false,
  },
  partner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.canvas,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  partnerEmoji: { fontSize: 28 },
  partnerName: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    includeFontPadding: false,
  },
  partnerDesc: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    includeFontPadding: false,
  },
  countdown: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.primary,
    includeFontPadding: false,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  fav: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.inkSoft },
  cancel: {
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.faint,
    marginTop: 4,
    marginBottom: 4,
  },
})
