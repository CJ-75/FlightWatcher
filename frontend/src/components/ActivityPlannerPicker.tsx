/**
 * Modal: choisir le séjour / planner cible pour une activité.
 * Charge les workspaces API + fallbacks locaux (remembered / guest-like drafts).
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { getCurrentSession, refreshAccessToken } from '../lib/supabase'
import { getApiClient } from '../utils/apiClient'
import { listTravelWorkspacesCached } from '../utils/workspacesCache'
import { listRememberedTrips } from '../utils/tripRecovery'

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
  open: boolean
  busy?: boolean
  preferredPlannedTripId?: string | null
  preferredDraftToken?: string | null
  title?: string
  hint?: string
  onClose: () => void
  onPick: (target: ActivityPlannerTarget) => void
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

export function ActivityPlannerPicker({
  open,
  busy = false,
  preferredPlannedTripId,
  preferredDraftToken,
  title = ACTIVITY_PICK_PLANNER_TITLE_FR,
  hint = ACTIVITY_PICK_PLANNER_HINT_FR,
  onClose,
  onPick,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authNeeded, setAuthNeeded] = useState(false)
  const [items, setItems] = useState<TravelWorkspace[]>([])
  const [expanded, setExpanded] = useState(false)

  const applyFilter = (rows: TravelWorkspace[]) =>
    filterActivitySwitcherWorkspaces(rows)

  useEffect(() => {
    if (!open) {
      setExpanded(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setAuthNeeded(false)
    setExpanded(false)
    void (async () => {
      const local = listRememberedTrips().map(rememberedAsWorkspace)

      try {
        let remote: TravelWorkspace[] = []
        try {
          const rows = await listTravelWorkspacesCached()
          remote = Array.isArray(rows) ? rows : []
        } catch (e) {
          const msg = e instanceof Error ? e.message : ''
          if (/401|403|auth|connect|auth_required/i.test(msg)) {
            const session = await getCurrentSession().catch(() => null)
            if (session?.user) {
              await refreshAccessToken()
              try {
                const rows = await listTravelWorkspacesCached({ force: true })
                remote = Array.isArray(rows) ? rows : []
              } catch {
                try {
                  const legacy = await getApiClient().listPlannedTrips()
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
                      'Tu es connecté, impossible de charger tes séjours. Réessaie.',
                    )
                  }
                  return
                }
              }
            } else {
              try {
                const legacy = await getApiClient().listPlannedTrips()
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
  }, [open])

  const visibleItems = useMemo(() => {
    if (expanded || items.length <= ACTIVITY_SWITCHER_SOFT_LIMIT) return items
    return items.slice(0, ACTIVITY_SWITCHER_SOFT_LIMIT)
  }, [expanded, items])

  const canExpand =
    !expanded && items.length > ACTIVITY_SWITCHER_SOFT_LIMIT

  if (!open) return null

  return (
    <div className="app-dialog-root z-[80]">
      <button
        type="button"
        className="app-dialog-backdrop"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className="app-dialog-panel app-dialog-md p-0 max-h-[85vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="relative shrink-0 overflow-hidden px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-orange-100/80 bg-gradient-to-br from-[#FFF8F3] via-white to-[#FFF1E8]">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary-700">
            {ACTIVITY_PICK_PLANNER_KICKER_FR}
          </p>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-black text-ink tracking-tight">
            {title}
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft leading-relaxed max-w-md">
            {hint}
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 space-y-2.5">
          {loading ? (
            <p className="text-sm text-muted py-8 text-center">Chargement…</p>
          ) : null}
          {error && !items.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900 space-y-2">
              <p>{error}</p>
              {authNeeded ? (
                <Link to="/compte" className="font-bold underline">
                  Se connecter
                </Link>
              ) : null}
            </div>
          ) : null}
          {!loading && !items.length && !error ? (
            <div className="rounded-2xl border border-dashed border-line bg-canvas px-4 py-6 text-sm text-muted space-y-3 text-center">
              <p className="font-semibold text-ink">{ACTIVITY_NO_PLANNER_TO_ADD_FR}</p>
              <Link
                to="/planner"
                className="inline-flex items-center justify-center rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-600"
              >
                {ACTIVITY_OPEN_PLANNER_FR}
              </Link>
            </div>
          ) : null}
          {visibleItems.map((ws) => {
            const planned = String(ws.planned_trip_id || '').trim()
            const draft = String(ws.draft_token || '').trim()
            const preferred =
              (preferredPlannedTripId && planned === preferredPlannedTripId) ||
              (preferredDraftToken && draft === preferredDraftToken)
            const dates = formatDates(ws)
            const label = workspaceLabel(ws)
            const city = workspaceCity(ws)
            const thumb = cityImageUrl(city, String(ws.dest_iata || '') || undefined)
            const invitee = Boolean(
              ws.is_invitee ||
                (planned && ws.is_organizer === false) ||
                ws.membership_joined_via === 'invite',
            )
            return (
              <button
                key={ws.workspace_id}
                type="button"
                disabled={busy}
                onClick={() =>
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
                className={`group w-full text-left rounded-2xl border px-3 py-3 transition-all disabled:opacity-50 ${
                  preferred
                    ? 'border-primary-300 bg-primary-50/80 shadow-sm shadow-orange-950/5'
                    : 'border-line bg-white hover:border-primary-200 hover:bg-[#FFF8F3] hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-black/5">
                    <img
                      src={thumb}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    {invitee || preferred ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {invitee ? (
                          <span className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 ring-1 ring-sky-100">
                            {ACTIVITY_STAY_KIND_INVITEE_FR}
                          </span>
                        ) : null}
                        {preferred ? (
                          <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-100">
                            {ACTIVITY_PICK_PLANNER_CURRENT_FR}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <p
                      className={`font-extrabold text-ink text-[15px] tracking-tight truncate ${
                        invitee || preferred ? 'mt-1' : ''
                      }`}
                    >
                      {label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted truncate">
                      {[dates, ws.dest_iata ? String(ws.dest_iata) : null]
                        .filter(Boolean)
                        .join(' · ') || 'Dates à préciser'}
                    </p>
                  </div>
                  <span className="shrink-0 inline-flex items-center rounded-xl bg-primary-500 px-3 py-2 text-xs font-extrabold text-white shadow-sm group-hover:bg-primary-600">
                    {ACTIVITY_PICK_PLANNER_ADD_FR}
                  </span>
                </div>
              </button>
            )
          })}
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full rounded-2xl border border-dashed border-line px-3 py-3 text-sm font-semibold text-primary-700 hover:bg-primary-50/50"
            >
              Voir plus ({items.length - ACTIVITY_SWITCHER_SOFT_LIMIT})
            </button>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-line px-4 sm:px-5 py-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-line font-semibold py-2.5 text-sm text-ink hover:bg-slate-50"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
