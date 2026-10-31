import React from 'react'
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { colors, fonts } from '../theme'

type IconProps = {
  size?: number
  color?: string
}

/** Airplane — nose right. */
export function PlaneIcon({ size = 18, color = colors.primaryDeep }: IconProps) {
  const s = size
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: s * 0.72,
          height: s * 0.18,
          backgroundColor: color,
          borderRadius: s,
          transform: [{ rotate: '-18deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: s * 0.42,
          height: s * 0.14,
          backgroundColor: color,
          borderRadius: s,
          top: s * 0.28,
          left: s * 0.22,
          transform: [{ rotate: '55deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: s * 0.28,
          height: s * 0.12,
          backgroundColor: color,
          borderRadius: s,
          bottom: s * 0.3,
          left: s * 0.28,
          transform: [{ rotate: '-50deg' }],
        }}
      />
    </View>
  )
}

/** Bed / hotel. */
export function BedIcon({ size = 18, color = colors.primaryDeep }: IconProps) {
  const s = size
  return (
    <View style={{ width: s, height: s, justifyContent: 'flex-end', paddingBottom: s * 0.08 }}>
      <View
        style={{
          width: s * 0.28,
          height: s * 0.28,
          borderRadius: s * 0.08,
          backgroundColor: color,
          marginLeft: s * 0.12,
          marginBottom: -s * 0.04,
        }}
      />
      <View
        style={{
          width: s * 0.86,
          height: s * 0.32,
          borderTopLeftRadius: s * 0.12,
          borderTopRightRadius: s * 0.12,
          backgroundColor: color,
          alignSelf: 'center',
        }}
      />
      <View
        style={{
          width: s * 0.9,
          height: s * 0.1,
          backgroundColor: color,
          borderRadius: s,
          alignSelf: 'center',
          marginTop: s * 0.04,
        }}
      />
    </View>
  )
}

/** Simple calendar. */
export function CalendarIcon({ size = 18, color = colors.primaryDeep }: IconProps) {
  const s = size
  const w = s * 0.82
  const h = s * 0.78
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: w,
          height: h,
          borderRadius: s * 0.12,
          borderWidth: Math.max(1.5, s * 0.1),
          borderColor: color,
          overflow: 'hidden',
        }}
      >
        <View style={{ height: h * 0.28, backgroundColor: color }} />
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', padding: s * 0.08, gap: s * 0.06 }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                width: s * 0.12,
                height: s * 0.12,
                borderRadius: 2,
                backgroundColor: color,
                opacity: 0.45,
              }}
            />
          ))}
        </View>
      </View>
    </View>
  )
}

/** Card / payment. */
export function CardIcon({ size = 18, color = colors.primaryDeep }: IconProps) {
  const s = size
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: s * 0.9,
          height: s * 0.62,
          borderRadius: s * 0.12,
          borderWidth: Math.max(1.5, s * 0.09),
          borderColor: color,
          overflow: 'hidden',
        }}
      >
        <View style={{ height: s * 0.16, backgroundColor: color, marginTop: s * 0.12 }} />
        <View
          style={{
            width: s * 0.28,
            height: s * 0.1,
            backgroundColor: color,
            opacity: 0.45,
            marginTop: s * 0.1,
            marginLeft: s * 0.1,
            borderRadius: 2,
          }}
        />
      </View>
    </View>
  )
}

/** Share / export. */
export function ShareIcon({ size = 18, color = colors.primaryDeep }: IconProps) {
  const s = size
  const r = s * 0.16
  return (
    <View style={{ width: s, height: s }}>
      <View
        style={{
          position: 'absolute',
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          backgroundColor: color,
          top: s * 0.08,
          right: s * 0.12,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          backgroundColor: color,
          bottom: s * 0.12,
          left: s * 0.08,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          backgroundColor: color,
          bottom: s * 0.12,
          right: s * 0.08,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: s * 0.42,
          height: Math.max(1.5, s * 0.08),
          backgroundColor: color,
          top: s * 0.28,
          left: s * 0.22,
          transform: [{ rotate: '-32deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: s * 0.42,
          height: Math.max(1.5, s * 0.08),
          backgroundColor: color,
          bottom: s * 0.32,
          left: s * 0.22,
          transform: [{ rotate: '32deg' }],
        }}
      />
    </View>
  )
}

/** People / pax. */
export function UsersIcon({ size = 18, color = colors.primaryDeep }: IconProps) {
  const s = size
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{ flexDirection: 'row', gap: s * 0.08, alignItems: 'flex-end' }}>
        <View style={{ alignItems: 'center' }}>
          <View
            style={{
              width: s * 0.28,
              height: s * 0.28,
              borderRadius: s,
              backgroundColor: color,
              marginBottom: 2,
            }}
          />
          <View
            style={{
              width: s * 0.4,
              height: s * 0.28,
              borderTopLeftRadius: s * 0.2,
              borderTopRightRadius: s * 0.2,
              backgroundColor: color,
            }}
          />
        </View>
        <View style={{ alignItems: 'center', opacity: 0.55 }}>
          <View
            style={{
              width: s * 0.22,
              height: s * 0.22,
              borderRadius: s,
              backgroundColor: color,
              marginBottom: 2,
            }}
          />
          <View
            style={{
              width: s * 0.32,
              height: s * 0.24,
              borderTopLeftRadius: s * 0.16,
              borderTopRightRadius: s * 0.16,
              backgroundColor: color,
            }}
          />
        </View>
      </View>
    </View>
  )
}

/** Soft info / tip. */
export function TipIcon({ size = 18, color = colors.primaryDeep }: IconProps) {
  const s = size
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s / 2,
        borderWidth: Math.max(1.5, s * 0.1),
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: s * 0.12,
          height: s * 0.12,
          borderRadius: s,
          backgroundColor: color,
          marginBottom: s * 0.06,
        }}
      />
      <View
        style={{
          width: s * 0.12,
          height: s * 0.28,
          borderRadius: s,
          backgroundColor: color,
        }}
      />
    </View>
  )
}

/** Ticket stub. */
export function TicketIcon({ size = 18, color = colors.primaryDeep }: IconProps) {
  const s = size
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: s * 0.9,
          height: s * 0.55,
          borderRadius: s * 0.1,
          backgroundColor: color,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: s * 0.18,
            height: s * 0.18,
            borderRadius: s,
            backgroundColor: colors.white,
            marginLeft: s * 0.1,
            opacity: 0.9,
          }}
        />
        <View
          style={{
            flex: 1,
            height: Math.max(1, s * 0.06),
            marginHorizontal: s * 0.1,
            backgroundColor: colors.white,
            opacity: 0.35,
            borderRadius: 2,
          }}
        />
      </View>
    </View>
  )
}

/** Check mark in circle. */
export function CheckIcon({ size = 18, color = colors.success }: IconProps) {
  const s = size
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: s * 0.42,
          height: s * 0.22,
          borderLeftWidth: Math.max(2, s * 0.12),
          borderBottomWidth: Math.max(2, s * 0.12),
          borderColor: colors.white,
          transform: [{ rotate: '-45deg' }, { translateY: -s * 0.04 }],
        }}
      />
    </View>
  )
}

type ChipProps = {
  icon: React.ReactNode
  label: string
  style?: StyleProp<ViewStyle>
  /** Softer uppercase section label */
  section?: boolean
}

/** Label with peach icon chip — for card headers / CTAs. */
export function IconLabel({ icon, label, style, section }: ChipProps) {
  return (
    <View style={[styles.labelRow, style]}>
      <View style={styles.chip}>{icon}</View>
      <Text style={section ? styles.sectionText : styles.labelText}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  labelText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
})
