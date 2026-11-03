import React from 'react'
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import type { StayPipelineStep, StayStepId } from '@flightwatcher/shared'
import { colors, fonts, shadow } from '../theme'

type Props = {
  steps: StayPipelineStep[]
  onStepPress?: (id: StayStepId) => void
}

function StepGlyph({
  id,
  color,
  size = 18,
}: {
  id: StayStepId
  color: string
  size?: number
}) {
  const common = { width: size, height: size, viewBox: '0 0 24 24' }
  switch (id) {
    case 'flight':
      return (
        <Svg {...common}>
          <Path
            fill={color}
            d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
          />
        </Svg>
      )
    case 'hotel':
      return (
        <Svg {...common}>
          <Path
            fill={color}
            d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7 4 8.34 4 10s1.34 3 3 3zm12-6h-8v7H3V6H1v14h2v-2h18v2h2v-8c0-2.21-1.79-4-4-4z"
          />
        </Svg>
      )
    case 'activities':
      return (
        <Svg {...common}>
          <Path
            fill={color}
            d="M20 6H15.82C15.4 4.84 14.3 4 13 4H11C9.7 4 8.6 4.84 8.18 6H4C2.9 6 2 6.9 2 8V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6ZM11 6H13C13.55 6 14 6.45 14 7S13.55 8 13 8H11C10.45 8 10 7.55 10 7S10.45 6 11 6ZM20 18H4V8H20V18ZM12 10C10.34 10 9 11.34 9 13S10.34 16 12 16 15 14.66 15 13 13.66 10 12 10Z"
          />
        </Svg>
      )
    case 'restaurants':
      return (
        <Svg {...common}>
          <Path
            fill={color}
            d="M11 9H9V2H7V9H5V2H3V9C3 11.12 4.66 12.84 6.75 12.97V22H9.25V12.97C11.34 12.84 13 11.12 13 9V2H11V9ZM16 6V14H18.5V22H21V2C18.24 2 16 4.24 16 6Z"
          />
        </Svg>
      )
    default:
      return null
  }
}

function iconColor(state: StayPipelineStep['state'], id: StayStepId): string {
  if (state === 'done' || state === 'current') return colors.white
  if (state === 'off') return colors.faint
  if (id === 'hotel') return colors.primaryDeep
  return colors.inkSoft
}

export function StayPipelineStepper({ steps, onStepPress }: Props) {
  const n = Math.max(steps.length, 1)
  let lastDone = -1
  for (let i = 0; i < steps.length; i++) {
    if (steps[i]?.state === 'done') lastDone = i
  }
  const progressPct = lastDone < 0 ? 0 : (lastDone / Math.max(n - 1, 1)) * 100

  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      <View style={styles.trackWrap} pointerEvents="none">
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${progressPct}%` }]} />
        </View>
      </View>

      <View style={styles.row}>
        {steps.map((s) => {
          const isOff = s.state === 'off'
          const isDone = s.state === 'done'
          const isCurrent = s.state === 'current'
          return (
            <Pressable
              key={s.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: isCurrent, disabled: isOff }}
              onPress={() => {
                if (isOff) {
                  Alert.alert(
                    s.hint === 'Après l’hôtel' ? 'Adresses' : 'Bientôt',
                    s.hint === 'Après l’hôtel'
                      ? 'Réserve d’abord ton hôtel pour voir les restos autour.'
                      : `${s.label} arrive bientôt sur FlightWatcher.`,
                  )
                  return
                }
                onStepPress?.(s.id)
              }}
              style={styles.step}
            >
              <View
                style={[
                  styles.dot,
                  shadow.soft,
                  isDone && styles.dotDone,
                  isCurrent && styles.dotCurrent,
                  isCurrent && s.id === 'hotel' && styles.dotCurrentHotel,
                  isOff && styles.dotOff,
                  !isDone && !isCurrent && !isOff && styles.dotUpcoming,
                  !isDone &&
                    !isCurrent &&
                    !isOff &&
                    s.id === 'hotel' &&
                    styles.dotUpcomingHotel,
                ]}
              >
                <StepGlyph
                  id={s.id}
                  color={iconColor(s.state, s.id)}
                  size={18}
                />
              </View>
              <Text
                style={[
                  styles.label,
                  isCurrent && styles.labelCurrent,
                  isOff && styles.labelOff,
                  isDone && styles.labelDone,
                ]}
                numberOfLines={2}
              >
                {s.label}
              </Text>
              {s.hint ? (
                <Text
                  style={[
                    styles.hint,
                    isOff && styles.hintOff,
                    isCurrent && styles.hintCurrent,
                    isDone && styles.hintDone,
                  ]}
                  numberOfLines={1}
                >
                  {s.hint}
                </Text>
              ) : null}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    paddingTop: 6,
    paddingBottom: 10,
    marginBottom: 8,
  },
  trackWrap: {
    position: 'absolute',
    top: 28,
    left: '12.5%',
    right: '12.5%',
    height: 3,
    zIndex: 0,
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  trackFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    zIndex: 1,
  },
  step: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 2,
    gap: 5,
  },
  dot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
  },
  dotDone: {
    backgroundColor: '#1FA971',
    borderColor: '#168A5B',
  },
  dotCurrent: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDeep,
  },
  dotCurrentHotel: {
    backgroundColor: colors.primaryDeep,
    borderColor: '#C44716',
  },
  dotUpcoming: {
    backgroundColor: colors.white,
    borderColor: colors.lineStrong,
  },
  dotUpcomingHotel: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryMuted,
  },
  dotOff: {
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 15,
    color: colors.muted,
    textAlign: 'center',
    includeFontPadding: false,
  },
  labelCurrent: {
    fontFamily: fonts.extrabold,
    color: colors.ink,
  },
  labelDone: {
    color: colors.inkSoft,
  },
  labelOff: {
    color: colors.faint,
  },
  hint: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    lineHeight: 12,
    color: colors.faint,
    textAlign: 'center',
    includeFontPadding: false,
  },
  hintCurrent: {
    color: colors.primaryInk,
  },
  hintDone: {
    color: '#168A5B',
  },
  hintOff: {
    color: colors.faint,
  },
})
