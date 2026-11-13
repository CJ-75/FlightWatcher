import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ITINERARY_DURATIONS,
  ITINERARY_DURATION_LABELS,
  ITINERARY_OCCASIONS,
  ITINERARY_OCCASION_LABELS,
  canPublish,
  citySlugDisplayNameFr,
  cityImageUrl,
  cityUnsplashUrl,
  getPublishBlockers,
  getPublishWarnings,
  normalizeItineraryBudgetEur,
  type Itinerary,
  type ItineraryDurationKind,
  type ItineraryItem,
  type ItineraryItemKind,
  type ItineraryOccasion,
} from '@flightwatcher/shared'
import { getApiClient } from '../../utils/apiClient'
import { ParcoursCoverImg } from '../../components/parcours/ParcoursCoverImg'

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

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  retired: 'Retiré',
}

function newLocalId() {
  return `tmp_${Math.random().toString(36).slice(2, 10)}`
}

function toDraftItems(items?: ItineraryItem[] | null): DraftItem[] {
  return (items || []).map((it) => ({
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

function statusBadgeClass(status?: string | null) {
  if (status === 'published') return 'fw-badge ok'
  if (status === 'retired') return 'fw-badge bad'
  return 'fw-badge warn'
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
      // light=true (défaut API) : pas de place_warnings
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

  const deferredItin = useDeferredValue(itin)
  const deferredItems = useDeferredValue(items)

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
        budget_estimate_eur: normalizeItineraryBudgetEur(itin.budget_estimate_eur),
        budget_basis: itin.budget_basis,
        sort_weight: itin.sort_weight ?? 0,
        is_demo: itin.is_demo ?? false,
        items: itemsPayload(items),
      })
      if (!res.ok || !res.itinerary) {
        throw new Error(res.error || 'Sauvegarde impossible')
      }
      const row = res.itinerary as unknown as Itinerary
      // Garde le draft local (évite remount étapes) — merge champs serveur
      setItin((prev) =>
        prev
          ? {
              ...prev,
              ...row,
              itinerary_items: prev.itinerary_items,
            }
          : row,
      )
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
          setItin((prev) =>
            prev
              ? { ...prev, ...published, itinerary_items: prev.itinerary_items }
              : published,
          )
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
      setInfo(`Statut → ${STATUS_LABEL[status] || status}`)
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
      // Parse léger (pas d'import restaurants / Places lourd)
      const res = await api.adminParseMapsUrl(mapsPaste.trim(), { light: true })
      if (!res.ok || !res.parsed) {
        throw new Error(res.error || 'Lien Maps non reconnu.')
      }
      const p = res.parsed
      const title = String(p.name || 'Lieu Maps').trim()
      const note = String(p.description || p.note || '').trim()
      setItems((prev) => [
        ...prev,
        {
          localId: newLocalId(),
          kind: 'free' as const,
          title,
          note,
          duration_minutes: '45',
          photo: '',
          place_id: '',
          place_name: title,
          viator_product_code: '',
          day_offset: '0',
          moment: '',
        },
      ])
      setMapsPaste('')
      setInfo(`Étape ajoutée : ${title}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Résolution Maps impossible')
    } finally {
      setResolving(false)
    }
  }

  const useCityCover = () => {
    if (!itin?.city_slug) return
    patchField(
      'cover_image',
      cityUnsplashUrl(itin.city_slug) || cityImageUrl(itin.city_slug),
    )
  }

  if (loading) {
    return <p className="fw-muted" style={{ fontSize: '0.9rem' }}>Chargement…</p>
  }
  if (!itin) {
    return (
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div className="fw-alert bad">{error || 'Parcours introuvable'}</div>
        <Link to="/admin/parcours" className="fw-btn" style={{ width: 'fit-content' }}>
          ← Retour
        </Link>
      </div>
    )
  }

  const publishReady = canPublish(previewItinerary)
  const serverOnlyBlockers = blockers.filter(
    (b) => !localBlockers.some((l) => l.code === b.code),
  )

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="fw-page-head">
        <div>
          <Link
            to="/admin/parcours"
            className="fw-muted"
            style={{ fontSize: '0.78rem', textDecoration: 'none', fontWeight: 600 }}
          >
            ← Parcours
          </Link>
          <h1 className="fw-display" style={{ marginTop: 6 }}>
            {itin.title || 'Sans titre'}
          </h1>
          <p style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
            <span className={statusBadgeClass(itin.status)}>
              {STATUS_LABEL[itin.status || ''] || itin.status || '—'}
            </span>
            <span className="fw-muted" style={{ fontSize: '0.85rem' }}>
              /parcours/{itin.slug || '…'}
            </span>
          </p>
        </div>
        <div className="fw-cta-row" style={{ marginTop: 0 }}>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="fw-btn"
          >
            Enregistrer
          </button>
          <button
            type="button"
            disabled={saving || !publishReady}
            onClick={() => void save({ andPublish: true })}
            className="fw-btn fw-btn-primary"
          >
            Publier
          </button>
          {itin.status === 'published' ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void setStatus('retired')}
              className="fw-btn"
            >
              Retirer
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void remove()}
            className="fw-btn fw-btn-danger"
          >
            Supprimer
          </button>
        </div>
      </div>

      {error ? <div className="fw-alert bad">{error}</div> : null}
      {info ? <div className="fw-alert ok">{info}</div> : null}

      {(localBlockers.length > 0 ||
        allWarnings.length > 0 ||
        serverOnlyBlockers.length > 0) && (
        <div className="fw-alert warn">
          {localBlockers.map((b) => (
            <p key={b.code}>⛔ {b.message}</p>
          ))}
          {serverOnlyBlockers.map((b) => (
            <p key={`srv-${b.code}`}>⛔ {b.message}</p>
          ))}
          {allWarnings.map((w) => (
            <p key={w.code}>⚠ {w.message}</p>
          ))}
        </div>
      )}

      <div className="fw-editor-layout">
        <div className="fw-card" style={{ display: 'grid', gap: 0 }}>
          <section className="fw-editor-block">
            <h2 className="fw-section-title">Identité</h2>
            <div className="fw-field-row cols-2">
              <label className="fw-label">
                Ville
                <select
                  className="fw-select"
                  value={itin.city_slug || ''}
                  onChange={(e) => {
                    const slug = e.target.value
                    patchField('city_slug', slug)
                    if (!itin.cover_image) {
                      patchField(
                        'cover_image',
                        cityUnsplashUrl(slug) || cityImageUrl(slug),
                      )
                    }
                  }}
                >
                  <option value="">—</option>
                  {CITY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {citySlugDisplayNameFr(c)} ({c})
                    </option>
                  ))}
                </select>
              </label>
              <label className="fw-label">
                Slug URL
                <input
                  className="fw-input"
                  value={itin.slug || ''}
                  onChange={(e) => patchField('slug', e.target.value)}
                />
              </label>
              <label className="fw-label" style={{ gridColumn: '1 / -1' }}>
                Titre
                <input
                  className="fw-input"
                  value={itin.title || ''}
                  onChange={(e) => patchField('title', e.target.value)}
                />
              </label>
              <label className="fw-label" style={{ gridColumn: '1 / -1' }}>
                Sous-titre
                <input
                  className="fw-input"
                  value={itin.subtitle || ''}
                  onChange={(e) => patchField('subtitle', e.target.value)}
                />
              </label>
              <label className="fw-label" style={{ gridColumn: '1 / -1' }}>
                Introduction
                <textarea
                  className="fw-input"
                  value={itin.intro || ''}
                  onChange={(e) => patchField('intro', e.target.value)}
                  rows={4}
                />
              </label>
            </div>
          </section>

          <section className="fw-editor-block">
            <h2 className="fw-section-title">Paramètres</h2>
            <div className="fw-field-row cols-2">
              <label className="fw-label">
                Durée
                <select
                  className="fw-select"
                  value={itin.duration_kind || ''}
                  onChange={(e) =>
                    patchField(
                      'duration_kind',
                      (e.target.value || null) as ItineraryDurationKind | null,
                    )
                  }
                >
                  <option value="">—</option>
                  {ITINERARY_DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {ITINERARY_DURATION_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fw-label">
                Budget (€) — vide = 0 = Gratuit
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <input
                    className="fw-input"
                    type="number"
                    min={0}
                    step={1}
                    value={normalizeItineraryBudgetEur(itin.budget_estimate_eur)}
                    onChange={(e) => {
                      const raw = e.target.value
                      // Vide → 0 (obligatoire front) ; "0" reste 0
                      patchField(
                        'budget_estimate_eur',
                        raw === '' ? 0 : normalizeItineraryBudgetEur(raw),
                      )
                    }}
                    style={{ flex: 1, minWidth: 100 }}
                  />
                  <button
                    type="button"
                    className={`fw-chip${normalizeItineraryBudgetEur(itin.budget_estimate_eur) === 0 ? ' on' : ''}`}
                    onClick={() => patchField('budget_estimate_eur', 0)}
                  >
                    Gratuit
                  </button>
                  <select
                    className="fw-select"
                    value={itin.budget_basis || ''}
                    onChange={(e) =>
                      patchField(
                        'budget_basis',
                        (e.target.value || null) as Itinerary['budget_basis'],
                      )
                    }
                    style={{ minWidth: 130 }}
                  >
                    <option value="">Base</option>
                    <option value="for_two">pour deux</option>
                    <option value="per_person">par personne</option>
                  </select>
                </div>
              </label>
              <label className="fw-label">
                Featured from
                <input
                  className="fw-input"
                  type="date"
                  value={itin.featured_from || ''}
                  onChange={(e) =>
                    patchField('featured_from', e.target.value || null)
                  }
                />
              </label>
              <label className="fw-label">
                Featured to
                <input
                  className="fw-input"
                  type="date"
                  value={itin.featured_to || ''}
                  onChange={(e) =>
                    patchField('featured_to', e.target.value || null)
                  }
                />
              </label>
              <label className="fw-label">
                Poids (ordre)
                <input
                  className="fw-input"
                  type="number"
                  value={itin.sort_weight ?? 0}
                  onChange={(e) =>
                    patchField('sort_weight', Number(e.target.value))
                  }
                />
              </label>
              <label
                className="fw-label"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '0.55rem',
                  marginTop: '1.55rem',
                  fontWeight: 550,
                }}
              >
                <input
                  type="checkbox"
                  checked={!!itin.is_demo}
                  onChange={(e) => patchField('is_demo', e.target.checked)}
                />
                Marquer démo
              </label>
            </div>
          </section>

          <section className="fw-editor-block">
            <h2 className="fw-section-title">Occasions</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
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
                    className={`fw-chip${on ? ' on' : ''}`}
                  >
                    {ITINERARY_OCCASION_LABELS[o]}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="fw-editor-block">
            <div className="fw-section-head">
              <h2 className="fw-section-title">Couverture</h2>
              <button
                type="button"
                onClick={useCityCover}
                className="fw-btn fw-btn-ghost"
              >
                Utiliser photo ville
              </button>
            </div>
            <input
              className="fw-input"
              value={itin.cover_image || ''}
              onChange={(e) => patchField('cover_image', e.target.value)}
              placeholder="URL photo (Unsplash recommandé — Wikimedia via proxy)"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <div
              style={{
                marginTop: 10,
                height: 140,
                borderRadius: 12,
                overflow: 'hidden',
                background: '#e2e8f0',
              }}
            >
              <ParcoursCoverImg
                coverImage={itin.cover_image}
                citySlug={itin.city_slug}
                slug={itin.slug}
                width={960}
                style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
              />
            </div>
          </section>

          <section className="fw-editor-block">
            <div className="fw-section-head">
              <h2 className="fw-section-title">Étapes ({items.length})</h2>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button type="button" onClick={addFree} className="fw-btn">
                  + Libre
                </button>
                <button type="button" onClick={addActivity} className="fw-btn">
                  + Activité Viator
                </button>
              </div>
            </div>

            <div className="fw-maps-box" style={{ marginBottom: '0.85rem' }}>
              <p className="fw-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                Coller un lien Google Maps → lieu
              </p>
              <div style={{ display: 'flex', gap: '0.45rem' }}>
                <input
                  className="fw-input"
                  value={mapsPaste}
                  onChange={(e) => setMapsPaste(e.target.value)}
                  placeholder="https://maps.app.goo.gl/…"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  disabled={resolving || !mapsPaste.trim()}
                  onClick={() => void resolveMaps()}
                  className="fw-btn fw-btn-primary"
                >
                  {resolving ? '…' : 'Ajouter'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {items.map((it, index) => (
                <div key={it.localId} className="fw-step">
                  <div className="fw-step-toolbar">
                    <span className="fw-step-index">{index + 1}</span>
                    <select
                      className="fw-select"
                      value={it.kind}
                      onChange={(e) =>
                        updateItem(index, {
                          kind: e.target.value as ItineraryItemKind,
                        })
                      }
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                    >
                      <option value="place">Lieu</option>
                      <option value="activity">Activité</option>
                      <option value="free">Libre</option>
                    </select>
                    <div style={{ flex: 1 }} />
                    <button
                      type="button"
                      onClick={() => moveItem(index, -1)}
                      className="fw-btn"
                      style={{ padding: '0.3rem 0.55rem' }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(index, 1)}
                      className="fw-btn"
                      style={{ padding: '0.3rem 0.55rem' }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setItems((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="fw-btn fw-btn-danger"
                      style={{ padding: '0.3rem 0.55rem' }}
                    >
                      ✕
                    </button>
                  </div>

                  {it.kind === 'free' ? (
                    <div className="fw-alert warn" style={{ padding: '0.55rem 0.75rem' }}>
                      Étape sans lieu : elle n’apparaîtra pas dans l’itinéraire.
                    </div>
                  ) : null}

                  <input
                    className="fw-input"
                    value={it.title}
                    onChange={(e) => updateItem(index, { title: e.target.value })}
                    placeholder="Titre"
                  />
                  <textarea
                    className="fw-input"
                    value={it.note}
                    onChange={(e) => updateItem(index, { note: e.target.value })}
                    placeholder="Note"
                    rows={2}
                    style={{ minHeight: '3.5rem' }}
                  />

                  <div className="fw-field-row cols-4">
                    <input
                      className="fw-input"
                      value={it.duration_minutes}
                      onChange={(e) =>
                        updateItem(index, { duration_minutes: e.target.value })
                      }
                      placeholder="min"
                    />
                    <input
                      className="fw-input"
                      value={it.day_offset}
                      onChange={(e) =>
                        updateItem(index, { day_offset: e.target.value })
                      }
                      placeholder="jour (0…)"
                    />
                    <select
                      className="fw-select"
                      value={it.moment}
                      onChange={(e) =>
                        updateItem(index, { moment: e.target.value })
                      }
                    >
                      <option value="">moment</option>
                      <option value="morning">matin</option>
                      <option value="afternoon">après-midi</option>
                      <option value="evening">soir</option>
                    </select>
                    <input
                      className="fw-input"
                      value={it.photo}
                      onChange={(e) =>
                        updateItem(index, { photo: e.target.value })
                      }
                      placeholder="photo URL"
                    />
                  </div>

                  {it.kind === 'place' ? (
                    <p className="fw-muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                      place_id: {it.place_id || '— manquant'}
                      {it.place_name ? ` · ${it.place_name}` : ''}
                    </p>
                  ) : null}

                  {it.kind === 'activity' ? (
                    <input
                      className="fw-input"
                      value={it.viator_product_code}
                      onChange={(e) =>
                        updateItem(index, {
                          viator_product_code: e.target.value,
                        })
                      }
                      placeholder="Code produit Viator"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="fw-editor-aside">
          <div className="fw-section-head" style={{ marginBottom: 0 }}>
            <h2 className="fw-section-title">Aperçu</h2>
            <button
              type="button"
              onClick={() => setPreviewDark((v) => !v)}
              className="fw-btn fw-btn-ghost"
            >
              {previewDark ? 'Clair' : 'Sombre'}
            </button>
          </div>
          <div className={`fw-preview-shell${previewDark ? ' dark' : ''}`}>
            <div style={{ height: 28, background: 'rgba(0,0,0,0.12)' }} />
            <div
              style={{
                padding: 12,
                display: 'grid',
                gap: 12,
                maxHeight: 640,
                overflowY: 'auto',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: previewDark ? '#FF7A4A' : '#FF6B35',
                }}
              >
                Parcours
              </p>
              {/* Une seule cover différée — pas 2 ItineraryCard plein écran */}
              <div
                style={{
                  borderRadius: 16,
                  overflow: 'hidden',
                  height: 140,
                  background: '#e2e8f0',
                }}
              >
                {deferredItin ? (
                  <ParcoursCoverImg
                    coverImage={deferredItin.cover_image}
                    citySlug={deferredItin.city_slug}
                    slug={deferredItin.slug}
                    width={640}
                    style={{
                      width: '100%',
                      height: 140,
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : null}
              </div>
              <div
                style={{
                  borderRadius: 16,
                  padding: 12,
                  display: 'grid',
                  gap: 8,
                  background: previewDark ? '#1F1A17' : '#fff',
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 22,
                    fontStyle: 'italic',
                    fontWeight: 400,
                    lineHeight: 1.2,
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {deferredItin?.title || itin.title}
                </h2>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                  {citySlugDisplayNameFr(deferredItin?.city_slug || itin.city_slug)}
                  {(deferredItin?.duration_kind || itin.duration_kind)
                    ? ` · ${ITINERARY_DURATION_LABELS[(deferredItin?.duration_kind || itin.duration_kind) as ItineraryDurationKind] || deferredItin?.duration_kind || itin.duration_kind}`
                    : ''}
                </p>
                {(deferredItin?.intro || itin.intro) ? (
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, opacity: 0.9 }}>
                    {deferredItin?.intro || itin.intro}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.4 }}>
                    Introduction…
                  </p>
                )}
                <ol style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 8, fontSize: 13 }}>
                  {deferredItems.map((it, i) => (
                    <li key={it.localId}>
                      <strong>{it.title || `Étape ${i + 1}`}</strong>
                      {it.note ? (
                        <span style={{ opacity: 0.7 }}> — {it.note}</span>
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
