import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ITINERARY_DURATION_LABELS,
  ITINERARY_OCCASION_LABELS,
  cityDisplayNameFr,
  cityImageUrl,
  type Itinerary,
  type ItineraryDurationKind,
  type ItineraryOccasion,
} from '@flightwatcher/shared'
import { getApiClient } from '../../utils/apiClient'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  retired: 'Retiré',
}

export function ParcoursAdminPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [city, setCity] = useState('')
  const [status, setStatus] = useState('')
  const [occasion, setOccasion] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const api = getApiClient()
      const res = await api.adminListParcours({
        city: city || undefined,
        status: status || undefined,
        occasion: occasion || undefined,
      })
      if (!res.ok) throw new Error(res.error || 'Chargement impossible')
      setRows((res.itineraries || []) as unknown as Itinerary[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [city, status, occasion])

  useEffect(() => {
    void load()
  }, [load])

  const onCreate = async () => {
    setCreating(true)
    try {
      const api = getApiClient()
      const res = await api.adminCreateParcours({
        title: 'Nouveau parcours',
        city_slug: 'paris',
        cover_image: cityImageUrl('paris'),
      })
      if (!res.ok || !res.itinerary?.id) {
        throw new Error(res.error || 'Création impossible')
      }
      navigate(`/admin/parcours/${res.itinerary.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Parcours</h1>
          <p className="text-sm text-gray-400 mt-1">
            Catalogue éditorial — publier un parcours en &lt; 15 min
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onCreate()}
          disabled={creating}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold"
        >
          {creating ? 'Création…' : 'Nouveau parcours'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value.trim().toLowerCase())}
          placeholder="Ville (slug)"
          className="bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm w-40"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Tous statuts</option>
          <option value="draft">Brouillon</option>
          <option value="published">Publié</option>
          <option value="retired">Retiré</option>
        </select>
        <select
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
          className="bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Toutes occasions</option>
          {(Object.keys(ITINERARY_OCCASION_LABELS) as ItineraryOccasion[]).map(
            (k) => (
              <option key={k} value={k}>
                {ITINERARY_OCCASION_LABELS[k]}
              </option>
            ),
          )}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
        >
          Filtrer
        </button>
      </div>

      {error ? <p className="text-red-400 text-sm">{error}</p> : null}
      {loading ? <p className="text-gray-400 text-sm">Chargement…</p> : null}

      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="w-full text-sm text-left">
          <thead className="text-gray-500 bg-[#232736]">
            <tr>
              <th className="px-3 py-2"> </th>
              <th className="px-3 py-2">Titre</th>
              <th className="px-3 py-2">Ville</th>
              <th className="px-3 py-2">Durée</th>
              <th className="px-3 py-2">Occasions</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Mise en avant</th>
              <th className="px-3 py-2">Modifié</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cover =
                r.cover_image ||
                (r.city_slug ? cityImageUrl(r.city_slug) : null)
              const dur = r.duration_kind
                ? ITINERARY_DURATION_LABELS[
                    r.duration_kind as ItineraryDurationKind
                  ] || r.duration_kind
                : '—'
              return (
                <tr
                  key={r.id}
                  className="border-t border-gray-800 text-gray-200 hover:bg-[#232736]/60"
                >
                  <td className="px-3 py-2">
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-gray-800" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/admin/parcours/${r.id}`}
                      className="font-medium text-blue-300 hover:underline"
                    >
                      {r.title}
                    </Link>
                    {r.is_demo ? (
                      <span className="ml-2 text-[10px] uppercase text-amber-400">
                        demo
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {r.city_slug
                      ? cityDisplayNameFr(null, r.city_slug)
                      : '—'}
                  </td>
                  <td className="px-3 py-2">{dur}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-gray-400">
                      {(r.occasions || [])
                        .map(
                          (o) =>
                            ITINERARY_OCCASION_LABELS[o as ItineraryOccasion] ||
                            o,
                        )
                        .join(', ') || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        r.status === 'published'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : r.status === 'retired'
                            ? 'bg-gray-600/40 text-gray-300'
                            : 'bg-amber-500/20 text-amber-200'
                      }`}
                    >
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">
                    {r.featured_from && r.featured_to
                      ? `${r.featured_from} → ${r.featured_to}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {(r as { updated_at?: string }).updated_at
                      ? new Date(
                          (r as { updated_at?: string }).updated_at!,
                        ).toLocaleString('fr-FR')
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 ? (
          <p className="p-4 text-xs text-gray-500">
            Aucun parcours. Applique la migration + seed, ou crée-en un.
          </p>
        ) : null}
      </div>
    </div>
  )
}
