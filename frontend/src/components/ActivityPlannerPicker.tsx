/**
 * Modal: choisir le séjour / planner cible pour une activité.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ACTIVITY_NO_PLANNER_TO_ADD_FR,
  ACTIVITY_PICK_PLANNER_HINT_FR,
  ACTIVITY_PICK_PLANNER_TITLE_FR,
  ACTIVITY_SIGN_IN_TO_ADD_FR,
  type TravelWorkspace,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'

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
  const [items, setItems] = useState<TravelWorkspace[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const rows = await getApiClient().listTravelWorkspaces()
        if (cancelled) return
        const usable = (Array.isArray(rows) ? rows : []).filter(
          (w) =>
            Boolean(String(w.planned_trip_id || '').trim()) ||
            Boolean(String(w.draft_token || '').trim()),
        )
        // Prefer collaborative planners first, then personal.
        usable.sort((a, b) => {
          const ap = a.planned_trip_id ? 0 : 1
          const bp = b.planned_trip_id ? 0 : 1
          if (ap !== bp) return ap - bp
          return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
        })
        setItems(usable)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'Erreur'
        if (/401|403|auth|connect/i.test(msg)) {
          setError(ACTIVITY_SIGN_IN_TO_ADD_FR)
        } else {
          setError(msg)
        }
        setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

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
          {error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 space-y-2">
              <p>{error}</p>
              <Link to="/compte" className="font-bold underline">
                Se connecter
              </Link>
            </div>
          ) : null}
          {!loading && !error && !items.length ? (
            <div className="rounded-xl border border-line bg-canvas px-3 py-4 text-sm text-muted space-y-2 text-center">
              <p>{ACTIVITY_NO_PLANNER_TO_ADD_FR}</p>
              <Link to="/planner" className="font-bold text-primary-700 underline">
                Ouvrir Planner
              </Link>
            </div>
          ) : null}
          {items.map((ws) => {
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
                        planned ? 'Planner' : 'Réservation',
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
