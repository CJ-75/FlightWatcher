/**
 * Login admin — mot de passe seul (ADMIN_PASSWORD dans backend/.env). Pas de Google.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '../utils/apiBase'
import { useAdminAuth } from './hooks/useAdminAuth'

export function AdminLogin() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { isAdmin, loading: authLoading, checkAdmin } = useAdminAuth()

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
      <div className="min-h-screen bg-[#fff8f3] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#ff6b35]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fff8f3] flex items-center justify-center p-4">
      <div className="bg-white border border-[#f0e4d8] rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-[#ff6b35] rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-xl">F</span>
          </div>
          <h1
            className="text-2xl font-bold text-stone-900 mb-1"
            style={{ fontFamily: 'Sora, sans-serif' }}
          >
            FlightWatcher Admin
          </h1>
          <p className="text-stone-500 text-sm">Connexion par mot de passe administrateur</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-password" className="block text-sm font-medium text-stone-700 mb-1">
              Mot de passe
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-[#f0e4d8] rounded-xl text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#ff6b35]/50"
              placeholder="Mot de passe"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-[#ff6b35] hover:bg-[#e85f2e] text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Connexion…' : 'Entrer'}
          </button>
        </form>
      </div>
    </div>
  )
}
