import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  Pressable,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, fonts } from '../theme'

type Props = {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}

function snap(n: number, step: number) {
  return Math.round(n / step) * step
}

export function BudgetSlider({ value, onChange, min = 20, max = 1000, step = 10 }: Props) {
  const [width, setWidth] = useState(0)
  const widthRef = useRef(0)
  const pageXRef = useRef(0)
  const trackRef = useRef<View>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  const pct = useMemo(() => ((value - min) / (max - min)) * 100, [value, min, max])

  const setFromPageX = useCallback(
    (pageX: number) => {
      const w = widthRef.current
      if (w <= 0) return
      const x = pageX - pageXRef.current
      const ratio = Math.max(0, Math.min(1, x / w))
      const raw = min + ratio * (max - min)
      const next = Math.max(min, Math.min(max, snap(raw, step)))
      if (next !== valueRef.current) onChange(next)
    },
    [min, max, step, onChange],
  )

  const measureTrack = useCallback(() => {
    trackRef.current?.measureInWindow((x, _y, w) => {
      pageXRef.current = x
      widthRef.current = w
      setWidth(w)
    })
  }, [])

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          measureTrack()
          setFromPageX(e.nativeEvent.pageX)
        },
        onPanResponderMove: (e) => setFromPageX(e.nativeEvent.pageX),
      }),
    [measureTrack, setFromPageX],
  )

  const onLayout = (_e: LayoutChangeEvent) => {
    measureTrack()
  }

  const bump = (delta: number) => {
    onChange(Math.max(min, Math.min(max, value + delta)))
  }

  return (
    <View>
      <View style={styles.header}>
        <Pressable onPress={() => bump(-step)} hitSlop={8} style={styles.stepBtn}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <View style={styles.valueBlock}>
          <Text style={styles.hint}>Budget max / personne</Text>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {value}€
          </Text>
          <Text style={styles.subHint}>aller-retour</Text>
        </View>
        <Pressable onPress={() => bump(step)} hitSlop={8} style={styles.stepBtn}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>

      <View
        ref={trackRef}
        style={styles.trackWrap}
        onLayout={onLayout}
        {...pan.panHandlers}
      >
        <View style={styles.track}>
          <LinearGradient
            colors={[colors.primaryMuted, colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.fill, { width: `${pct}%` }]}
          />
        </View>
        {width > 0 ? (
          <View
            style={[
              styles.thumb,
              { left: Math.max(0, Math.min(width - 28, (pct / 100) * width - 14)) },
            ]}
            pointerEvents="none"
          />
        ) : null}
      </View>

      <View style={styles.ends}>
        <Text style={styles.endLabel}>{min}€</Text>
        <Text style={styles.endLabel}>{max}€</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 26,
    color: colors.primary,
    includeFontPadding: false,
  },
  valueBlock: { flex: 1, alignItems: 'center' },
  hint: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
    includeFontPadding: false,
  },
  value: {
    fontFamily: fonts.extrabold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1,
    color: colors.ink,
    includeFontPadding: false,
  },
  subHint: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.faint,
    includeFontPadding: false,
    marginTop: -2,
  },
  trackWrap: {
    height: 40,
    justifyContent: 'center',
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  thumb: {
    position: 'absolute',
    top: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.primary,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  endLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.faint,
    includeFontPadding: false,
  },
})
