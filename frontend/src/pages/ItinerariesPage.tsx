import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getApiClient } from '../utils/apiClient'

export default function ItinerariesPage() {
  const { itineraryId } = useParams<{ itineraryId?: string }>()
  const [search] = useSearchParams()
  const draftToken = search.get('draft') || undefined
  const plannedTripId = search.get('planned') || undefined
  const [enabled, setEnabled] = useState(false)
  const [title, setTitle] = useState('Mon parcours')
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getApiClient()
      .getConfig()
      .then((c) => setEnabled(c.itineraries_enabled === true))
      .catch(() => setEnabled(false))
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    const res = await getApiClient().getItinerary(id)
    setDetail((res.itinerary || null) as Record<string, unknown> | null)
  }, [])

  useEffect(() => {
    if (itineraryId) void loadDetail(itineraryId).catch(() => setDetail(null))
  }, [itineraryId, loadDetail])

  if (!enabled) {
    return (
      <div className="app-col py-10">
        <p className="text-slate-600">Les parcours ne sont pas activés (ITINERARIES_ENABLED).</p>
      </div>
    )
  }

  const create = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await getApiClient().createItinerary({
        title,
        draft_token: draftToken,
        planned_trip_id: plannedTripId,
      })
      if (!res.ok) throw new Error(res.error || 'Création impossible')
      const id = (res.itinerary as { id?: string } | undefined)?.id
      setMsg(id ? `Parcours créé : ${id}` : 'Parcours créé')
      if (id) await loadDetail(id)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!itineraryId) return
    setBusy(true)
    try {
      const res = await getApiClient().applyItinerary(itineraryId, {
        draft_token: draftToken,
        planned_trip_id: plannedTripId,
      })
      setMsg(`Appliqué · ${res.created ?? 0} items`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const items = Array.isArray(detail?.itinerary_items)
    ? (detail!.itinerary_items as Record<string, unknown>[])
    : []

  return (
    <div className="app-col py-8 space-y-6 max-w-2xl">
      <header>
        <p className="app-kicker">Parcours</p>
        <h1 className="app-title">Modèles réutilisables</h1>
        <p className="app-subtitle">Créer depuis un voyage, réappliquer sur un autre.</p>
      </header>

      {!itineraryId ? (
        <div className="space-y-3 rounded-2xl border p-4">
          <label className="block text-sm font-semibold">
            Titre
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || (!draftToken && !plannedTripId)}
            onClick={() => void create()}
            className="rounded-xl bg-primary-600 text-white font-bold px-4 py-2 disabled:opacity-50"
          >
            Créer depuis ce voyage
          </button>
          {!draftToken && !plannedTripId ? (
            <p className="text-xs text-slate-500">
              Passe <code>?draft=</code> ou <code>?planned=</code> dans l’URL.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="font-bold text-lg">{String(detail?.title || itineraryId)}</h2>
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={String(it.id)} className="rounded-xl border px-3 py-2 text-sm">
                {String((it.places as { name?: string } | undefined)?.name || it.place_id || 'Item')}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={() => void apply()}
            className="rounded-xl bg-primary-600 text-white font-bold px-4 py-2"
          >
            Réappliquer au voyage
          </button>
          <Link to="/parcours" className="text-sm text-primary-700 font-semibold">
            ← Retour
          </Link>
        </div>
      )}

      {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
    </div>
  )
}
