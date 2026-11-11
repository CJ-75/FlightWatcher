import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Platform,
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
import {
  invalidateParcoursCatalog,
  rememberParcoursPreview,
} from '../lib/parcoursCache'
import {
  beginEditParcoursSession,
  clearParcoursCreateSession,
  getParcoursCreateSession,
  hasParcoursCreateDraft,
} from '../lib/parcoursCreateSession'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type AdminItinerary = Itinerary & {
  status?: string | null
}

type StatusFilter = 'published' | 'draft' | 'retired' | 'all'

type Props = {
  headerExtra?: React.ReactNode
}

const STATUS_META: Record<
  string,
  { label: string; color: string; chip: string }
> = {
  published: {
    label: 'Publié',
    color: '#0F7A4E',
    chip: 'Publiés',
  },
  draft: {
    label: 'Brouillon',
    color: '#B45309',
    chip: 'Brouillons',
  },
  retired: {
    label: 'Retiré',
    color: '#9A3412',
    chip: 'Retirés',
  },
}

/** Cache mémoire — bascule de filtre sans refetch lourd. */
let listCache: { at: number; items: AdminItinerary[] } | null = null
const CACHE_MS = 45_000

function statusOf(it: AdminItinerary): string {
  const s = String(it.status || 'draft').toLowerCase()
  return STATUS_META[s] ? s : 'draft'
}

export function MesParcoursScreen({ headerExtra }: Props) {
  const insets = useSafeAreaInsets()
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [allItems, setAllItems] = useState<AdminItinerary[]>(
    () => listCache?.items || [],
  )
  const [loading, setLoading] = useState(!listCache?.items.length)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('published')

  const applyItems = useCallback((next: AdminItinerary[]) => {
    listCache = { at: Date.now(), items: next }
    setAllItems(next)
  }, [])

  const load = useCallback(
    async (refresh = false) => {
      const hasCache = !!(listCache && listCache.items.length > 0)
      const fresh =
        hasCache && !refresh && Date.now() - listCache!.at < CACHE_MS
      if (fresh) {
        setAllItems(listCache!.items)
        setLoading(false)
      } else if (refresh) {
        setRefreshing(true)
      } else if (!hasCache) {
        setLoading(true)
      } else {
        // Affiche le cache périmé pendant le refetch
        setAllItems(listCache!.items)
        setLoading(false)
      }

      setError(null)
      try {
        // Liste légère (sans items) — filtre statut côté client = instantané
        const res = await getApi().adminListParcours({
          limit: 100,
          include_items: false,
        })
        if (!res.ok) throw new Error(res.error || 'Liste indisponible')
        applyItems((res.itineraries || []) as unknown as AdminItinerary[])
      } catch (e) {
        if (!listCache?.items.length) {
          setError(e instanceof Error ? e.message : 'Erreur')
          applyItems([])
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [applyItems],
  )

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const counts = useMemo(() => {
    const c = { published: 0, draft: 0, retired: 0, all: allItems.length }
    for (const it of allItems) {
      const s = statusOf(it) as 'published' | 'draft' | 'retired'
      c[s] += 1
    }
    return c
  }, [allItems])

  const items = useMemo(() => {
    if (filter === 'all') return allItems
    return allItems.filter((it) => statusOf(it) === filter)
  }, [allItems, filter])

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

  const goEdit = (full: Itinerary, itineraryId: string) => {
    beginEditParcoursSession(full)
    navigation.navigate('CreateParcoursSteps', {
      itineraryId,
      seed: {
        title: full.title,
        city_slug: full.city_slug || undefined,
        cover_image: full.cover_image,
      },
    })
  }

  const startEdit = (it: AdminItinerary) => {
    const draft = getParcoursCreateSession()

    const proceed = () => {
      const hasItems =
        Array.isArray(it.itinerary_items) && it.itinerary_items.length > 0
      if (hasItems) {
        goEdit(it as Itinerary, it.id)
        return
      }
      goEdit(
        {
          ...it,
          itinerary_items: it.itinerary_items || [],
        } as Itinerary,
        it.id,
      )
      void getApi()
        .adminGetParcours(it.id)
        .then((res) => {
          if (!res.ok || !res.itinerary) return
          beginEditParcoursSession(res.itinerary as unknown as Itinerary)
          navigation.navigate('CreateParcoursSteps', {
            itineraryId: it.id,
            seed: {
              title: res.itinerary.title,
              city_slug: res.itinerary.city_slug || undefined,
              cover_image: res.itinerary.cover_image,
            },
          })
        })
        .catch(() => {})
    }

    if (
      hasParcoursCreateDraft() &&
      draft?.editing_id !== it.id &&
      (draft?.steps?.length || draft?.title)
    ) {
      Alert.alert(
        'Brouillon en cours',
        'Éditer ce parcours remplace le brouillon actuel.',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Continuer',
            style: 'destructive',
            onPress: proceed,
          },
        ],
      )
      return
    }
    proceed()
  }

  const confirmUnpublish = (it: AdminItinerary) => {
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
              applyItems(
                allItems.map((row) =>
                  row.id === it.id ? { ...row, status: 'retired' } : row,
                ),
              )
              invalidateParcoursCatalog({
                removeId: it.id,
                removeSlug: it.slug,
              })
              void load(true)
            })()
          },
        },
      ],
    )
  }

  const confirmDelete = (it: AdminItinerary) => {
    Alert.alert('Supprimer définitivement ?', it.title || 'Ce parcours', [
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
            applyItems(allItems.filter((row) => row.id !== it.id))
            invalidateParcoursCatalog({
              removeId: it.id,
              removeSlug: it.slug,
            })
            void load(true)
          })()
        },
      },
    ])
  }

  /** Android = max 3 boutons Alert — actions destructives en 2e étape. */
  const manage = (it: AdminItinerary) => {
    const status = statusOf(it)
    if (Platform.OS === 'android') {
      Alert.alert(it.title || 'Parcours', 'Autres actions', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Voir le rendu', onPress: () => openDetail(it) },
        {
          text: status === 'published' ? 'Retirer / supprimer…' : 'Supprimer…',
          style: 'destructive',
          onPress: () => {
            if (status === 'published') {
              Alert.alert(it.title || 'Parcours', undefined, [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Retirer',
                  style: 'destructive',
                  onPress: () => confirmUnpublish(it),
                },
                {
                  text: 'Supprimer',
                  style: 'destructive',
                  onPress: () => confirmDelete(it),
                },
              ])
            } else {
              confirmDelete(it)
            }
          },
        },
      ])
      return
    }
    const buttons: {
      text: string
      style?: 'cancel' | 'destructive' | 'default'
      onPress?: () => void
    }[] = [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Voir le rendu', onPress: () => openDetail(it) },
    ]
    if (status === 'published') {
      buttons.push({
        text: 'Retirer (unpublish)',
        style: 'destructive',
        onPress: () => confirmUnpublish(it),
      })
    }
    buttons.push({
      text: 'Supprimer',
      style: 'destructive',
      onPress: () => confirmDelete(it),
    })
    Alert.alert(it.title || 'Parcours', 'Gérer ce parcours', buttons)
  }

  const filters: { id: StatusFilter; label: string }[] = [
    { id: 'published', label: `${STATUS_META.published.chip} (${counts.published})` },
    { id: 'draft', label: `${STATUS_META.draft.chip} (${counts.draft})` },
    { id: 'retired', label: `${STATUS_META.retired.chip} (${counts.retired})` },
    { id: 'all', label: `Tous (${counts.all})` },
  ]

  const emptyCopy =
    filter === 'published'
      ? 'Aucun parcours publié pour l’instant.'
      : filter === 'draft'
        ? 'Aucun brouillon.'
        : filter === 'retired'
          ? 'Aucun parcours retiré.'
          : 'Publie un parcours depuis le + pour le retrouver ici.'

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
            Filtre instantané par statut. Éditer pour modifier, Gérer pour
            retirer ou supprimer.
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            {filters.map((f) => {
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
          </ScrollView>

          {loading && !allItems.length ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 28 }} />
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!loading && !items.length && !error ? (
            <View style={[styles.empty, shadow.soft]}>
              <Text style={styles.emptyTitle}>Aucun parcours</Text>
              <Text style={styles.emptyBody}>{emptyCopy}</Text>
            </View>
          ) : null}

          {items.map((it) => {
            const status = statusOf(it)
            const meta = STATUS_META[status]
            const city = it.city_slug
              ? citySlugDisplayNameFr(it.city_slug) || it.city_slug
              : ''
            return (
              <View key={it.id} style={styles.row}>
                <ItineraryCard
                  itinerary={it}
                  variant="landscape"
                  badge={meta.label}
                  badgeColor={meta.color}
                  onPress={() => openDetail(it)}
                  onPressIn={() => rememberParcoursPreview(it as Itinerary)}
                  style={{ alignSelf: 'center' }}
                />
                <View style={styles.metaRow}>
                  <View
                    style={[styles.statusPill, { backgroundColor: meta.color }]}
                  >
                    <Text style={styles.statusPillText}>{meta.label}</Text>
                  </View>
                  {city ? (
                    <Text style={styles.metaCity} numberOfLines={1}>
                      {city}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => startEdit(it)}
                    style={styles.actionHit}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Éditer ${it.title || 'parcours'}`}
                  >
                    <Text style={styles.actionPrimary}>Éditer</Text>
                  </Pressable>
                  <Text style={styles.actionDot}>·</Text>
                  <Pressable
                    onPress={() => manage(it)}
                    style={styles.actionHit}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Gérer"
                  >
                    <Text style={styles.actionMuted}>Gérer</Text>
                  </Pressable>
                </View>
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
  filters: { flexDirection: 'row', gap: 8, marginBottom: 16, paddingRight: 8 },
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
  metaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#FFF8F3',
    letterSpacing: 0.2,
  },
  metaCity: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    maxWidth: '50%',
  },
  actions: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionHit: { paddingVertical: 4, paddingHorizontal: 2 },
  actionPrimary: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primary,
  },
  actionMuted: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
  },
  actionDot: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.faint,
  },
})
