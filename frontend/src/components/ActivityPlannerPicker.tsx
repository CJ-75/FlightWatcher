/**
 * Modal: choisir le séjour / planner cible pour une activité.
 * Charge les workspaces API + fallbacks locaux (remembered / guest-like drafts).
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { getCurrentSession, refreshAccessToken } from '../lib/supabase'
import { getApiClient } from '../utils/apiClient'
import { listRememberedTrips } from '../utils/tripRecovery'

export type ActivityPlannerTarget = {
  plannedTripId?: string
  draftToken?: string
  label: string
  city?: string
  destIata?: string
}

type Props = {
  open: boolean
  busy?: boolean
  preferredPlannedTripId?: string | null
  preferredDraftToken?: string | null
  catalogCity?: string | null
  title?: string
  hint?: string
  onClose: () => void
  onPick: (target: ActivityPlannerTarget) => void
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
  catalogCity = null,
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
    filterActivitySwitcherWorkspaces(rows, { catalogCity })

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
          const rows = await getApiClient().listTravelWorkspaces()
          remote = Array.isArray(rows) ? rows : []
        } catch (e) {
          const msg = e instanceof Error ? e.message : ''
          if (/401|403|auth|connect|auth_required/i.test(msg)) {
            // Already logged in? refresh JWT and retry before asking to sign in.
            const session = await getCurrentSession().catch(() => null)
            if (session?.user) {
              await refreshAccessToken()
              try {
                const rows = await getApiClient().listTravelWorkspaces()
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
                      'Tu es connecté — impossible de charger tes séjours. Réessaie.',
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
  }, [open, catalogCity])

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
        className="app-dialog-panel app-dialog-md p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div>
          <h2 className="text-lg font-extrabold text-ink tracking-tight">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted">{hint}</p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {loading ? (
            <p className="text-sm text-muted py-6 text-center">Chargement…</p>
          ) : null}
          {error && !items.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 space-y-2">
              <p>{error}</p>
              {authNeeded ? (
                <Link to="/compte" className="font-bold underline">
                  Se connecter
                </Link>
              ) : null}
            </div>
          ) : null}
          {!loading && !items.length && !error ? (
            <div className="rounded-xl border border-line bg-canvas px-3 py-4 text-sm text-muted space-y-2 text-center">
              <p>{ACTIVITY_NO_PLANNER_TO_ADD_FR}</p>
              <Link to="/planner" className="font-bold text-primary-700 underline">
                Ouvrir Planner
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
                    city: String(ws.city || '').trim() || undefined,
                    destIata: String(ws.dest_iata || '').trim() || undefined,
                  })
                }
                className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors disabled:opacity-50 ${
                  preferred
                    ? 'border-primary-300 bg-primary-50/70'
                    : 'border-line bg-white hover:border-primary-200 hover:bg-primary-50/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-ink text-sm truncate">{label}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[
                        planned ? 'Planner' : 'Séjour',
                        dates,
                        ws.dest_iata ? String(ws.dest_iata) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <span className="shrink-0 text-primary-600 font-extrabold text-lg leading-none">
                    +
                  </span>
                </div>
              </button>
            )
          })}
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full rounded-xl border border-dashed border-line px-3 py-2.5 text-sm font-semibold text-primary-700 hover:bg-primary-50/50"
            >
              Voir plus ({items.length - ACTIVITY_SWITCHER_SOFT_LIMIT})
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-line font-semibold py-2.5 text-sm"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
