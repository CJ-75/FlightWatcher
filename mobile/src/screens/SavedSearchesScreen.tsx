import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import {
  CommonActions,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DateAvecHoraire, SavedSearch } from '@waypop/shared'
import { formatDateFr } from '@waypop/shared'
import { getApi } from '../lib/client'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'

function normalizeDates(raw: unknown): DateAvecHoraire[] {
  let list: unknown = raw
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return list
    .map((item) => {
      if (typeof item === 'string') {
        const date = item.trim()
        if (!date) return null
        return { date, heure_min: '06:00', heure_max: '23:59' }
      }
      if (!item || typeof item !== 'object') return null
      const d = item as Record<string, unknown>
      const date = String(d.date || '').trim()
      if (!date) return null
      return {
        date,
        heure_min: String(d.heure_min || '06:00'),
        heure_max: String(d.heure_max || '23:59'),
      }
    })
    .filter((d): d is DateAvecHoraire => Boolean(d))
}

function routeLabel(search: SavedSearch) {
  const origin = String(search.request.aeroport_depart || '').trim() || '—'
  const dest = (search.request.destinations_incluses || []).filter(Boolean)
  if (!dest.length) return `${origin} · inspire`
  const head = dest.slice(0, 3).join(' · ')
  const more = dest.length > 3 ? ` +${dest.length - 3}` : ''
  return `${origin} → ${head}${more}`
}

function datesSummary(search: SavedSearch) {
  const dep = normalizeDates(search.request.dates_depart)
  const ret = normalizeDates(search.request.dates_retour)
  const first = dep[0]?.date
  const last = ret[ret.length - 1]?.date || ret[0]?.date
  if (!first) return `${dep.length + ret.length} dates`
  if (!last || last === first) return formatDateFr(first)
  return `${formatDateFr(first)} → ${formatDateFr(last)}`
}

export function SavedSearchesScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()
  const [items, setItems] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true)
    try {
      const rows = await getApi().getSearches()
      setItems(Array.isArray(rows) ? rows : [])
    } catch {
      if (!opts?.soft) setItems([])
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

  const onDelete = (search: SavedSearch) => {
    Alert.alert('Supprimer', `Supprimer « ${search.name} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(search.id)
            try {
              await getApi().deleteSearch(search.id)
              setItems((prev) => prev.filter((s) => s.id !== search.id))
            } catch {
              Alert.alert('Erreur', 'Impossible de supprimer cette recherche.')
            } finally {
              setBusyId(null)
            }
          })()
        },
      },
    ])
  }

  const onRelaunch = (search: SavedSearch) => {
    const req = search.request
    const origin = String(req.aeroport_depart || '').trim().toUpperCase()
    const datesDepart = normalizeDates(req.dates_depart)
    const datesRetour = normalizeDates(req.dates_retour)
    const adults = Math.min(6, Math.max(1, Number(req.passengers) || 1))
    const out = datesDepart[0]?.date?.slice(0, 10)
    const inbound = datesRetour[datesRetour.length - 1]?.date?.slice(0, 10)

    navigation.dispatch(
      CommonActions.navigate({
        name: 'Main',
        params: {
          screen: 'Search',
          params: {
            origin: origin || undefined,
            adults,
            outbound: out,
            inbound: inbound && out && inbound > out ? inbound : undefined,
            budget: req.budget_max || undefined,
            datesDepart: datesDepart.length ? datesDepart : undefined,
            datesRetour: datesRetour.length ? datesRetour : undefined,
            autoSearch: Boolean(origin && datesDepart.length && datesRetour.length),
          },
        },
      }),
    )
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingBottom: Math.max(insets.bottom, 28),
        gap: spacing.md,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true)
            void load({ soft: true })
          }}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={styles.kicker}>COMPTE</Text>
      <Text style={styles.title}>Recherches sauvegardées</Text>
      <Text style={styles.subtitle}>
        Relance une recherche de vols ou supprime celles dont tu n’as plus besoin.
      </Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={[styles.emptyCard, shadow.soft]}>
          <Text style={styles.emptyTitle}>Aucune recherche</Text>
          <Text style={styles.emptyBody}>
            Depuis les résultats de vols, utilise « Sauvegarder » pour la retrouver ici.
          </Text>
        </View>
      ) : (
        items.map((search) => {
          const busy = busyId === search.id
          const budget = search.request.budget_max || 100
          const pax = Math.min(6, Math.max(1, Number(search.request.passengers) || 1))
          return (
            <View key={search.id} style={[styles.card, shadow.soft]}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {search.name}
                  </Text>
                  <Text style={styles.cardRoute} numberOfLines={1}>
                    {routeLabel(search)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => onDelete(search)}
                  disabled={busy}
                  hitSlop={8}
                  style={styles.deleteBtn}
                >
                  <Text style={styles.deleteText}>✕</Text>
                </Pressable>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{budget}€/pers</Text>
                </View>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    {pax} pers.
                  </Text>
                </View>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{datesSummary(search)}</Text>
                </View>
              </View>

              <Pressable
                onPress={() => onRelaunch(search)}
                disabled={busy}
                style={({ pressed }) => [
                  styles.cta,
                  pressed && { opacity: 0.92 },
                  busy && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.ctaText}>Relancer</Text>
              </Pressable>
            </View>
          )
        })
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  kicker: {
    fontFamily: fonts.extrabold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 4,
    fontFamily: fonts.extrabold,
    fontSize: type.title,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 8,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
  },
  emptyTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.ink,
    marginBottom: 6,
  },
  emptyBody: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 17,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  cardRoute: {
    marginTop: 4,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#DC2626',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.ink,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    color: colors.white,
  },
})
