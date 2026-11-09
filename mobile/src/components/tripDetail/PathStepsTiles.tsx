import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import type { StayStepId, TripDetailStepTile } from '@flightwatcher/shared'
import { colors, fonts } from '../../theme'

type Props = {
  steps: TripDetailStepTile[]
  onStepPress?: (id: StayStepId) => void
}

function StepIcon({
  id,
  color,
}: {
  id: StayStepId
  color: string
}) {
  const stroke = color
  if (id === 'flight') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"
          stroke={stroke}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    )
  }
  if (id === 'hotel') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M3 20h18M5 20V9l7-4 7 4v11M9 20v-5h6v5"
          stroke={stroke}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    )
  }
  if (id === 'activities') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="12" r="2.75" stroke={stroke} strokeWidth={1.75} />
        <Path
          d="M12 3.5v2.5M12 18v2.5M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M3.5 12h2.5M18 12h2.5M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8"
          stroke={stroke}
          strokeWidth={1.75}
          strokeLinecap="round"
        />
      </Svg>
    )
  }
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20.5s6.2-4 6.2-9.6a6.2 6.2 0 10-12.4 0c0 5.6 6.2 9.6 6.2 9.6z"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="10.6" r="1.9" stroke={stroke} strokeWidth={1.75} />
    </Svg>
  )
}

export function PathStepsTiles({ steps, onStepPress }: Props) {
  if (!steps.length) return null
  return (
    <View style={styles.row}>
      {steps.map((step) => {
        const live = step.state === 'current'
        const done = step.state === 'done'
        const iconColor = live || done ? '#fff' : '#6B5C50'
        return (
          <Pressable
            key={step.id}
            onPress={() => onStepPress?.(step.id)}
            style={[
              styles.tile,
              live && styles.tileLive,
              done && !live && styles.tileDone,
            ]}
          >
            <View
              style={[
                styles.iconWrap,
                live && styles.iconLive,
                done && !live && styles.iconDone,
              ]}
            >
              <StepIcon id={step.id} color={iconColor} />
            </View>
            <Text style={styles.label}>{step.label}</Text>
            <Text
              style={[
                styles.status,
                live && styles.statusLive,
                done && !live && styles.statusDone,
              ]}
            >
              {step.statusLabel}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    width: '22%',
    minWidth: 72,
    flexGrow: 1,
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EDE4DC',
  },
  tileLive: {
    backgroundColor: '#FFF7F2',
    borderColor: 'rgba(255,107,53,0.3)',
  },
  tileDone: {
    backgroundColor: '#F3FAF6',
    borderColor: 'rgba(15,138,95,0.12)',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F2ED',
  },
  iconLive: { backgroundColor: colors.primary },
  iconDone: { backgroundColor: colors.success },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.ink,
  },
  status: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: '#9A8778',
  },
  statusLive: { color: colors.primaryDeep },
  statusDone: { color: colors.success },
})
