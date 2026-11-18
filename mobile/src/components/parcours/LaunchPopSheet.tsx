import React, { useEffect, useMemo } from 'react'
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  Linking,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import {
  buildLaunchPopPlan,
  mapsOriginFromCoords,
  withMapsDirOrigin,
  type ItineraryItem,
  type LaunchPopLeg,
  type LaunchPopPlan,
} from '@waypop/shared'
import { fonts, colors, spacing } from '../../theme'

type Props = {
  visible: boolean
  title?: string
  items: ItineraryItem[]
  itineraryId?: string
  onClose: () => void
}

const TRANSIT = {
  bg: '#EAF3FB',
  border: '#B7D0E8',
  ink: '#2F6FAE',
}

async function persistResume(
  itineraryId: string | undefined,
  dayOffset: number,
) {
  if (!itineraryId) return
  try {
    await AsyncStorage.setItem(
      `fw_launch_pop:${itineraryId}`,
      JSON.stringify({ lastDay: dayOffset, at: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

const GEO_CACHE_MS = 120_000
let cachedOrigin: { value: string; at: number } | null = null
let inflightOrigin: Promise<string | null> | null = null

function peekCachedOrigin(): string | null {
  if (cachedOrigin && Date.now() - cachedOrigin.at < GEO_CACHE_MS) {
    return cachedOrigin.value
  }
  return null
}

function rememberOrigin(value: string) {
  cachedOrigin = { value, at: Date.now() }
}

async function readDeviceCoords(): Promise<string | null> {
  const cached = peekCachedOrigin()
  if (cached) return cached
  if (inflightOrigin) return inflightOrigin

  inflightOrigin = (async () => {
    try {
      const existing = await Location.getForegroundPermissionsAsync()
      const perm =
        existing.status === 'granted'
          ? existing
          : await Location.requestForegroundPermissionsAsync()
      if (perm.status !== 'granted') return peekCachedOrigin()

      const last = await Location.getLastKnownPositionAsync({
        maxAge: GEO_CACHE_MS,
        requiredAccuracy: 150,
      })
      if (last) {
        const value = mapsOriginFromCoords(
          last.coords.latitude,
          last.coords.longitude,
        )
        rememberOrigin(value)
        // Refresh in background — keep the good fix for this open.
        void Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
          .then((pos) => {
            rememberOrigin(
              mapsOriginFromCoords(pos.coords.latitude, pos.coords.longitude),
            )
          })
          .catch(() => {})
        return value
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      const value = mapsOriginFromCoords(
        pos.coords.latitude,
        pos.coords.longitude,
      )
      rememberOrigin(value)
      return value
    } catch {
      return peekCachedOrigin()
    }
  })().finally(() => {
    inflightOrigin = null
  })

  return inflightOrigin
}

function prefetchDeviceCoords() {
  void readDeviceCoords()
}

async function resolveLegMapsUrl(leg: LaunchPopLeg): Promise<string> {
  if (leg.kind !== 'transit') return leg.mapsUrl
  const origin = peekCachedOrigin() || (await readDeviceCoords())
  return origin ? withMapsDirOrigin(leg.mapsUrl, origin) : leg.mapsUrl
}

function PlayMark({ color = '#fff' }: { color?: string }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        marginLeft: 1,
        borderTopWidth: 4,
        borderBottomWidth: 4,
        borderLeftWidth: 7,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
    />
  )
}

function LegRow({
  leg,
  index,
  onPress,
}: {
  leg: LaunchPopLeg
  index: number
  onPress: () => void
}) {
  const isTransit = leg.kind === 'transit'
  return (
    <View
      style={[
        styles.leg,
        isTransit ? styles.legTransit : styles.legWalk,
      ]}
    >
      <View
        style={[
          styles.badge,
          { backgroundColor: isTransit ? TRANSIT.ink : colors.ink },
        ]}
      >
        <Text style={styles.badgeText}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.kindLabel,
            { color: isTransit ? TRANSIT.ink : colors.muted },
          ]}
        >
          {isTransit ? 'Transports' : 'À pied'}
        </Text>
        <Text style={styles.legTitle}>
          {leg.title}
          {leg.durationLabel ? ` · ${leg.durationLabel}` : ''}
        </Text>
        <Text style={styles.legSub}>{leg.subtitle}</Text>
      </View>
      <Pressable
        onPress={onPress}
        style={[
          styles.cta,
          { backgroundColor: isTransit ? TRANSIT.ink : colors.ink },
        ]}
      >
        <PlayMark />
        <Text style={styles.ctaText}>{leg.ctaLabel}</Text>
      </Pressable>
    </View>
  )
}

export function LaunchPopSheet({
  visible,
  title,
  items,
  itineraryId,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets()
  const plan: LaunchPopPlan = useMemo(
    () => buildLaunchPopPlan(items),
    [items],
  )

  useEffect(() => {
    if (visible) prefetchDeviceCoords()
  }, [visible])

  const openLeg = (leg: LaunchPopLeg, dayOffset: number) => {
    void (async () => {
      await persistResume(itineraryId, dayOffset)
      const url = await resolveLegMapsUrl(leg)
      await Linking.openURL(url)
    })()
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <Text style={styles.title}>Lancer le Pop</Text>
          {title ? <Text style={styles.sub}>{title}</Text> : null}
          <Text style={styles.hint}>
            D’abord rejoins le quartier en transports, puis lance les stops à
            pied.
          </Text>

          <ScrollView
            style={{ maxHeight: Platform.OS === 'ios' ? 480 : 520 }}
            keyboardShouldPersistTaps="handled"
          >
            {!plan.days.length ? (
              <Text style={styles.empty}>Aucun stop à lancer pour ce Pop.</Text>
            ) : null}
            {plan.days.map((day) => {
              let stepIndex = 0
              return (
                <View
                  key={day.dayOffset}
                  style={[styles.day, day.isToday && styles.dayToday]}
                >
                  <View style={styles.dayHead}>
                    <Text style={styles.dayTitle}>
                      {day.label}
                      {day.isToday ? ' · Aujourd’hui' : ''}
                    </Text>
                    <Text style={styles.dayMeta}>
                      {day.stopCount} stop{day.stopCount > 1 ? 's' : ''}
                    </Text>
                  </View>
                  {day.segments.map((seg) => (
                    <View key={seg.id} style={{ gap: 10, marginBottom: 8 }}>
                      {day.segments.length > 1 ? (
                        <Text style={styles.segLabel}>
                          {seg.label} · {seg.stopCount} stops
                        </Text>
                      ) : null}
                      {seg.legs.map((leg) => {
                        const index = stepIndex
                        stepIndex += 1
                        return (
                          <LegRow
                            key={leg.id}
                            leg={leg}
                            index={index}
                            onPress={() => openLeg(leg, day.dayOffset)}
                          />
                        )
                      })}
                    </View>
                  ))}
                </View>
              )
            })}
          </ScrollView>

          <Pressable onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Fermer</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: 14,
    gap: 10,
  },
  title: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  hint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primaryInk,
    lineHeight: 18,
    backgroundColor: '#FFF7F2',
    borderRadius: 16,
    padding: 12,
  },
  empty: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  day: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
    backgroundColor: '#fff',
  },
  dayToday: {
    borderColor: 'rgba(255,107,53,0.35)',
    backgroundColor: '#FFF7F2',
  },
  dayHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dayTitle: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  dayMeta: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  segLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  leg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  legTransit: {
    backgroundColor: TRANSIT.bg,
    borderColor: TRANSIT.border,
  },
  legWalk: {
    backgroundColor: '#F7F4EF',
    borderColor: 'transparent',
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontFamily: fonts.bold, fontSize: 11 },
  kindLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  legTitle: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.ink },
  legSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  cta: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ctaText: { color: '#fff', fontFamily: fonts.bold, fontSize: 11 },
  close: {
    marginTop: 4,
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeText: { fontFamily: fonts.bold, fontSize: 14, color: colors.muted },
}
)
