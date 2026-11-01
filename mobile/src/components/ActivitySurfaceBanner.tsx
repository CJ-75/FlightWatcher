import React from 'react'
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { getApi } from '../lib/client'
import type { MainTabParamList } from '../navigation/types'
import { colors, fonts, radius } from '../theme'

export function ActivitySurfaceBanner(props: {
  citySlug?: string | null
  surface: 'deal' | 'transfer' | 'occasions' | 'my_trip'
  title?: string
  subtitle?: string
}) {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>()

  const onPress = () => {
    void getApi()
      .trackActivityEvent({
        domain: 'activity',
        event: 'surface_cta',
        surface: props.surface,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        meta: { city_slug: props.citySlug },
      })
      .catch(() => undefined)
    try {
      navigation.navigate('Activities', {
        city: props.citySlug || undefined,
      })
    } catch {
      /* tab may be gated off */
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{props.title || 'Activités sur place'}</Text>
        <Text style={styles.sub}>
          {props.subtitle ||
            'Visites et expériences — sélection FlightWatcher, réservation Viator.'}
        </Text>
      </View>
      <Pressable style={styles.cta} onPress={onPress}>
        <Text style={styles.ctaText}>Voir</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
  },
  title: { fontFamily: fonts.bold, color: colors.primaryInk, fontSize: 14 },
  sub: { fontFamily: fonts.regular, color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ctaText: { color: '#fff', fontFamily: fonts.bold, fontSize: 13 },
})
