import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Share,
  ScrollView,
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
  onFavorite: (trip: EnrichedTripResponse) => void
  isFavorite: (trip: EnrichedTripResponse) => boolean
}

const MAX_RELANCES = 3

export function RouletteModal({
  visible,
  trips,
  budget,
  onClose,
  onBook,
  onFavorite,
  isFavorite,
}: Props) {
  const insets = useSafeAreaInsets()
  const affordable = trips.filter((t) => t.prix_total <= budget)
  const [selected, setSelected] = useState<EnrichedTripResponse | null>(null)
  const [relances, setRelances] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (!visible) {
      setSelected(null)
      setRelances(0)
      setSpinning(false)
      started.current = false
      return
    }
    if (!started.current && affordable.length > 0) {
      started.current = true
      spin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const spin = () => {
    if (spinning || relances >= MAX_RELANCES || affordable.length === 0) return
    setSpinning(true)
    setRelances((r) => r + 1)
    let step = 0
    const steps = 10
    const id = setInterval(() => {
      step++
      setSelected(affordable[Math.floor(Math.random() * affordable.length)])
      if (step >= steps) {
        clearInterval(id)
        setSelected(affordable[Math.floor(Math.random() * affordable.length)])
        setSpinning(false)
      }
    }, 200)
  }

  const share = async () => {
    if (!selected) return
    const city = selected.aller.destinationFull?.split(',')[0]?.trim() || selected.destination_code
    const message = `J'ai tiré ${city} à ${Math.round(selected.prix_total)}€ ! 🎲✈️`
    await Share.share({ message })
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.top}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <Text style={styles.title}>Tire ta destination</Text>
          <View style={[styles.badge, relances >= MAX_RELANCES && styles.badgeMax]}>
            <Text style={styles.badgeText}>
              {relances}/{MAX_RELANCES}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {affordable.length === 0 ? (
            <Text style={styles.empty}>Aucune destination sous {budget}€ / pers.</Text>
          ) : selected ? (
            <View style={spinning ? styles.spinning : undefined}>
              <DestinationCard
                trip={selected}
                isFavorite={isFavorite(selected)}
                onFavorite={() => onFavorite(selected)}
                onBook={() => onBook(selected)}
              />
            </View>
          ) : (
            <Text style={styles.empty}>Préparation de la roulette…</Text>
          )}

          <Pressable
            onPress={spin}
            disabled={spinning || relances >= MAX_RELANCES || affordable.length === 0}
            style={[
              styles.spinBtn,
              (spinning || relances >= MAX_RELANCES) && styles.spinDisabled,
            ]}
          >
            <Text style={styles.spinText}>
              {relances >= MAX_RELANCES ? 'Plus de relances' : spinning ? 'Tirage…' : 'Relancer'}
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
  spinning: { opacity: 0.85 },
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
