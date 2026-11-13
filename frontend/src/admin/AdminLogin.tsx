/**
 * Login admin — mot de passe seul (ADMIN_PASSWORD).
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '../utils/apiBase'
import { useAdminAuth } from './hooks/useAdminAuth'
import './styles/admin.css'

export function AdminLogin() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { isAdmin, loading: authLoading, checkAdmin } = useAdminAuth()

  useEffect(() => {
    const id = 'fw-admin-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Sora:wght@400;500;600;700;800&display=swap'
    document.head.appendChild(link)
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (isAdmin) navigate('/admin', { replace: true })
  }, [authLoading, isAdmin, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!password) {
      setError('Mot de passe requis')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data.detail === 'string' ? data.detail : 'Mot de passe incorrect')
        setLoading(false)
        return
      }
      await checkAdmin()
      navigate('/admin', { replace: true })
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="fw-login">
        <div className="fw-skeleton" style={{ width: 280, height: 120 }} />
      </div>
    )
  }

  return (
    <div className="fw-login">
      <div className="fw-login-card">
        <div className="fw-login-mark" aria-hidden>
          F
        </div>
        <h1 className="brand">
          Flight<span>Watcher</span>
        </h1>
        <p className="sub">Espace administrateur — mot de passe uniquement</p>

        {error ? <div className="fw-login-error">{error}</div> : null}

        <form onSubmit={handleSubmit}>
          <label htmlFor="admin-password">Mot de passe</label>
          <input
            id="admin-password"
            className="fw-input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={loading}
          />
          <button
            type="submit"
            className="fw-btn fw-btn-primary"
            disabled={loading || !password}
          >
            {loading ? 'Connexion…' : 'Entrer'}
          </button>
        </form>
      </div>
    </div>
  )
}
