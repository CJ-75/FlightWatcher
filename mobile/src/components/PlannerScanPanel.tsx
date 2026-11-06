import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Animated, Easing } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { translate } from '@flightwatcher/shared'
import { colors, fonts, radius, shadow } from '../theme'

const STATUS_KEYS = [
  'planner.scan.status1',
  'planner.scan.status2',
  'planner.scan.status3',
  'planner.scan.status4',
] as const

type Props = {
  fromLabel: string
  toLabel: string
  title?: string
  compact?: boolean
}

export function PlannerScanPanel({
  fromLabel,
  toLabel,
  title,
  compact = false,
}: Props) {
  const planeX = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current
  const [statusIdx, setStatusIdx] = useState(0)
  const t = (key: string) => translate('fr', key as never)

  useEffect(() => {
    const planeLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(planeX, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(planeX, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(420),
      ]),
    )
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    )
    planeLoop.start()
    pulseLoop.start()
    return () => {
      planeLoop.stop()
      pulseLoop.stop()
    }
  }, [planeX, pulse])

  useEffect(() => {
    const id = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start()
      setStatusIdx((i) => (i + 1) % STATUS_KEYS.length)
    }, 2200)
    return () => clearInterval(id)
  }, [fade])

  const translateX = planeX.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 96],
  })
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1.55],
  })
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0],
  })

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, shadow.soft]}>
      <LinearGradient
        colors={['#1A120E', '#2A1A12', '#3D2418']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowA} pointerEvents="none" />
      <View style={styles.glowB} pointerEvents="none" />

      <View style={styles.kickerRow}>
        <View style={styles.liveDot} />
        <Text style={styles.kicker}>Scan live</Text>
      </View>

      <Text style={[styles.title, compact && styles.titleCompact]}>
        {title || t('planner.scan.auto')}
      </Text>

      <View style={styles.routeCard}>
        <View style={styles.airportCol}>
          <Text style={styles.airportLabel}>Départ</Text>
          <Text style={styles.airportCode} numberOfLines={1}>
            {fromLabel}
          </Text>
        </View>

        <View style={styles.flightPath}>
          <View style={styles.flightLine} />
          <Animated.View
            style={[
              styles.pulseRing,
              { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
            ]}
          />
          <Animated.View
            style={[styles.planeWrap, { transform: [{ translateX }] }]}
          >
            <Text style={styles.plane}>✈</Text>
          </Animated.View>
        </View>

        <View style={[styles.airportCol, styles.airportColRight]}>
          <Text style={styles.airportLabel}>Arrivée</Text>
          <Text style={styles.airportCode} numberOfLines={1}>
            {toLabel}
          </Text>
        </View>
      </View>

      <Animated.Text style={[styles.status, { opacity: fade }]}>
        {t(STATUS_KEYS[statusIdx])}
      </Animated.Text>
      <Text style={styles.hint}>{t('planner.scan.hint')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    padding: 22,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,107,53,0.28)',
  },
  wrapCompact: {
    padding: 18,
  },
  glowA: {
    position: 'absolute',
    top: -40,
    left: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,107,53,0.28)',
  },
  glowB: {
    position: 'absolute',
    bottom: -50,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,176,136,0.16)',
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: '#FFB088',
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.white,
    letterSpacing: -0.4,
    marginBottom: 18,
  },
  titleCompact: {
    fontSize: 18,
    marginBottom: 14,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  airportCol: { flex: 1, minWidth: 0 },
  airportColRight: { alignItems: 'flex-end' },
  airportLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'rgba(255,176,136,0.75)',
    marginBottom: 4,
  },
  airportCode: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.white,
    letterSpacing: -0.3,
  },
  flightPath: {
    width: 112,
    height: 28,
    justifyContent: 'center',
  },
  flightLine: {
    height: 1,
    backgroundColor: 'rgba(255,176,136,0.45)',
  },
  pulseRing: {
    position: 'absolute',
    alignSelf: 'center',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.primary,
    left: 47,
  },
  planeWrap: {
    position: 'absolute',
    left: 0,
    top: 2,
  },
  plane: {
    fontSize: 16,
    color: '#FFB088',
    transform: [{ rotate: '90deg' }],
  },
  status: {
    marginTop: 16,
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: '#FFE8DC',
    textAlign: 'center',
  },
  hint: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: 'rgba(255,176,136,0.7)',
    textAlign: 'center',
    lineHeight: 17,
  },
})
