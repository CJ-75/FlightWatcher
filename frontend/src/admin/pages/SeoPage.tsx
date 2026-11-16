import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { citySlugDisplayNameFr } from '@waypop/shared'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock } from '../components/PageState'

type SeoCity = {
  city_slug: string
  indexable?: boolean
  opened_at?: string | null
  notes?: string | null
  updated_at?: string | null
  published_count?: number
  missing_row?: boolean
}

type SeoPop = {
  id: string
  slug?: string | null
  title?: string | null
  city_slug?: string
  featured?: boolean
  target_query?: string | null
  intro_len?: number
  gaps?: string[]
  seo_ready?: boolean
  updated_at?: string | null
}

type SeoDash = {
  ok?: boolean
  error?: string
  cities?: SeoCity[]
  pops?: SeoPop[]
  open_cities?: string[]
  stats?: {
    cities_total?: number
    cities_open?: number
    pops_published?: number
    pops_seo_ready?: number
  }
}

const GAP_LABEL: Record<string, string> = {
  intro: 'Intro < 80',
  cover: 'Cover',
  license: 'Licence photo',
  target_query: 'Target query',
  verified_at: 'Vérifié',
  canonical: 'Canonique',
  override_off: 'Override off',
  city_closed: 'Ville fermée',
}

export function SeoPage() {
  const [data, setData] = useState<SeoDash | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyCity, setBusyCity] = useState<string | null>(null)
  const [newCity, setNewCity] = useState('')
  const [filter, setFilter] = useState<'all' | 'gaps' | 'ready'>('gaps')
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = (await adminApi.seoDashboard()) as SeoDash
      if (res.ok === false) throw new Error(res.error || 'Chargement impossible')
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pops = useMemo(() => {
    const list = data?.pops || []
    if (filter === 'ready') return list.filter((p) => p.seo_ready)
    if (filter === 'gaps') return list.filter((p) => !p.seo_ready)
    return list
  }, [data?.pops, filter])

  const toggleCity = async (city: SeoCity, next: boolean) => {
    const slug = city.city_slug
    if (
      next &&
      !window.confirm(
        `Ouvrir l’indexation SEO pour « ${citySlugDisplayNameFr(slug) || slug} » ?\nLes Pops prêts entreront au sitemap.`,
      )
    ) {
      return
    }
    setBusyCity(slug)
    setToast(null)
    try {
      await adminApi.seoUpsertCity(slug, { indexable: next })
      setToast(
        next
          ? `${slug} ouverte à l’indexation`
          : `${slug} fermée (noindex)`,
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur maj ville')
    } finally {
      setBusyCity(null)
    }
  }

  const saveNotes = async (slug: string, notes: string) => {
    setBusyCity(slug)
    try {
      await adminApi.seoUpsertCity(slug, { notes })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur notes')
    } finally {
      setBusyCity(null)
    }
  }

  const addCity = async () => {
    const slug = newCity.trim().toLowerCase().replace(/\s+/g, '-')
    if (!slug) return
    setBusyCity(slug)
    try {
      await adminApi.seoUpsertCity(slug, { indexable: false, notes: '' })
      setNewCity('')
      setToast(`Ville « ${slug} » ajoutée (fermée)`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur ajout')
    } finally {
      setBusyCity(null)
    }
  }

  const revalidate = async (city?: string, slug?: string) => {
    setToast(null)
    try {
      const res = await adminApi.seoRevalidate({ city_slug: city, slug })
      if ((res as { skipped?: boolean }).skipped) {
        setToast('Revalidate skip — POP_REVALIDATE_URL non configurée')
      } else if ((res as { ok?: boolean }).ok === false) {
        setToast(`Revalidate fail: ${(res as { error?: string }).error || 'erreur'}`)
      } else {
        setToast(city || slug ? `Revalidate ${city || ''}/${slug || ''}` : 'Revalidate sitemap')
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Revalidate erreur')
    }
  }

  if (loading && !data) return <LoadingBlock />
  if (error && !data) return <ErrorBlock error={error} />

  const stats = data?.stats

  return (
    <div>
      <div className="fw-page-head">
        <div>
          <h1 className="fw-display">SEO Pops</h1>
          <p>
            Indexation ville par ville, gaps éditoriaux, revalidate Next.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="fw-btn"
            onClick={() => void revalidate()}
          >
            Revalidate
          </button>
          <button
            type="button"
            className="fw-btn"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? '…' : 'Rafraîchir'}
          </button>
        </div>
      </div>

      {toast ? (
        <p className="fw-muted" style={{ marginTop: 0 }}>
          {toast}
        </p>
      ) : null}
      {error ? <ErrorBlock error={error} /> : null}

      <div className="fw-grid fw-grid-4" style={{ marginBottom: '1.15rem' }}>
        <Kpi label="Villes suivies" value={stats?.cities_total ?? 0} />
        <Kpi label="Villes ouvertes" value={stats?.cities_open ?? 0} />
        <Kpi label="Pops publiés" value={stats?.pops_published ?? 0} />
        <Kpi
          label="SEO ready"
          value={stats?.pops_seo_ready ?? 0}
          hint="Sans gap critique"
        />
      </div>

      <section className="fw-card" style={{ marginBottom: '1.15rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <strong>Villes — indexation</strong>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              className="fw-input"
              placeholder="nouvelle-ville"
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              style={{ width: '10rem' }}
            />
            <button
              type="button"
              className="fw-btn"
              onClick={() => void addCity()}
              disabled={!newCity.trim() || !!busyCity}
            >
              Ajouter
            </button>
          </div>
        </div>

        <div className="fw-table-wrap">
          <table className="fw-table">
            <thead>
              <tr>
                <th>Ville</th>
                <th>Pops</th>
                <th>Indexable</th>
                <th>Ouverte</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data?.cities || []).map((c) => {
                const slug = c.city_slug
                const open = !!c.indexable
                return (
                  <tr key={slug}>
                    <td>
                      <strong>
                        {citySlugDisplayNameFr(slug) || slug}
                      </strong>
                      <div className="fw-muted" style={{ fontSize: '0.8rem' }}>
                        {slug}
                        {c.missing_row ? ' · pas encore en table' : ''}
                      </div>
                    </td>
                    <td>{c.published_count ?? 0}</td>
                    <td>
                      <span className={`fw-badge ${open ? 'ok' : 'warn'}`}>
                        {open ? 'Oui' : 'Non'}
                      </span>
                    </td>
                    <td className="fw-muted" style={{ fontSize: '0.85rem' }}>
                      {c.opened_at
                        ? String(c.opened_at).slice(0, 10)
                        : '—'}
                    </td>
                    <td style={{ minWidth: '12rem' }}>
                      <input
                        className="fw-input"
                        defaultValue={c.notes || ''}
                        key={`${slug}-${c.updated_at || ''}-notes`}
                        onBlur={(e) => {
                          const v = e.target.value
                          if (v !== (c.notes || '')) {
                            void saveNotes(slug, v)
                          }
                        }}
                        disabled={busyCity === slug}
                      />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="fw-btn"
                        disabled={busyCity === slug}
                        onClick={() => void toggleCity(c, !open)}
                      >
                        {busyCity === slug
                          ? '…'
                          : open
                            ? 'Fermer'
                            : 'Ouvrir'}
                      </button>
                      <button
                        type="button"
                        className="fw-btn"
                        style={{ marginLeft: '0.35rem' }}
                        onClick={() => void revalidate(slug)}
                      >
                        ISR
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!(data?.cities || []).length ? (
                <tr>
                  <td colSpan={6} className="fw-muted">
                    Aucune ville — applique la migration SEO puis ajoute Paris.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fw-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <strong>Pops publiés — gaps SEO</strong>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {(
              [
                ['gaps', 'Avec gaps'],
                ['ready', 'Ready'],
                ['all', 'Tous'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className="fw-btn"
                style={
                  filter === k
                    ? { background: '#1D1B19', color: '#FFF9F5' }
                    : undefined
                }
                onClick={() => setFilter(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="fw-table-wrap">
          <table className="fw-table">
            <thead>
              <tr>
                <th>Pop</th>
                <th>Ville</th>
                <th>Intro</th>
                <th>Gaps</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pops.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.title || p.slug || p.id}</strong>
                    {p.featured ? (
                      <span
                        className="fw-badge ok"
                        style={{ marginLeft: '0.4rem' }}
                      >
                        Featured
                      </span>
                    ) : null}
                    <div className="fw-muted" style={{ fontSize: '0.8rem' }}>
                      {p.target_query || 'pas de target_query'}
                    </div>
                  </td>
                  <td>{p.city_slug}</td>
                  <td>{p.intro_len ?? 0}</td>
                  <td>
                    {p.seo_ready ? (
                      <span className="fw-badge ok">Ready</span>
                    ) : (
                      <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {(p.gaps || []).map((g) => (
                          <span key={g} className="fw-badge warn">
                            {GAP_LABEL[g] || g}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link
                      to={`/admin/parcours/${p.id}`}
                      className="fw-btn"
                    >
                      Éditer
                    </Link>
                    {p.city_slug && p.slug ? (
                      <a
                        className="fw-btn"
                        style={{ marginLeft: '0.35rem' }}
                        href={`/parcours/${encodeURIComponent(p.slug)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Voir
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!pops.length ? (
                <tr>
                  <td colSpan={5} className="fw-muted">
                    Aucun Pop dans ce filtre.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
