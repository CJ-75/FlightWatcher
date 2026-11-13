import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, AdminApiError } from '../api/adminApi'
import { StepUpModal } from '../components/StepUpModal'
import { ErrorBlock, LoadingBlock } from '../components/PageState'
import { useImpersonationContext } from '../context/ImpersonationContext'
import { adminCacheKey, adminSwr, invalidateAdminCache, peekAdminCache } from '../lib/adminCache'

type UserRow = {
  id: string
  email?: string
  nom?: string
  inscrit_le?: string
  onboarding_fait?: boolean
  ville?: string
  aeroport?: string
}

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function UsersCsmPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [inscritsTotal, setInscritsTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [qDraft, setQDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [stepUpOpen, setStepUpOpen] = useState(false)
  const [stepUpMode, setStepUpMode] = useState<'logas' | 'delete'>('logas')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editUser, setEditUser] = useState<UserRow | null>(null)
  const [editNom, setEditNom] = useState('')
  const [editVille, setEditVille] = useState('')
  const [editAeroport, setEditAeroport] = useState('')
  const [editOnboarded, setEditOnboarded] = useState(false)
  const [saving, setSaving] = useState(false)
  const hasRows = useRef(false)
  const { startImpersonation } = useImpersonationContext()

  const load = useCallback(async (force = false) => {
    const key = adminCacheKey(['inscrits', page, 50, q || '', 'all'])
    const cached = peekAdminCache<{
      users: UserRow[]
      total: number
      inscrits_total: number
    }>(key)
    if (cached && !force) {
      setUsers(cached.users || [])
      setTotal(cached.total || 0)
      setInscritsTotal(cached.inscrits_total || 0)
      hasRows.current = true
      setLoading(false)
    } else if (!hasRows.current) {
      setLoading(true)
    }
    setError(null)
    try {
      const { data: res } = await adminSwr({
        key,
        force,
        ttlMs: 30_000,
        staleMs: 120_000,
        fetcher: () =>
          adminApi.inscrits({
            page,
            page_size: 50,
            q: q || undefined,
            onboarding: 'all',
          }),
      })
      setUsers(res.users || [])
      setTotal(res.total || 0)
      setInscritsTotal(res.inscrits_total || 0)
      hasRows.current = true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [page, q])

  useEffect(() => {
    void load()
  }, [load])

  const openEdit = (u: UserRow) => {
    setEditUser(u)
    setEditNom(u.nom || '')
    setEditVille(u.ville || '')
    setEditAeroport(u.aeroport || '')
    setEditOnboarded(!!u.onboarding_fait)
    setError(null)
    setInfo(null)
  }

  const saveEdit = async () => {
    if (!editUser) return
    setSaving(true)
    setError(null)
    try {
      const res = await adminApi.updateInscrit(editUser.id, {
        nom: editNom,
        ville: editVille,
        aeroport: editAeroport,
        onboarding_completed: editOnboarded,
      })
      if (!res.ok) throw new Error(res.error || 'Enregistrement impossible')
      setInfo(`Profil mis à jour · ${editUser.email || editUser.id}`)
      setEditUser(null)
      invalidateAdminCache('inscrits')
      invalidateAdminCache('dashboard')
      await load(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const runLogAs = async (userId: string) => {
    setBusyId(userId)
    setError(null)
    setInfo(null)
    try {
      const res = await startImpersonation(userId)
      if (!res.success) {
        if (res.status === 403) {
          setStepUpMode('logas')
          setPendingUserId(userId)
          setStepUpOpen(true)
          return
        }
        throw new Error(res.error || 'Log as impossible')
      }
      setInfo(`Session ouverte pour ${res.email || 'cet utilisateur'} (nouvel onglet).`)
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 403) {
        setStepUpMode('logas')
        setPendingUserId(userId)
        setStepUpOpen(true)
      } else {
        setError(e instanceof Error ? e.message : 'Log as impossible')
      }
    } finally {
      setBusyId(null)
    }
  }

  const runDelete = async (userId: string) => {
    setBusyId(userId)
    setError(null)
    setInfo(null)
    try {
      const res = await adminApi.deleteInscrit(userId, 'SUPPRIMER')
      if (!res.ok) throw new Error(res.error || 'Suppression impossible')
      setInfo('Utilisateur supprimé.')
      setPendingDeleteId(null)
      invalidateAdminCache('inscrits')
      invalidateAdminCache('dashboard')
      await load(true)
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 403) {
        setStepUpMode('delete')
        setPendingDeleteId(userId)
        setStepUpOpen(true)
      } else {
        setError(e instanceof Error ? e.message : 'Suppression impossible')
      }
    } finally {
      setBusyId(null)
    }
  }

  const askDelete = (u: UserRow) => {
    const ok = window.confirm(
      `Supprimer définitivement ${u.email || u.id} ?\nCette action est irréversible.`,
    )
    if (!ok) return
    void runDelete(u.id)
  }

  const pageCount = Math.max(1, Math.ceil(total / 50))

  return (
    <div>
      <div className="fw-page-head">
        <div>
          <h1 className="fw-display">Utilisateurs</h1>
          <p>
            Fiches inscrits ({inscritsTotal}) — éditer, Log as, supprimer.
          </p>
        </div>
        <Link to="/admin/onboarding" className="fw-btn" style={{ textDecoration: 'none' }}>
          Voir l’onboarding →
        </Link>
      </div>

      <div className="fw-toolbar">
        <input
          className="fw-input"
          style={{ flex: '1 1 200px' }}
          placeholder="Rechercher email ou nom…"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1)
              setQ(qDraft.trim())
            }
          }}
        />
        <button
          type="button"
          className="fw-btn fw-btn-primary"
          onClick={() => {
            setPage(1)
            setQ(qDraft.trim())
          }}
        >
          Chercher
        </button>
      </div>

      {error ? (
        <div style={{ marginBottom: '0.75rem' }}>
          <ErrorBlock error={error} />
        </div>
      ) : null}
      {info ? (
        <div className="fw-alert ok" style={{ marginBottom: '0.75rem' }}>
          {info}
        </div>
      ) : null}
      {loading ? <LoadingBlock label="Chargement…" /> : null}

      {!loading && (
        <>
          <div className="fw-table-wrap">
            <table className="fw-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nom</th>
                  <th>Inscrit le</th>
                  <th>Ville</th>
                  <th>Aéroport</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 560 }}>{u.email || '—'}</td>
                    <td>{u.nom || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(u.inscrit_le)}</td>
                    <td className="fw-muted">{u.ville || '—'}</td>
                    <td className="fw-muted">{u.aeroport || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="fw-btn"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
                          onClick={() => openEdit(u)}
                        >
                          Éditer
                        </button>
                        <button
                          type="button"
                          className="fw-btn"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
                          disabled={!u.id || busyId === u.id}
                          onClick={() => void runLogAs(u.id)}
                        >
                          {busyId === u.id ? '…' : 'Log as'}
                        </button>
                        <button
                          type="button"
                          className="fw-btn fw-btn-danger"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
                          disabled={!u.id || busyId === u.id}
                          onClick={() => askDelete(u)}
                        >
                          Suppr.
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!users.length ? (
              <p className="fw-muted" style={{ padding: '1rem', margin: 0 }}>
                Aucun utilisateur pour cette recherche.
              </p>
            ) : null}
          </div>
          <div
            style={{
              display: 'flex',
              gap: '0.55rem',
              alignItems: 'center',
              marginTop: '0.95rem',
            }}
          >
            <button
              type="button"
              className="fw-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Précédent
            </button>
            <span className="fw-muted" style={{ fontSize: '0.85rem' }}>
              Page {page} / {pageCount} · {total} résultat(s)
            </span>
            <button
              type="button"
              className="fw-btn"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </button>
          </div>
        </>
      )}

      {editUser ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(11,18,32,0.45)',
            display: 'grid',
            placeItems: 'center',
            padding: '1rem',
          }}
          onClick={() => setEditUser(null)}
        >
          <div
            className="fw-card"
            style={{ width: 'min(440px, 100%)', display: 'grid', gap: '0.75rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="fw-section-title" style={{ margin: 0 }}>
              Éditer l’utilisateur
            </h2>
            <p className="fw-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              {editUser.email || editUser.id}
            </p>
            <label className="fw-label">
              Nom
              <input
                className="fw-input"
                value={editNom}
                onChange={(e) => setEditNom(e.target.value)}
              />
            </label>
            <label className="fw-label">
              Ville (slug)
              <input
                className="fw-input"
                value={editVille}
                onChange={(e) => setEditVille(e.target.value)}
                placeholder="paris"
              />
            </label>
            <label className="fw-label">
              Aéroport
              <input
                className="fw-input"
                value={editAeroport}
                onChange={(e) => setEditAeroport(e.target.value.toUpperCase())}
                placeholder="CDG"
              />
            </label>
            <label
              className="fw-label"
              style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}
            >
              <input
                type="checkbox"
                checked={editOnboarded}
                onChange={(e) => setEditOnboarded(e.target.checked)}
              />
              Onboarding terminé
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="fw-btn" onClick={() => setEditUser(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="fw-btn fw-btn-primary"
                disabled={saving}
                onClick={() => void saveEdit()}
              >
                {saving ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <StepUpModal
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false)
          setPendingUserId(null)
          setPendingDeleteId(null)
        }}
        onSuccess={() => {
          if (stepUpMode === 'logas' && pendingUserId) {
            const id = pendingUserId
            setPendingUserId(null)
            void runLogAs(id)
          } else if (stepUpMode === 'delete' && pendingDeleteId) {
            const id = pendingDeleteId
            setPendingDeleteId(null)
            void runDelete(id)
          }
        }}
      />
    </div>
  )
}
