import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Share,
  ScrollView,
  Animated,
  Easing,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EnrichedTripResponse } from '@flightwatcher/shared'
import { DestinationCard } from './DestinationCard'
import { colors, fonts } from '../theme'

type Props = {
  visible: boolean
  trips: EnrichedTripResponse[]
  budget: number
  onClose: () => void
  onBook: (trip: EnrichedTripResponse) => void
  onAddHotel?: (trip: EnrichedTripResponse) => void
  addHotelBusy?: boolean
  onFavorite: (trip: EnrichedTripResponse) => void
  isFavorite: (trip: EnrichedTripResponse) => boolean
}

const MAX_RELANCES = 3
const SPIN_STEPS = 12
const SPIN_TICK_MS = 150

export function RouletteModal({
  visible,
  trips,
  budget,
  onClose,
  onBook,
  onAddHotel,
  addHotelBusy = false,
  onFavorite,
  isFavorite,
}: Props) {
  const insets = useSafeAreaInsets()
  // All-in: do not hard-exclude long-haul / expensive packs when none fit budget
  const affordable =
    trips.length === 0
      ? []
      : trips.some((t) => t.prix_total <= budget)
        ? trips.filter((t) => t.prix_total <= Math.max(budget, 1))
        : trips
  const [selected, setSelected] = useState<EnrichedTripResponse | null>(null)
  const [relances, setRelances] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const started = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const shakeX = useRef(new Animated.Value(0)).current
  const shakeY = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(1)).current
  const rotate = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(1)).current
  const shakeLoopRef = useRef<Animated.CompositeAnimation | null>(null)

  const stopShake = () => {
    shakeLoopRef.current?.stop()
    shakeLoopRef.current = null
    Animated.parallel([
      Animated.spring(shakeX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 6,
        tension: 180,
      }),
      Animated.spring(shakeY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 6,
        tension: 180,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
        tension: 160,
      }),
      Animated.spring(rotate, {
        toValue: 0,
        useNativeDriver: true,
        friction: 6,
        tension: 180,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start()
  }

  const startShake = () => {
    shakeLoopRef.current?.stop()
    shakeLoopRef.current = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(shakeX, {
            toValue: 18,
            duration: 70,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(shakeX, {
            toValue: -18,
            duration: 70,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(shakeX, {
            toValue: 12,
            duration: 60,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(shakeX, {
            toValue: -10,
            duration: 60,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(shakeX, {
            toValue: 0,
            duration: 50,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(shakeY, {
            toValue: -8,
            duration: 80,
            useNativeDriver: true,
          }),
          Animated.timing(shakeY, {
            toValue: 8,
            duration: 80,
            useNativeDriver: true,
          }),
          Animated.timing(shakeY, {
            toValue: 0,
            duration: 60,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.04,
            duration: 90,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.96,
            duration: 90,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(rotate, {
            toValue: 1,
            duration: 80,
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: -1,
            duration: 80,
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: 0,
            duration: 60,
            useNativeDriver: true,
          }),
        ]),
      ]),
    )
    shakeLoopRef.current.start()
  }

  const flashCardIn = () => {
    // Brief flash on each tick so destination changes feel physical.
    opacity.setValue(0.4)
    Animated.timing(opacity, {
      toValue: 1,
      duration: 110,
      useNativeDriver: true,
    }).start()
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      shakeLoopRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    if (!visible) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      shakeLoopRef.current?.stop()
      shakeLoopRef.current = null
      setSelected(null)
      setRelances(0)
      setSpinning(false)
      started.current = false
      shakeX.setValue(0)
      shakeY.setValue(0)
      scale.setValue(1)
      rotate.setValue(0)
      opacity.setValue(1)
      return
    }
    if (!started.current && affordable.length > 0) {
      started.current = true
      spin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  useEffect(() => {
    if (selected) flashCardIn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.destination_code, selected?.aller?.departureTime])

  const spin = () => {
    if (spinning || relances >= MAX_RELANCES || affordable.length === 0) return
    if (intervalRef.current) clearInterval(intervalRef.current)

    setSpinning(true)
    setRelances((r) => r + 1)
    startShake()

    let step = 0
    intervalRef.current = setInterval(() => {
      step++
      setSelected(affordable[Math.floor(Math.random() * affordable.length)])
      if (step >= SPIN_STEPS) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        setSelected(affordable[Math.floor(Math.random() * affordable.length)])
        setSpinning(false)
        stopShake()
      }
    }, SPIN_TICK_MS)
  }

  const share = async () => {
    if (!selected) return
    const city =
      selected.aller.destinationFull?.split(',')[0]?.trim() ||
      selected.destination_code
    const message = `J'ai tiré ${city} à ${Math.round(selected.prix_total)}€ ! 🎲✈️`
    await Share.share({ message })
  }

  const rotateDeg = rotate.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-4deg', '4deg'],
  })

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={styles.top}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <Text style={styles.title}>Tire ta destination</Text>
          <View
            style={[styles.badge, relances >= MAX_RELANCES && styles.badgeMax]}
          >
            <Text style={styles.badgeText}>
              {relances}/{MAX_RELANCES}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {affordable.length === 0 ? (
            <Text style={styles.empty}>
              Aucune destination sous {budget}€ / pers.
            </Text>
          ) : selected ? (
            <Animated.View
              style={[
                styles.cardStage,
                {
                  opacity,
                  transform: [
                    { translateX: shakeX },
                    { translateY: shakeY },
                    { scale },
                    { rotate: rotateDeg },
                  ],
                },
              ]}
            >
              <DestinationCard
                trip={selected}
                isFavorite={isFavorite(selected)}
                onFavorite={() => onFavorite(selected)}
                onBook={() => onBook(selected)}
                onAddHotel={
                  onAddHotel ? () => onAddHotel(selected) : undefined
                }
                addHotelBusy={addHotelBusy}
              />
            </Animated.View>
          ) : (
            <Text style={styles.empty}>Préparation de la roulette…</Text>
          )}

          <Pressable
            onPress={spin}
            disabled={
              spinning || relances >= MAX_RELANCES || affordable.length === 0
            }
            style={[
              styles.spinBtn,
              (spinning || relances >= MAX_RELANCES) && styles.spinDisabled,
            ]}
          >
            <Text style={styles.spinText}>
              {relances >= MAX_RELANCES
                ? 'Plus de relances'
                : spinning
                  ? 'Tirage…'
                  : 'Relancer'}
            </Text>
          </Pressable>

          {selected && !spinning ? (
            <Pressable onPress={() => void share()} style={styles.shareBtn}>
              <Text style={styles.shareText}>Partager</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: colors.white, fontSize: 18, fontFamily: fonts.bold },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.white,
    includeFontPadding: false,
  },
  badge: {
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeMax: { backgroundColor: colors.accent },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primary,
    includeFontPadding: false,
  },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  cardStage: {
    overflow: 'visible',
  },
  empty: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
    textAlign: 'center',
    marginTop: 40,
    includeFontPadding: false,
  },
  spinBtn: {
    marginTop: 12,
    backgroundColor: colors.white,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinDisabled: { opacity: 0.55 },
  spinText: { fontFamily: fonts.bold, fontSize: 16, color: colors.primary },
  shareBtn: {
    marginTop: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  shareText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
})
