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
  Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ACTIVITY_NO_PLANNER_TO_ADD_FR,
  ACTIVITY_OPEN_PLANNER_FR,
  ACTIVITY_PICK_PLANNER_ADD_FR,
  ACTIVITY_PICK_PLANNER_CURRENT_FR,
  ACTIVITY_PICK_PLANNER_HINT_FR,
  ACTIVITY_PICK_PLANNER_KICKER_FR,
  ACTIVITY_PICK_PLANNER_TITLE_FR,
  ACTIVITY_SIGN_IN_TO_ADD_FR,
  ACTIVITY_STAY_KIND_INVITEE_FR,
  ACTIVITY_SWITCHER_SOFT_LIMIT,
  activityStayCityToken,
  activityWorkspaceStayLabel,
  cityDisplayNameFr,
  cityImageUrl,
  filterActivitySwitcherWorkspaces,
  parseAirportCodes,
  type PlannedTrip,
  type TravelWorkspace,
} from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { listGuestTrips } from '../dev/guestPreview'
import { auth, getApi } from '../lib/client'
import {
  hydrateTravelWorkspacesCache,
  listTravelWorkspacesCached,
  peekTravelWorkspacesCache,
} from '../lib/workspacesCache'
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
  title?: string
  hint?: string
  onClose: () => void
  onPick: (target: ActivityPlannerTarget) => void
  onOpenPlanner?: () => void
  onSignIn?: () => void
}

function formatDay(raw?: string | null): string | null {
  const s = String(raw || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [, m, d] = s.split('-')
  return `${d}/${m}`
}

function formatDates(ws: TravelWorkspace): string | null {
  const out = formatDay(ws.out_date)
  const ret = formatDay(ws.ret_date)
  if (out && ret) return `${out} → ${ret}`
  if (out) return `Départ ${out}`
  return null
}

function workspaceLabel(ws: TravelWorkspace): string {
  return activityWorkspaceStayLabel(ws)
}

function workspaceCity(ws: TravelWorkspace): string {
  return (
    activityStayCityToken(ws.city) ||
    cityDisplayNameFr(String(ws.dest_iata || '').trim()) ||
    'Séjour'
  )
}

export function ActivityPlannerPicker({
  visible,
  busy = false,
  preferredPlannedTripId,
  preferredDraftToken,
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
    filterActivitySwitcherWorkspaces(rows)

  useEffect(() => {
    if (!visible) {
      setExpanded(false)
      return
    }
    let cancelled = false
    setError(null)
    setAuthNeeded(false)
    setExpanded(false)

    const paint = (remote: TravelWorkspace[], local: TravelWorkspace[]) => {
      if (cancelled) return
      setItems(applyFilter([...remote, ...local]))
    }

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

      // Instant paint from memory / disk — no spinner if we already have rows.
      const mem = peekTravelWorkspacesCache()
      if (mem?.length) {
        paint(mem, local)
        setLoading(false)
      } else {
        const disk = await hydrateTravelWorkspacesCache()
        if (cancelled) return
        if (disk?.length || local.length) {
          paint(disk || [], local)
          setLoading(false)
        } else {
          setLoading(true)
        }
      }

      try {
        if (__DEV__ && isGuest) {
          if (cancelled) return
          paint([], local)
          return
        }
        let remote: TravelWorkspace[] = []
        try {
          const rows = await listTravelWorkspacesCached()
          remote = Array.isArray(rows) ? rows : []
        } catch (e) {
          const msg = e instanceof Error ? e.message : ''
          if (/401|403|auth|connect|auth_required/i.test(msg)) {
            if (loggedIn) {
              await auth.refreshAccessToken()
              try {
                const rows = await listTravelWorkspacesCached({ force: true })
                remote = Array.isArray(rows) ? rows : []
              } catch {
                try {
                  const legacy = await getApi().listPlannedTrips()
                  remote = (Array.isArray(legacy) ? legacy : []).map(
                    tripAsWorkspace,
                  )
                } catch {
                  if (cancelled) return
                  paint([], local)
                  if (!local.length && !peekTravelWorkspacesCache()?.length) {
                    setAuthNeeded(true)
                    setError(
                      'Impossible de charger les séjours. Réessayer.',
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
                paint([], local)
                if (!local.length) {
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
        paint(remote, local)
      } catch (e) {
        if (cancelled) return
        const hadCache = Boolean(peekTravelWorkspacesCache()?.length || local.length)
        if (!hadCache) {
          paint([], local)
          const msg = e instanceof Error ? e.message : 'Erreur'
          setError(
            /fetch failed|network request failed|failed to fetch/i.test(msg)
              ? 'Connexion impossible. Vérifie le réseau / le backend, puis réessaie.'
              : msg,
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [visible, isGuest, loggedIn])

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
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <Text style={styles.kicker}>{ACTIVITY_PICK_PLANNER_KICKER_FR}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.hint}>{hint}</Text>
          </View>

          {loading && !items.length ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : null}

          {loading && items.length ? (
            <Text style={styles.refreshHint}>Mise à jour des séjours…</Text>
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
              <Text style={styles.emptyTitle}>{ACTIVITY_NO_PLANNER_TO_ADD_FR}</Text>
              {onOpenPlanner ? (
                <Pressable onPress={onOpenPlanner} style={styles.emptyCta}>
                  <Text style={styles.emptyCtaText}>{ACTIVITY_OPEN_PLANNER_FR}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <ScrollView
            style={{ maxHeight: 420 }}
            contentContainerStyle={{ gap: 10, paddingHorizontal: spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            {visibleItems.map((ws) => {
              const planned = String(ws.planned_trip_id || '').trim()
              const draft = String(ws.draft_token || '').trim()
              const preferred =
                (preferredPlannedTripId && planned === preferredPlannedTripId) ||
                (preferredDraftToken && draft === preferredDraftToken)
              const dates = formatDates(ws)
              const label = workspaceLabel(ws)
              const city = workspaceCity(ws)
              const thumb = cityImageUrl(
                city,
                String(ws.dest_iata || '') || undefined,
              )
              const invitee = Boolean(
                ws.is_invitee ||
                  (planned && ws.is_organizer === false) ||
                  ws.membership_joined_via === 'invite',
              )
              return (
                <Pressable
                  key={ws.workspace_id}
                  disabled={busy}
                  onPress={() =>
                    onPick({
                      plannedTripId: planned || undefined,
                      draftToken: planned ? undefined : draft || undefined,
                      label,
                      city: activityStayCityToken(ws.city) || undefined,
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
                    pressed && { opacity: 0.92 },
                    busy && { opacity: 0.5 },
                  ]}
                >
                  <Image source={{ uri: thumb }} style={styles.thumb} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {invitee || preferred ? (
                      <View style={styles.badgeRow}>
                        {invitee ? (
                          <View style={[styles.kindBadge, styles.kindShared]}>
                            <Text style={[styles.kindText, styles.kindTextShared]}>
                              {ACTIVITY_STAY_KIND_INVITEE_FR}
                            </Text>
                          </View>
                        ) : null}
                        {preferred ? (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentText}>
                              {ACTIVITY_PICK_PLANNER_CURRENT_FR}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {label}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {[dates, ws.dest_iata ? String(ws.dest_iata) : null]
                        .filter(Boolean)
                        .join(' · ') || 'Dates à préciser'}
                    </Text>
                  </View>
                  <View style={styles.addChip}>
                    <Text style={styles.addChipText}>
                      {ACTIVITY_PICK_PLANNER_ADD_FR}
                    </Text>
                  </View>
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    maxHeight: '92%',
  },
  handleWrap: { alignItems: 'center', paddingBottom: 6 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#FED7AA',
    backgroundColor: '#FFF8F3',
    marginBottom: 12,
  },
  kicker: {
    fontFamily: fonts.extrabold,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.primary,
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  hint: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 19,
  },
  refreshHint: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: spacing.lg,
  },
  errorBox: {
    marginHorizontal: spacing.lg,
    backgroundColor: '#FFFBEB',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
    padding: 14,
    gap: 8,
    marginBottom: 8,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#92400E',
  },
  emptyBox: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.canvas,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderStyle: 'dashed',
    padding: 18,
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyCtaText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
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
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.white,
  },
  rowPreferred: {
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primarySoft,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.canvas,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  kindBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  kindShared: { backgroundColor: '#F0F9FF' },
  kindSolo: { backgroundColor: colors.canvas },
  kindText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  kindTextShared: { color: '#075985' },
  kindTextSolo: { color: colors.muted },
  currentBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#ECFDF5',
  },
  currentText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#065F46',
  },
  rowTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  rowMeta: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  addChip: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addChipText: {
    fontFamily: fonts.extrabold,
    fontSize: 12,
    color: colors.white,
  },
  moreBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  moreText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
  cancel: {
    marginTop: 12,
    marginHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
  },
})
