import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ITINERARY_DURATIONS,
  ITINERARY_DURATION_LABELS,
  ITINERARY_OCCASIONS,
  ITINERARY_OCCASION_LABELS,
  canPublish,
  citySlugDisplayNameFr,
  cityImageUrl,
  getPublishBlockers,
  getPublishWarnings,
  type Itinerary,
  type ItineraryDurationKind,
  type ItineraryItem,
  type ItineraryItemKind,
  type ItineraryOccasion,
} from '@flightwatcher/shared'
import { getApiClient } from '../../utils/apiClient'
import { ItineraryCard } from '../../components/parcours/ItineraryCard'

type DraftItem = {
  localId: string
  kind: ItineraryItemKind
  title: string
  note: string
  duration_minutes: string
  photo: string
  place_id: string
  place_name: string
  viator_product_code: string
  day_offset: string
  moment: string
}

const CITY_OPTIONS = [
  'paris',
  'marseille',
  'lyon',
  'nice',
  'bordeaux',
  'lisbon',
  'porto',
  'barcelona',
  'rome',
  'madrid',
]

function newLocalId() {
  return `tmp_${Math.random().toString(36).slice(2, 10)}`
}

function toDraftItems(items?: ItineraryItem[] | null): DraftItem[] {
  return (items || []).map((it, i) => ({
    localId: it.id || newLocalId(),
    kind: (it.kind || 'free') as ItineraryItemKind,
    title: it.title || '',
    note: it.note || '',
    duration_minutes:
      it.duration_minutes != null ? String(it.duration_minutes) : '',
    photo: it.photo || '',
    place_id: it.place_id || '',
    place_name: it.places?.name || '',
    viator_product_code: it.viator_product_code || '',
    day_offset: String(it.day_offset ?? 0),
    moment: it.moment || '',
  }))
}

function itemsPayload(drafts: DraftItem[]) {
  return drafts.map((d, position) => ({
    kind: d.kind,
    position,
    title: d.title.trim() || null,
    note: d.note.trim() || null,
    duration_minutes: d.duration_minutes ? Number(d.duration_minutes) : null,
    photo: d.photo.trim() || null,
    place_id: d.place_id || null,
    viator_product_code: d.viator_product_code.trim() || null,
    day_offset: Number(d.day_offset || 0),
    moment: d.moment || null,
  }))
}

export function ParcoursEditorPage() {
  const { itineraryId } = useParams<{ itineraryId: string }>()
  const navigate = useNavigate()
  const [itin, setItin] = useState<Itinerary | null>(null)
  const [items, setItems] = useState<DraftItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<{ code: string; message: string }[]>(
    [],
  )
  const [warnings, setWarnings] = useState<{ code: string; message: string }[]>(
    [],
  )
  const [previewDark, setPreviewDark] = useState(false)
  const [mapsPaste, setMapsPaste] = useState('')
  const [resolving, setResolving] = useState(false)

  const load = useCallback(async () => {
    if (!itineraryId) return
    setLoading(true)
    setError(null)
    try {
      const api = getApiClient()
      const res = await api.adminGetParcours(itineraryId)
      if (!res.ok || !res.itinerary) throw new Error(res.error || 'Introuvable')
      const row = res.itinerary as unknown as Itinerary
      setItin(row)
      setItems(toDraftItems(row.itinerary_items))
      setBlockers(res.blockers || [])
      setWarnings(res.warnings || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [itineraryId])

  useEffect(() => {
    void load()
  }, [load])

  const previewItinerary = useMemo(() => {
    if (!itin) return null
    return {
      ...itin,
      itinerary_items: itemsPayload(items) as unknown as ItineraryItem[],
    }
  }, [itin, items])

  const localBlockers = useMemo(
    () => (previewItinerary ? getPublishBlockers(previewItinerary) : []),
    [previewItinerary],
  )
  const localWarnings = useMemo(
    () => (previewItinerary ? getPublishWarnings(previewItinerary) : []),
    [previewItinerary],
  )
  const allWarnings = useMemo(() => {
    const seen = new Set(localWarnings.map((w) => w.code))
    return [
      ...localWarnings,
      ...warnings.filter((w) => !seen.has(w.code)),
    ]
  }, [localWarnings, warnings])

  const patchField = <K extends keyof Itinerary>(key: K, value: Itinerary[K]) => {
    setItin((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const save = async (opts?: { andPublish?: boolean }) => {
    if (!itineraryId || !itin) return
    setSaving(true)
    setError(null)
    setInfo(null)
    try {
      const api = getApiClient()
      const res = await api.adminUpdateParcours(itineraryId, {
        title: itin.title,
        subtitle: itin.subtitle,
        intro: itin.intro,
        slug: itin.slug,
        city_slug: itin.city_slug,
        cover_image: itin.cover_image,
        duration_kind: itin.duration_kind,
        occasions: itin.occasions,
        featured_from: itin.featured_from || null,
        featured_to: itin.featured_to || null,
        budget_estimate_eur: itin.budget_estimate_eur,
        budget_basis: itin.budget_basis,
        sort_weight: itin.sort_weight ?? 0,
        is_demo: itin.is_demo ?? false,
        items: itemsPayload(items),
      })
      if (!res.ok || !res.itinerary) {
        throw new Error(res.error || 'Sauvegarde impossible')
      }
      const row = res.itinerary as unknown as Itinerary
      setItin(row)
      setItems(toDraftItems(row.itinerary_items))
      setBlockers(res.blockers || [])
      setWarnings(res.warnings || [])

      if (opts?.andPublish) {
        const pub = await api.adminPublishParcours(itineraryId)
        if (!pub.ok) {
          setBlockers(pub.blockers || [])
          setWarnings(pub.warnings || [])
          throw new Error(
            pub.blockers?.map((b) => b.message).join(' · ') ||
              pub.error ||
              'Publication bloquée',
          )
        }
        if (pub.itinerary) {
          const published = pub.itinerary as unknown as Itinerary
          setItin(published)
          setItems(toDraftItems(published.itinerary_items))
        }
        setInfo('Publié.')
      } else {
        setInfo('Enregistré.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (status: string) => {
    if (!itineraryId) return
    setSaving(true)
    setError(null)
    try {
      const api = getApiClient()
      const res = await api.adminSetParcoursStatus(itineraryId, status)
      if (!res.ok) {
        setBlockers(res.blockers || [])
        throw new Error(res.error || 'Statut impossible')
      }
      if (res.itinerary) {
        const row = res.itinerary as unknown as Itinerary
        setItin(row)
        setItems(toDraftItems(row.itinerary_items))
      }
      setInfo(`Statut → ${status}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!itineraryId) return
    if (!window.confirm('Supprimer ce parcours ?')) return
    const api = getApiClient()
    await api.adminDeleteParcours(itineraryId)
    navigate('/admin/parcours')
  }

  const moveItem = (index: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    )
  }

  const addFree = () => {
    setItems((prev) => [
      ...prev,
      {
        localId: newLocalId(),
        kind: 'free',
        title: '',
        note: '',
        duration_minutes: '',
        photo: '',
        place_id: '',
        place_name: '',
        viator_product_code: '',
        day_offset: '0',
        moment: '',
      },
    ])
  }

  const addActivity = () => {
    setItems((prev) => [
      ...prev,
      {
        localId: newLocalId(),
        kind: 'activity',
        title: '',
        note: '',
        duration_minutes: '',
        photo: '',
        place_id: '',
        place_name: '',
        viator_product_code: '',
        day_offset: '0',
        moment: '',
      },
    ])
  }

  const resolveMaps = async () => {
    if (!mapsPaste.trim() || !itin) return
    setResolving(true)
    setError(null)
    try {
      const api = getApiClient()
      const res = await api.importRestaurantLinks({
        text: mapsPaste,
        city_slug: itin.city_slug || undefined,
      })
      const ok = (res.results || []).filter((r) => r.place_id)
      if (!ok.length) {
        throw new Error('Aucun lieu reconnu — colle un lien Maps valide.')
      }
      setItems((prev) => [
        ...prev,
        ...ok.map((r) => {
          const place = (r.place || {}) as Record<string, unknown>
          return {
            localId: newLocalId(),
            kind: 'place' as const,
            title: String(place.name || 'Lieu'),
            note: '',
            duration_minutes: '45',
            photo: '',
            place_id: String(r.place_id),
            place_name: String(place.name || ''),
            viator_product_code: '',
            day_offset: '0',
            moment: '',
          }
        }),
      ])
      setMapsPaste('')
      setInfo(`${ok.length} lieu(x) ajouté(s).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Résolution Maps impossible')
    } finally {
      setResolving(false)
    }
  }

  const useCityCover = () => {
    if (!itin?.city_slug) return
    patchField('cover_image', cityImageUrl(itin.city_slug))
  }

  if (loading) {
    return <p className="text-gray-400 text-sm">Chargement…</p>
  }
  if (!itin) {
    return (
      <div className="space-y-2">
        <p className="text-red-400 text-sm">{error || 'Parcours introuvable'}</p>
        <Link to="/admin/parcours" className="text-blue-300 text-sm">
          ← Retour
        </Link>
      </div>
    )
  }

  const publishReady = canPublish(previewItinerary)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <Link to="/admin/parcours" className="text-xs text-gray-500 hover:text-gray-300">
            ← Parcours
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">{itin.title}</h1>
          <p className="text-xs text-gray-500">
            {itin.status} · /parcours/{itin.slug || '…'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg border border-gray-600 px-3 py-2 text-sm hover:bg-gray-800"
          >
            Enregistrer
          </button>
          <button
            type="button"
            disabled={saving || !publishReady}
            onClick={() => void save({ andPublish: true })}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-3 py-2 text-sm font-semibold"
          >
            Publier
          </button>
          {itin.status === 'published' ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void setStatus('retired')}
              className="rounded-lg border border-gray-600 px-3 py-2 text-sm"
            >
              Retirer
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void remove()}
            className="rounded-lg border border-red-700/60 text-red-300 px-3 py-2 text-sm"
          >
            Supprimer
          </button>
        </div>
      </div>

      {error ? <p className="text-red-400 text-sm">{error}</p> : null}
      {info ? <p className="text-emerald-400 text-sm">{info}</p> : null}

      {(localBlockers.length > 0 || allWarnings.length > 0) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm space-y-1">
          {localBlockers.map((b) => (
            <p key={b.code} className="text-amber-100">
              ⛔ {b.message}
            </p>
          ))}
          {allWarnings.map((w) => (
            <p key={w.code} className="text-amber-200/80">
              ⚠ {w.message}
            </p>
          ))}
          {blockers
            .filter((b) => !localBlockers.some((l) => l.code === b.code))
            .map((b) => (
              <p key={`srv-${b.code}`} className="text-amber-100">
                ⛔ {b.message}
              </p>
            ))}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        {/* Form */}
        <div className="space-y-5 rounded-xl border border-gray-700 bg-[#232736] p-4">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs text-gray-400 space-y-1">
              Ville
              <select
                value={itin.city_slug || ''}
                onChange={(e) => {
                  const slug = e.target.value
                  patchField('city_slug', slug)
                  if (!itin.cover_image) {
                    patchField('cover_image', cityImageUrl(slug))
                  }
                }}
                className="w-full bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">—</option>
                {CITY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {citySlugDisplayNameFr(c)} ({c})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-400 space-y-1">
              Slug URL
              <input
                value={itin.slug || ''}
                onChange={(e) => patchField('slug', e.target.value)}
                className="w-full bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-gray-400 space-y-1 md:col-span-2">
              Titre
              <input
                value={itin.title || ''}
                onChange={(e) => patchField('title', e.target.value)}
                className="w-full bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-gray-400 space-y-1 md:col-span-2">
              Sous-titre
              <input
                value={itin.subtitle || ''}
                onChange={(e) => patchField('subtitle', e.target.value)}
                className="w-full bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-gray-400 space-y-1 md:col-span-2">
              Introduction
              <textarea
                value={itin.intro || ''}
                onChange={(e) => patchField('intro', e.target.value)}
                rows={4}
                className="w-full bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs text-gray-400 space-y-1">
              Durée
              <select
                value={itin.duration_kind || ''}
                onChange={(e) =>
                  patchField(
                    'duration_kind',
                    (e.target.value || null) as ItineraryDurationKind | null,
                  )
                }
                className="w-full bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">—</option>
                {ITINERARY_DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {ITINERARY_DURATION_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-400 space-y-1">
              Budget (€)
              <div className="flex gap-2">
                <input
                  type="number"
                  value={itin.budget_estimate_eur ?? ''}
                  onChange={(e) =>
                    patchField(
                      'budget_estimate_eur',
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className="w-full bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                />
                <select
                  value={itin.budget_basis || ''}
                  onChange={(e) =>
                    patchField(
                      'budget_basis',
                      (e.target.value || null) as Itinerary['budget_basis'],
                    )
                  }
                  className="bg-[#1a1d29] border border-gray-700 rounded-lg px-2 py-2 text-sm text-white"
                >
                  <option value="">Base</option>
                  <option value="for_two">pour deux</option>
                  <option value="per_person">par personne</option>
                </select>
              </div>
            </label>
            <label className="text-xs text-gray-400 space-y-1">
              Featured from
              <input
                type="date"
                value={itin.featured_from || ''}
                onChange={(e) => patchField('featured_from', e.target.value || null)}
                className="w-full bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-gray-400 space-y-1">
              Featured to
              <input
                type="date"
                value={itin.featured_to || ''}
                onChange={(e) => patchField('featured_to', e.target.value || null)}
                className="w-full bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-gray-400 space-y-1">
              Poids (ordre)
              <input
                type="number"
                value={itin.sort_weight ?? 0}
                onChange={(e) => patchField('sort_weight', Number(e.target.value))}
                className="w-full bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-300 mt-5">
              <input
                type="checkbox"
                checked={!!itin.is_demo}
                onChange={(e) => patchField('is_demo', e.target.checked)}
              />
              Marquer démo (`is_demo`)
            </label>
          </section>

          <section>
            <p className="text-xs text-gray-400 mb-2">Occasions</p>
            <div className="flex flex-wrap gap-2">
              {ITINERARY_OCCASIONS.map((o) => {
                const on = (itin.occasions || []).includes(o)
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => {
                      const cur = new Set(itin.occasions || [])
                      if (on) cur.delete(o)
                      else cur.add(o)
                      patchField('occasions', [...cur] as ItineraryOccasion[])
                    }}
                    className={`text-xs px-3 py-1.5 rounded-full border ${
                      on
                        ? 'bg-orange-500/20 border-orange-400 text-orange-100'
                        : 'border-gray-600 text-gray-400'
                    }`}
                  >
                    {ITINERARY_OCCASION_LABELS[o]}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <p className="text-sm font-semibold text-gray-200">
                Couverture
              </p>
              <button
                type="button"
                onClick={useCityCover}
                className="text-xs text-blue-300 hover:underline"
              >
                Utiliser photo ville
              </button>
            </div>
            <input
              value={itin.cover_image || ''}
              onChange={(e) => patchField('cover_image', e.target.value)}
              placeholder="URL photo (Viator / Wikimedia / Panoramax / upload)"
              className="w-full bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <p className="text-sm font-semibold text-gray-200">
                Étapes ({items.length})
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addFree}
                  className="text-xs rounded-lg border border-gray-600 px-2 py-1"
                >
                  + Libre
                </button>
                <button
                  type="button"
                  onClick={addActivity}
                  className="text-xs rounded-lg border border-gray-600 px-2 py-1"
                >
                  + Activité Viator
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-gray-600 p-3 space-y-2">
              <p className="text-xs text-gray-400">
                Coller un lien Google Maps → lieu v8
              </p>
              <div className="flex gap-2">
                <input
                  value={mapsPaste}
                  onChange={(e) => setMapsPaste(e.target.value)}
                  placeholder="https://maps.app.goo.gl/…"
                  className="flex-1 bg-[#1a1d29] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  disabled={resolving || !mapsPaste.trim()}
                  onClick={() => void resolveMaps()}
                  className="rounded-lg bg-blue-600 disabled:opacity-40 px-3 py-2 text-sm"
                >
                  {resolving ? '…' : 'Ajouter'}
                </button>
              </div>
            </div>

            {items.map((it, index) => (
              <div
                key={it.localId}
                className="rounded-lg border border-gray-700 bg-[#1a1d29] p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 w-6">
                    {index + 1}
                  </span>
                  <select
                    value={it.kind}
                    onChange={(e) =>
                      updateItem(index, {
                        kind: e.target.value as ItineraryItemKind,
                      })
                    }
                    className="bg-[#232736] border border-gray-700 rounded px-2 py-1 text-xs"
                  >
                    <option value="place">Lieu</option>
                    <option value="activity">Activité</option>
                    <option value="free">Libre</option>
                  </select>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => moveItem(index, -1)}
                    className="text-xs px-2 py-1 border border-gray-700 rounded"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(index, 1)}
                    className="text-xs px-2 py-1 border border-gray-700 rounded"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="text-xs px-2 py-1 border border-red-800 text-red-300 rounded"
                  >
                    ✕
                  </button>
                </div>
                {it.kind === 'free' ? (
                  <p className="text-xs text-amber-300/90 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
                    Étape sans lieu : elle n’apparaîtra pas dans l’itinéraire.
                  </p>
                ) : null}
                <input
                  value={it.title}
                  onChange={(e) => updateItem(index, { title: e.target.value })}
                  placeholder="Titre"
                  className="w-full bg-[#232736] border border-gray-700 rounded-lg px-3 py-2 text-sm"
                />
                <textarea
                  value={it.note}
                  onChange={(e) => updateItem(index, { note: e.target.value })}
                  placeholder="Note admin"
                  rows={2}
                  className="w-full bg-[#232736] border border-gray-700 rounded-lg px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <input
                    value={it.duration_minutes}
                    onChange={(e) =>
                      updateItem(index, { duration_minutes: e.target.value })
                    }
                    placeholder="min"
                    className="bg-[#232736] border border-gray-700 rounded-lg px-2 py-1.5 text-xs"
                  />
                  <input
                    value={it.day_offset}
                    onChange={(e) =>
                      updateItem(index, { day_offset: e.target.value })
                    }
                    placeholder="jour (0…)"
                    className="bg-[#232736] border border-gray-700 rounded-lg px-2 py-1.5 text-xs"
                  />
                  <select
                    value={it.moment}
                    onChange={(e) =>
                      updateItem(index, { moment: e.target.value })
                    }
                    className="bg-[#232736] border border-gray-700 rounded-lg px-2 py-1.5 text-xs"
                  >
                    <option value="">moment</option>
                    <option value="morning">matin</option>
                    <option value="afternoon">après-midi</option>
                    <option value="evening">soir</option>
                  </select>
                  <input
                    value={it.photo}
                    onChange={(e) => updateItem(index, { photo: e.target.value })}
                    placeholder="photo URL"
                    className="bg-[#232736] border border-gray-700 rounded-lg px-2 py-1.5 text-xs"
                  />
                </div>
                {it.kind === 'place' ? (
                  <p className="text-[11px] text-gray-500">
                    place_id: {it.place_id || '— manquant'}
                    {it.place_name ? ` · ${it.place_name}` : ''}
                  </p>
                ) : null}
                {it.kind === 'activity' ? (
                  <input
                    value={it.viator_product_code}
                    onChange={(e) =>
                      updateItem(index, {
                        viator_product_code: e.target.value,
                      })
                    }
                    placeholder="Code produit Viator"
                    className="w-full bg-[#232736] border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  />
                ) : null}
              </div>
            ))}
          </section>
        </div>

        {/* Phone preview */}
        <aside className="xl:sticky xl:top-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-200">Aperçu</p>
            <button
              type="button"
              onClick={() => setPreviewDark((v) => !v)}
              className="text-xs text-gray-400 hover:text-white"
            >
              {previewDark ? 'Clair' : 'Sombre'}
            </button>
          </div>
          <div
            className="mx-auto w-[320px] rounded-[36px] border-[8px] border-gray-800 shadow-2xl overflow-hidden"
            style={{
              background: previewDark ? '#14110F' : '#FFF9F5',
              color: previewDark ? '#F5EFEA' : '#1D1B19',
            }}
          >
            <div className="h-7 bg-black/20" />
            <div className="p-3 space-y-3 max-h-[640px] overflow-y-auto">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.08em]"
                style={{ color: previewDark ? '#FF7A4A' : '#FF6B35' }}
              >
                Parcours
              </p>
              <ItineraryCard
                itinerary={itin}
                variant="landscape"
                badge={
                  (itin.occasions || []).includes('ferie') ? 'Férié' : null
                }
              />
              <ItineraryCard itinerary={itin} variant="portrait" />
              <div
                className="rounded-2xl p-3 space-y-2"
                style={{
                  background: previewDark ? '#1F1A17' : '#fff',
                }}
              >
                <h2
                  className="m-0 text-[22px] italic font-normal leading-tight"
                  style={{
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {itin.title}
                </h2>
                <p className="text-[13px] opacity-70 m-0">
                  {citySlugDisplayNameFr(itin.city_slug)}
                  {itin.duration_kind
                    ? ` · ${ITINERARY_DURATION_LABELS[itin.duration_kind as ItineraryDurationKind] || itin.duration_kind}`
                    : ''}
                </p>
                {itin.intro ? (
                  <p className="text-[14px] leading-relaxed m-0 opacity-90">
                    {itin.intro}
                  </p>
                ) : (
                  <p className="text-[13px] opacity-40 m-0">Introduction…</p>
                )}
                <ol className="m-0 pl-4 space-y-2 text-[13px]">
                  {items.map((it, i) => (
                    <li key={it.localId}>
                      <strong>{it.title || `Étape ${i + 1}`}</strong>
                      {it.note ? (
                        <span className="opacity-70"> — {it.note}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
