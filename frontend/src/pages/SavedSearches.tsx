/**
 * Compte → Recherches sauvegardées
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { DateAvecHoraire, SavedSearch } from '@waypop/shared'
import { formatDateFr } from '@waypop/shared'
import { getCurrentUser } from '../lib/supabase'
import { deleteSearch, getSavedSearches } from '../utils/storage'
import { openSearchFromDeals } from '../utils/searchPrefill'
import { useShellReady } from '../hooks/useShellReady'
import { SiteFooter } from '../components/SiteFooter'

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
        return { date, heure_min: '06:00', heure_max: '23:59' } as DateAvecHoraire
      }
      if (!item || typeof item !== 'object') return null
      const d = item as Record<string, unknown>
      const date = String(d.date || '').trim()
      if (!date) return null
      return {
        date,
        heure_min: String(d.heure_min || '06:00'),
        heure_max: String(d.heure_max || '23:59'),
      } as DateAvecHoraire
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

export default function SavedSearches() {
  const navigate = useNavigate()
  const shellReady = useShellReady()
  const [items, setItems] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const rows = await getSavedSearches(true)
    setItems(Array.isArray(rows) ? rows : [])
  }, [])

  useEffect(() => {
    if (!shellReady) return
    void getCurrentUser()
      .then(async (u) => {
        if (!u) {
          navigate('/login?redirect=/recherches', { replace: true })
          return
        }
        await refresh()
      })
      .finally(() => setLoading(false))
  }, [shellReady, navigate, refresh])

  const onDelete = async (search: SavedSearch) => {
    if (!window.confirm(`Supprimer « ${search.name} » ?`)) return
    setBusyId(search.id)
    try {
      await deleteSearch(search.id)
      setItems((prev) => prev.filter((s) => s.id !== search.id))
    } catch {
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  const onRelaunch = (search: SavedSearch) => {
    const req = search.request
    const origin = String(req.aeroport_depart || '').trim().toUpperCase()
    const dates_depart = normalizeDates(req.dates_depart)
    const dates_retour = normalizeDates(req.dates_retour)
    const adults = Math.min(6, Math.max(1, Number(req.passengers) || 1))
    openSearchFromDeals({
      origin: origin || undefined,
      adults,
      budget: req.budget_max || undefined,
      dates_depart: dates_depart.length ? dates_depart : undefined,
      dates_retour: dates_retour.length ? dates_retour : undefined,
      autoSearch: Boolean(origin && dates_depart.length && dates_retour.length),
    })
    navigate('/vols')
  }

  return (
    <div className="min-h-screen bg-[#FFF9F5] text-ink">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 sm:py-10 pb-16">
        <div className="mb-6 sm:mb-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center text-sm font-semibold text-primary-700 hover:text-primary-800 mb-3"
          >
            ← Retour
          </button>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary-600 mb-1.5">
            Compte
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            Recherches sauvegardées
          </h1>
          <p className="mt-2 text-sm text-muted leading-relaxed max-w-md">
            Relance une recherche de vols ou supprime celles dont tu n’as plus besoin.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
            Chargement…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-line bg-white p-8 sm:p-10 shadow-soft">
            <h2 className="text-lg font-extrabold text-ink mb-2">Aucune recherche</h2>
            <p className="text-sm text-muted leading-relaxed mb-5">
              Depuis les résultats de vols, utilise « Sauvegarder » pour la retrouver ici.
            </p>
            <Link
              to="/vols"
              className="inline-flex items-center justify-center rounded-xl bg-primary-500 text-white px-4 py-2.5 text-sm font-extrabold hover:bg-primary-600 min-h-[44px]"
            >
              Chercher un vol
            </Link>
          </div>
        ) : (
          <ul className="space-y-3 sm:space-y-4">
            {items.map((search) => {
              const busy = busyId === search.id
              const budget = search.request.budget_max || 100
              const pax = Math.min(
                6,
                Math.max(1, Number(search.request.passengers) || 1),
              )
              return (
                <li
                  key={search.id}
                  className="rounded-2xl border border-line bg-white p-4 sm:p-5 shadow-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-extrabold text-ink tracking-tight truncate">
                        {search.name}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-ink-soft truncate">
                        {routeLabel(search)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onDelete(search)}
                      className="shrink-0 w-10 h-10 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100 disabled:opacity-50"
                      aria-label="Supprimer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full border border-line bg-[#FFF9F5] px-2.5 py-1 text-xs font-semibold text-ink">
                      {budget}€/pers
                    </span>
                    <span className="inline-flex rounded-full border border-line bg-[#FFF9F5] px-2.5 py-1 text-xs font-semibold text-ink">
                      {pax} pers.
                    </span>
                    <span className="inline-flex rounded-full border border-line bg-[#FFF9F5] px-2.5 py-1 text-xs font-semibold text-ink">
                      {datesSummary(search)}
                    </span>
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRelaunch(search)}
                      className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-primary-500 text-white px-4 py-2.5 text-sm font-extrabold hover:bg-primary-600 disabled:opacity-50 min-h-[44px]"
                    >
                      Relancer
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <SiteFooter />
    </div>
  )
}
