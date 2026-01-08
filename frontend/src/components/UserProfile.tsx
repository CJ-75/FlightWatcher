/**
 * Composant pour gérer le profil utilisateur
 * Permet de configurer home_airport et afficher referral_code
 */

import { useState, useEffect } from 'react'
import { getSupabaseClient, getCurrentUser } from '../lib/supabase'

interface UserProfile {
  id: string
  home_airport?: string
  referral_code?: string
  created_at: string
  last_active?: string
}

export default function UserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [homeAirport, setHomeAirport] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const user = await getCurrentUser()
      const supabase = await getSupabaseClient()
      if (!user || !supabase) return

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        console.error('Erreur chargement profil:', error)
      } else if (data) {
        setProfile(data)
        setHomeAirport(data.home_airport || '')
      } else {
        // Créer le profil s'il n'existe pas
        await createProfile(user.id)
      }
    } catch (error) {
      console.error('Erreur:', error)
    } finally {
      setLoading(false)
    }
  }

  const createProfile = async (userId: string) => {
    const supabase = await getSupabaseClient()
    if (!supabase) return

    try {
      // Générer un referral_code unique
      const referralCode = generateReferralCode()

      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          referral_code: referralCode
        })
        .select()
        .single()

      if (error) throw error

      setProfile(data)
      setHomeAirport(data.home_airport || '')
    } catch (error) {
      console.error('Erreur création profil:', error)
    }
  }

  const generateReferralCode = (): string => {
    // Générer un code de 8 caractères aléatoires
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const saveProfile = async () => {
    const supabase = await getSupabaseClient()
    if (!supabase) return

    setSaving(true)
    setMessage(null)

    try {
      const user = await getCurrentUser()
      if (!user) throw new Error('Utilisateur non connecté')

      const updateData: any = {
        home_airport: homeAirport || null,
        last_active: new Date().toISOString()
      }

      // Si pas de referral_code, en générer un
      if (!profile?.referral_code) {
        updateData.referral_code = generateReferralCode()
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          ...updateData
        })
        .select()
        .single()

      if (error) throw error

      setProfile(data)
      setMessage('✅ Profil sauvegardé avec succès')
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Erreur sauvegarde profil:', error)
      setMessage('❌ Erreur lors de la sauvegarde')
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <div className="text-gray-600">Chargement du profil...</div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-xl">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">👤 Mon Profil</h2>

      {message && (
        <div className={`mb-4 p-3 rounded ${
          message.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {message}
        </div>
      )}

      <div className="space-y-4">
        {/* Home Airport */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Aéroport de départ par défaut
          </label>
          <input
            type="text"
            value={homeAirport}
            onChange={(e) => setHomeAirport(e.target.value.toUpperCase())}
            placeholder="Ex: BVA, CDG, ORY..."
            maxLength={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Code IATA de votre aéroport de départ préféré (3 lettres)
          </p>
        </div>

        {/* Referral Code */}
        {profile?.referral_code && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Code de parrainage
            </label>
            <div className="flex items-center gap-2">
              <code className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg font-mono text-lg font-bold">
                {profile.referral_code}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(profile.referral_code!)
                  setMessage('✅ Code copié dans le presse-papier')
                  setTimeout(() => setMessage(null), 2000)
                }}
                className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
              >
                📋 Copier
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Partagez ce code avec vos amis pour les inviter (fonctionnalité à venir)
            </p>
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={saveProfile}
          disabled={saving}
          className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold 
                   hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
        >
          {saving ? '⏳ Sauvegarde...' : '💾 Sauvegarder'}
        </button>
      </div>
    </div>
  )
}

