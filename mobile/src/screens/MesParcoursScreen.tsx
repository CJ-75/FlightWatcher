import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  citySlugDisplayNameFr,
  type Itinerary,
} from '@flightwatcher/shared'
import { ItineraryCard } from '../components/parcours/ItineraryCard'
import { getApi } from '../lib/client'
import { rememberParcoursPreview } from '../lib/parcoursCache'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type AdminItinerary = Itinerary & {
  status?: string | null
}

type Props = {
  headerExtra?: React.ReactNode
}

const STATUS_FR: Record<string, string> = {
  published: 'Publié',
  draft: 'Brouillon',
  retired: 'Retiré',
}

export function MesParcoursScreen({ headerExtra }: Props) {
  const insets = useSafeAreaInsets()
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [items, setItems] = useState<AdminItinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'published' | 'all'>('published')

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await getApi().adminListParcours({
        status: filter === 'published' ? 'published' : undefined,
        limit: 100,
      })
      if (!res.ok) throw new Error(res.error || 'Liste indisponible')
      setItems((res.itineraries || []) as unknown as AdminItinerary[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setItems([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [filter])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const openDetail = (it: AdminItinerary) => {
    const id = it.slug || it.id
    rememberParcoursPreview(it as Itinerary)
    navigation.navigate('ItineraryDetail', {
      itineraryId: id,
      preview: {
        id: it.id,
        slug: it.slug,
        title: it.title,
        cover_image: it.cover_image,
        city_slug: it.city_slug,
        budget_estimate_eur: it.budget_estimate_eur,
        budget_basis: it.budget_basis,
        itinerary_items: it.itinerary_items,
      },
    })
  }

  const manage = (it: AdminItinerary) => {
    const status = String(it.status || 'draft')
    const buttons: {
      text: string
      style?: 'cancel' | 'destructive' | 'default'
      onPress?: () => void
    }[] = [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Voir le rendu',
        onPress: () => openDetail(it),
      },
    ]
    if (status === 'published') {
      buttons.push({
        text: 'Retirer (unpublish)',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Retirer ce parcours ?',
            'Il ne sera plus visible dans le catalogue.',
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Retirer',
                style: 'destructive',
                onPress: () => {
                  void (async () => {
                    const res = await getApi().adminSetParcoursStatus(
                      it.id,
                      'retired',
                    )
                    if (!res.ok) {
                      Alert.alert('Erreur', res.error || 'Impossible')
                      return
                    }
                    void load(true)
                  })()
                },
              },
            ],
          )
        },
      })
    }
    buttons.push({
      text: 'Supprimer',
      style: 'destructive',
      onPress: () => {
        Alert.alert(
          'Supprimer définitivement ?',
          it.title || 'Ce parcours',
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  const res = await getApi().adminDeleteParcours(it.id)
                  if (!res.ok) {
                    Alert.alert('Erreur', res.error || 'Impossible')
                    return
                  }
                  void load(true)
                })()
              },
            },
          ],
        )
      },
    })
    Alert.alert(it.title || 'Parcours', 'Gérer ce parcours', buttons)
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.primary}
          />
        }
      >
        {headerExtra}
        <View style={styles.body}>
          <Text style={styles.kicker}>ADMIN</Text>
          <Text style={styles.heading}>Mes parcours</Text>
          <Text style={styles.lead}>
            Parcours publiés — même rendu que pour les utilisateurs. Appui long
            pour gérer.
          </Text>

          <View style={styles.filters}>
            {(
              [
                { id: 'published' as const, label: 'Publiés' },
                { id: 'all' as const, label: 'Tous' },
              ] as const
            ).map((f) => {
              const on = filter === f.id
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFilter(f.id)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {f.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {loading && !items.length ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 28 }} />
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!loading && !items.length && !error ? (
            <View style={[styles.empty, shadow.soft]}>
              <Text style={styles.emptyTitle}>Aucun parcours</Text>
              <Text style={styles.emptyBody}>
                Publie un parcours depuis le + pour le retrouver ici.
              </Text>
            </View>
          ) : null}

          {items.map((it) => {
            const status = String(it.status || 'draft')
            const city = it.city_slug
              ? citySlugDisplayNameFr(it.city_slug) || it.city_slug
              : ''
            return (
              <View key={it.id} style={styles.row}>
                <ItineraryCard
                  itinerary={it}
                  variant="landscape"
                  badge={STATUS_FR[status] || status}
                  onPress={() => openDetail(it)}
                  onPressIn={() => rememberParcoursPreview(it as Itinerary)}
                  style={{ alignSelf: 'center' }}
                />
                <Pressable
                  onPress={() => manage(it)}
                  onLongPress={() => manage(it)}
                  style={styles.manageHit}
                  hitSlop={8}
                >
                  <Text style={styles.manageText}>
                    Gérer{city ? ` · ${city}` : ''}
                  </Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: 4,
  },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.primary,
    marginBottom: 2,
  },
  heading: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: colors.ink,
  },
  lead: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 14,
  },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
  chipTextOn: { color: '#FFF8F3' },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.danger,
    marginBottom: 12,
  },
  empty: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.xl,
    padding: 18,
  },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  emptyBody: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 18,
  },
  row: { marginBottom: 18 },
  manageHit: { marginTop: 8, alignSelf: 'center' },
  manageText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
})
