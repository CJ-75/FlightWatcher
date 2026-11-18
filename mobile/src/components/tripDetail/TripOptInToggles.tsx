import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { colors, fonts } from '../../theme'

type Props = {
  wantFlight: boolean
  wantHotel: boolean
  busy?: boolean
  /** Hide Vol when no real origin→dest link (Pop route gate). Default true. */
  showFlight?: boolean
  onEnableFlight: () => void | Promise<void>
  onDisableFlight: () => void | Promise<void>
  onEnableHotel: () => void | Promise<void>
  onDisableHotel: () => void | Promise<void>
}

/** Vol / Hôtel interrupteurs — activables après ajout Pop (parity web). */
export function TripOptInToggles({
  wantFlight,
  wantHotel,
  busy,
  showFlight = true,
  onEnableFlight,
  onDisableFlight,
  onEnableHotel,
  onDisableHotel,
}: Props) {
  const [pending, setPending] = useState<'flight' | 'hotel' | null>(null)
  const locked = Boolean(busy || pending)
  const flightVisible = showFlight

  const run = async (
    key: 'flight' | 'hotel',
    fn: () => void | Promise<void>,
  ) => {
    setPending(key)
    try {
      await fn()
    } finally {
      setPending(null)
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>Options séjour</Text>
      {flightVisible ? (
        <ToggleRow
          label="Vol"
          hint={
            wantFlight
              ? 'Scan et réservation WayPop'
              : 'Activer pour chercher un vol'
          }
          checked={wantFlight}
          disabled={locked}
          onToggle={() =>
            void run('flight', () =>
              wantFlight ? onDisableFlight() : onEnableFlight(),
            )
          }
        />
      ) : null}
      <ToggleRow
        label="Hôtel"
        hint={
          wantHotel
            ? 'Compose près de la destination'
            : 'Activer pour chercher un hôtel'
        }
        checked={wantHotel}
        disabled={locked}
        onToggle={() =>
          void run('hotel', () =>
            wantHotel ? onDisableHotel() : onEnableHotel(),
          )
        }
      />
      {(!flightVisible || !wantFlight) && !wantHotel ? (
        <Text style={styles.hint}>
          Tu n’es pas sur place ? Pense au vol et à l’hôtel quand le groupe est
          prêt.
        </Text>
      ) : null}
    </View>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.row,
        checked ? styles.rowOn : styles.rowOff,
        (disabled || pressed) && { opacity: 0.72 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <View style={[styles.track, checked && styles.trackOn]}>
        <View style={[styles.thumb, checked && styles.thumbOn]} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#8A7B6E',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowOn: {
    borderColor: 'rgba(255,107,53,0.3)',
    backgroundColor: '#FFF7F2',
  },
  rowOff: {
    borderColor: '#EDE4DC',
    backgroundColor: '#fff',
  },
  rowTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  rowHint: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#8A7B6E',
  },
  track: {
    width: 48,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#E8DFD6',
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  trackOn: { backgroundColor: '#FF6B35' },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  thumbOn: { alignSelf: 'flex-end' },
  hint: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#8A7B6E',
    paddingHorizontal: 2,
  },
})
