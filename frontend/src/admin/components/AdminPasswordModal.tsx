/**
 * Modal pour saisir le mot de passe admin
 */
import { useState } from 'react'
import { getAccessToken } from '../../lib/supabase'
import { toast } from 'react-hot-toast'

interface AdminPasswordModalProps {
  isOpen: boolean
  onSuccess: () => void
  onCancel: () => void
}

export function AdminPasswordModal({ isOpen, onSuccess, onCancel }: AdminPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!password) {
      toast.error('Veuillez saisir le mot de passe')
      return
    }

    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error('Token d\'accès non disponible')
        setLoading(false)
        return
      }

      const apiUrl = window.location.origin.includes('localhost')
        ? 'http://localhost:8000/api/admin/verify-password'
        : '/api/admin/verify-password'

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include', // Important pour recevoir les cookies
        body: JSON.stringify({ password })
      })

      if (response.ok) {
        toast.success('Mot de passe correct')
        setPassword('')
        onSuccess()
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Mot de passe incorrect')
      }
    } catch (error: any) {
      toast.error('Erreur lors de la vérification du mot de passe')
      console.error('Erreur vérification mot de passe:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#252836] border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold text-white mb-4">Mot de passe administrateur</h2>
        <p className="text-gray-400 text-sm mb-6">
          Votre email est autorisé. Veuillez saisir le mot de passe administrateur pour continuer.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a1d29] border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Saisissez le mot de passe admin"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Vérification...' : 'Valider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

