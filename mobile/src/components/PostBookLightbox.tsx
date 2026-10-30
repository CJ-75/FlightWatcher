import React from 'react'
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cityDisplayNameFr, type EnrichedTripResponse } from '@flightwatcher/shared'
import { colors, fonts, radius, spacing } from '../theme'

type Props = {
  trip: EnrichedTripResponse
  busy?: boolean
  onOpenTrip: () => void
  onClose: () => void
}

/** Shown right after partner book opens — same UX as web PostBookLightbox. */
export function PostBookLightbox({ trip, busy, onOpenTrip, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const city = cityDisplayNameFr(
    trip.destination_code,
    trip.aller?.destinationFull?.split(',')[0]?.trim(),
  )

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text style={styles.brand}>FlightWatcher</Text>
          <Text style={styles.title}>Ton vol pour {city} est réservé ?</Text>
          <Text style={styles.hint}>
            Pendant que tu finalises sur le site partenaire, prépare ton hôtel ici.
          </Text>

          <Pressable
            style={[styles.cta, busy && styles.ctaDisabled]}
            disabled={busy}
            onPress={onOpenTrip}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.ctaText}>Oui, trouver mon hôtel</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.dismiss}
            disabled={busy}
            onPress={onClose}
            hitSlop={8}
          >
            <Text style={styles.dismissText}>Pas encore</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 18, 14, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 4,
  },
  brand: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  cta: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  dismiss: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.inkSoft,
  },
})
