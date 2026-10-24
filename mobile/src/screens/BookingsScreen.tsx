import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { HotelBooking } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
import { colors, fonts, radius, shadow, spacing } from '../theme'

export function BookingsScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [bookings, setBookings] = useState<HotelBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const list = await getApi().listHotelBookings()
      setBookings(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setBookings([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  return (
    <View style={styles.root}>
      <ScreenBackground />
      {loading && bookings.length === 0 ? (
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{
            paddingTop: insets.top + 12,
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 40,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Pressable onPress={() => navigation.goBack()}>
                <Text style={styles.back}>← Retour</Text>
              </Pressable>
              <Text style={styles.title}>Mes réservations</Text>
              <Text style={styles.sub}>Hôtels réservés via FlightWatcher</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.empty, shadow.soft]}>
              <Text style={styles.emptyTitle}>{error || 'Aucune réservation'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, shadow.soft]}>
              <Text style={styles.city}>
                {item.city || 'Séjour'} · {item.hotel_name || 'Hôtel'}
              </Text>
              <Text style={styles.status}>{item.status}</Text>
              {item.confirmation_code ? (
                <Text style={styles.code}>Code {item.confirmation_code}</Text>
              ) : null}
              {item.charged_price != null ? (
                <Text style={styles.price}>{Math.round(Number(item.charged_price))} €</Text>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: spacing.xl },
  back: { fontFamily: fonts.bold, color: colors.primary, marginBottom: 8 },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.8,
  },
  sub: { marginTop: 4, fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  empty: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 24,
  },
  emptyTitle: { fontFamily: fonts.semibold, color: colors.muted },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  city: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  status: { marginTop: 6, fontFamily: fonts.semibold, fontSize: 12, color: colors.primary },
  code: { marginTop: 4, fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  price: { marginTop: 8, fontFamily: fonts.extrabold, fontSize: 18, color: colors.primary },
})
