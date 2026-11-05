/**
 * Modal: choisir le séjour / planner cible pour une activité.
 */
import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ACTIVITY_NO_PLANNER_TO_ADD_FR,
  ACTIVITY_PICK_PLANNER_HINT_FR,
  ACTIVITY_PICK_PLANNER_TITLE_FR,
  ACTIVITY_SIGN_IN_TO_ADD_FR,
  ACTIVITY_SWITCHER_SOFT_LIMIT,
  cityDisplayNameFr,
  filterActivitySwitcherWorkspaces,
  parseAirportCodes,
  type PlannedTrip,
  type TravelWorkspace,
} from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { listGuestTrips } from '../dev/guestPreview'
import { auth, getApi } from '../lib/client'
import { listRememberedTrips } from '../lib/tripRecovery'
import { colors, fonts, radius, shadow, spacing } from '../theme'

function tripAsWorkspace(trip: PlannedTrip): TravelWorkspace {
  const dest = parseAirportCodes(trip.arrival_airport)[0] || null
  return {
    workspace_id: `planner:${trip.id}`,
    planned_trip_id: trip.id,
    proposal_id: trip.accepted_proposal?.id || null,
    scope: 'collaborative',
    phase: trip.status === 'locked' ? 'flight_selected' : 'planning',
    title: trip.name,
    city: dest ? cityDisplayNameFr(dest) : 'Destination libre',
    origin_iata: trip.departure_airport,
    dest_iata: trip.arrival_airport,
    out_date: trip.dates_depart?.[0]?.date || null,
    ret_date: trip.dates_retour?.[trip.dates_retour.length - 1]?.date || null,
    is_organizer: true,
    capabilities: {
      can_scan: trip.status !== 'locked',
      can_choose_flight: trip.status !== 'locked',
      can_compose_hotel: trip.status === 'locked',
      can_view_confirmation: false,
    },
    pipeline: {
      flight: trip.status === 'locked' ? 'selected' : 'none',
      hotel: 'none',
    },
    planned_trip: trip,
    updated_at: trip.updated_at || trip.created_at,
  }
}

function rememberedAsWorkspace(row: {
  draft_token: string
  city?: string | null
  at: number
}): TravelWorkspace {
  const city = String(row.city || '').trim() || 'Séjour'
  return {
    workspace_id: `draft:${row.draft_token}`,
    draft_token: row.draft_token,
    scope: 'personal',
    phase: 'composing',
    title: city,
    city,
    is_organizer: true,
    capabilities: {
      can_scan: false,
      can_choose_flight: false,
      can_compose_hotel: true,
      can_view_confirmation: true,
    },
    pipeline: { flight: 'none', hotel: 'none' },
    updated_at: new Date(row.at).toISOString(),
  }
}

export type ActivityPlannerTarget = {
  plannedTripId?: string
  draftToken?: string
  label: string
  city?: string
  destIata?: string
  outDate?: string | null
  retDate?: string | null
}

type Props = {
  visible: boolean
  busy?: boolean
  preferredPlannedTripId?: string | null
  preferredDraftToken?: string | null
  catalogCity?: string | null
  title?: string
  hint?: string
  onClose: () => void
  onPick: (target: ActivityPlannerTarget) => void
  onOpenPlanner?: () => void
  onSignIn?: () => void
}

function formatDates(ws: TravelWorkspace): string | null {
  const out = ws.out_date ? String(ws.out_date).slice(0, 10) : ''
  const ret = ws.ret_date ? String(ws.ret_date).slice(0, 10) : ''
  if (out && ret) return `${out} → ${ret}`
  if (out) return out
  return null
}

function workspaceLabel(ws: TravelWorkspace): string {
  const title = String(ws.title || '').trim()
  const city = String(ws.city || '').trim()
  if (title && city && !title.toLowerCase().includes(city.toLowerCase())) {
    return `${title} · ${city}`
  }
  return title || city || 'Séjour'
}

export function ActivityPlannerPicker({
  visible,
  busy = false,
  preferredPlannedTripId,
  preferredDraftToken,
  catalogCity = null,
  title = ACTIVITY_PICK_PLANNER_TITLE_FR,
  hint = ACTIVITY_PICK_PLANNER_HINT_FR,
  onClose,
  onPick,
  onOpenPlanner,
  onSignIn,
}: Props) {
  const insets = useSafeAreaInsets()
  const { isGuest, user, session } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authNeeded, setAuthNeeded] = useState(false)
  const [items, setItems] = useState<TravelWorkspace[]>([])
  const [expanded, setExpanded] = useState(false)
  const loggedIn = Boolean(user || session?.user)

  const applyFilter = (rows: TravelWorkspace[]) =>
    filterActivitySwitcherWorkspaces(rows, { catalogCity })

  useEffect(() => {
    if (!visible) {
      setExpanded(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setAuthNeeded(false)
    setExpanded(false)
    void (async () => {
      const local: TravelWorkspace[] = []
      try {
        if (__DEV__ && isGuest) {
          local.push(...listGuestTrips().map(tripAsWorkspace))
        }
        const remembered = await listRememberedTrips()
        local.push(...remembered.map(rememberedAsWorkspace))
      } catch {
        /* ignore local */
      }

      try {
        if (__DEV__ && isGuest) {
          if (cancelled) return
          setItems(applyFilter(local))
          return
        }
        let remote: TravelWorkspace[] = []
        try {
          const rows = await getApi().listTravelWorkspaces()
          remote = Array.isArray(rows) ? rows : []
        } catch (e) {
          const msg = e instanceof Error ? e.message : ''
          if (/401|403|auth|connect|auth_required/i.test(msg)) {
            if (loggedIn) {
              await auth.refreshAccessToken()
              try {
                const rows = await getApi().listTravelWorkspaces()
                remote = Array.isArray(rows) ? rows : []
              } catch {
                try {
                  const legacy = await getApi().listPlannedTrips()
                  remote = (Array.isArray(legacy) ? legacy : []).map(
                    tripAsWorkspace,
                  )
                } catch {
                  if (cancelled) return
                  const merged = applyFilter(local)
                  setItems(merged)
                  if (!merged.length) {
                    setAuthNeeded(true)
                    setError(
                      'Tu es connecté — impossible de charger tes séjours. Réessaie.',
                    )
                  }
                  return
                }
              }
            } else {
              try {
                const legacy = await getApi().listPlannedTrips()
                remote = (Array.isArray(legacy) ? legacy : []).map(tripAsWorkspace)
              } catch {
                if (cancelled) return
                const merged = applyFilter(local)
                setItems(merged)
                if (!merged.length) {
                  setAuthNeeded(true)
                  setError(ACTIVITY_SIGN_IN_TO_ADD_FR)
                }
                return
              }
            }
          } else {
            throw e
          }
        }
        if (cancelled) return
        setItems(applyFilter([...remote, ...local]))
      } catch (e) {
        if (cancelled) return
        const merged = applyFilter(local)
        setItems(merged)
        if (!merged.length) {
          setError(e instanceof Error ? e.message : 'Erreur')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [visible, isGuest, loggedIn, catalogCity])

  const visibleItems = useMemo(() => {
    if (expanded || items.length <= ACTIVITY_SWITCHER_SOFT_LIMIT) return items
    return items.slice(0, ACTIVITY_SWITCHER_SOFT_LIMIT)
  }, [expanded, items])

  const canExpand =
    !expanded && items.length > ACTIVITY_SWITCHER_SOFT_LIMIT

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            shadow.soft,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{hint}</Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : null}

          {error && !items.length ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              {authNeeded && onSignIn ? (
                <Pressable onPress={onSignIn} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Se connecter</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {!loading && !items.length && !error ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{ACTIVITY_NO_PLANNER_TO_ADD_FR}</Text>
              {onOpenPlanner ? (
                <Pressable onPress={onOpenPlanner} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Ouvrir Voyages</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
            {visibleItems.map((ws) => {
              const planned = String(ws.planned_trip_id || '').trim()
              const draft = String(ws.draft_token || '').trim()
              const preferred =
                (preferredPlannedTripId && planned === preferredPlannedTripId) ||
                (preferredDraftToken && draft === preferredDraftToken)
              const dates = formatDates(ws)
              const label = workspaceLabel(ws)
              return (
                <Pressable
                  key={ws.workspace_id}
                  disabled={busy}
                  onPress={() =>
                    onPick({
                      plannedTripId: planned || undefined,
                      draftToken: planned ? undefined : draft || undefined,
                      label,
                      city: String(ws.city || '').trim() || undefined,
                      destIata: String(ws.dest_iata || '').trim() || undefined,
                      outDate: ws.out_date
                        ? String(ws.out_date).slice(0, 10)
                        : null,
                      retDate: ws.ret_date
                        ? String(ws.ret_date).slice(0, 10)
                        : null,
                    })
                  }
                  style={({ pressed }) => [
                    styles.row,
                    preferred && styles.rowPreferred,
                    pressed && { opacity: 0.9 },
                    busy && { opacity: 0.5 },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {label}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {[
                        planned ? 'Voyage' : 'Séjour',
                        dates,
                        ws.dest_iata ? String(ws.dest_iata) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.plus}>+</Text>
                </Pressable>
              )
            })}
            {canExpand ? (
              <Pressable
                onPress={() => setExpanded(true)}
                style={({ pressed }) => [
                  styles.moreBtn,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.moreText}>
                  Voir plus ({items.length - ACTIVITY_SWITCHER_SOFT_LIMIT})
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>

          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Annuler</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: 10,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  hint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: 4,
  },
  errorBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
    padding: 12,
    gap: 8,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#92400E',
  },
  emptyBox: {
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 14,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  linkBtn: { paddingVertical: 4 },
  linkText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.white,
  },
  rowPreferred: {
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primarySoft,
  },
  rowTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  rowMeta: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  plus: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.primary,
  },
  moreBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  moreText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
  cancel: {
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
  },
})
