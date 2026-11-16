import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { colors, fonts, radius, spacing } from '../../theme'

const LABELS = ['L’idée', 'Les lieux', 'Le rendu'] as const

type Props = {
  step: 1 | 2 | 3
  /** Tap a step to jump (édition / brouillon). */
  onStepPress?: (step: 1 | 2 | 3) => void
  style?: StyleProp<ViewStyle>
}

export function CreateFlowProgress({ step, onStepPress, style }: Props) {
  const [trackW, setTrackW] = useState(0)
  const slide = useRef(new Animated.Value(step - 1)).current

  useEffect(() => {
    Animated.spring(slide, {
      toValue: step - 1,
      useNativeDriver: true,
      friction: 9,
      tension: 120,
    }).start()
  }, [step, slide])

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackW(e.nativeEvent.layout.width)
  }

  const innerW = Math.max(0, trackW - 8)
  const cellW = innerW > 0 ? innerW / 3 : 0
  const translateX =
    cellW > 0
      ? slide.interpolate({
          inputRange: [0, 1, 2],
          outputRange: [0, cellW, cellW * 2],
        })
      : 0

  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: 3, now: step }}
      onLayout={onTrackLayout}
    >
      {cellW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: cellW,
              transform: [{ translateX }],
            },
          ]}
        />
      ) : null}
      {LABELS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const active = n === step
        const clickable = !!onStepPress && n !== step
        return (
          <Pressable
            key={label}
            disabled={!clickable}
            style={({ pressed }) => [
              styles.cell,
              pressed && clickable && { opacity: 0.75 },
            ]}
            onPress={() => onStepPress?.(n)}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !clickable }}
            accessibilityLabel={label}
          >
            <Text
              style={[styles.label, active && styles.labelActive]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    marginTop: 4,
    marginBottom: 14,
    marginHorizontal: spacing.xl,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  thumb: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.faint,
    textAlign: 'center',
  },
  labelActive: {
    fontFamily: fonts.bold,
    color: colors.ink,
  },
})
