import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { MyTripDraft } from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Booking-oriented « Mon voyage » (not Planner).
 * ① Vol (lien externe) ② Hôtel (in-app) — invite optionnelle.
 */
export default function MyTrip() {
  const { token } = useParams<{ token: string }>()
  const [draft, setDraft] = useState<MyTripDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const row = await getApiClient().getMyTrip(token)
      setDraft(row)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voyage introuvable')
      setDraft(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const payload = (draft?.payload || {}) as Record<string, any>
  const flight = payload.flight || {}
  const hotel = payload.hotel || draft?.hotel
  const flightUrl = flight.booking_url || payload.booking_url || ''
  const city = draft?.city_name || payload.city || '—'
  const price = payload.price_per_person

  const onClaim = async () => {
    if (!token) return
    setClaiming(true)
    try {
      const user = await getCurrentUser()
      if (!user) {
        window.location.href = `/login?next=${encodeURIComponent(`/trip/${token}`)}`
        return
      }
      const row = await getApiClient().claimMyTrip(token)
      setDraft(row)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion requise')
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
        Chargement…
      </div>
    )
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-slate-700 font-medium">{error || 'Voyage introuvable ou expiré'}</p>
        <Link to="/" className="text-primary-600 font-bold underline">
          Retour aux deals
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
            Mon voyage
          </p>
          <h1 className="text-3xl font-black text-slate-900">{city}</h1>
          <p className="text-slate-600 mt-1">
            {formatDate(draft.out_date || payload.dates?.outbound)} →{' '}
            {formatDate(draft.ret_date || payload.dates?.inbound)}
            {draft.adults ? ` · ${draft.adults} pers.` : null}
          </p>
          {price != null ? (
            <p className="text-2xl font-black text-primary-600 mt-2">
              dès {Math.round(Number(price))} € / pers.
            </p>
          ) : null}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
          <h2 className="font-bold text-slate-900">1. Réserver le vol</h2>
          <p className="text-sm text-slate-600">
            Ouverture chez la compagnie. Deux réservations distinctes (vol + hôtel).
          </p>
          {flightUrl ? (
            <a
              href={flightUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl"
            >
              Continuer vers le vol
            </a>
          ) : (
            <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
              Lien vol indisponible pour l’instant — réessaie dans un instant.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
          <h2 className="font-bold text-slate-900">2. Réserver l’hôtel</h2>
          {hotel && typeof hotel === 'object' && (hotel as any).name ? (
            <p className="text-sm text-slate-700 font-medium">{(hotel as any).name}</p>
          ) : (
            <p className="text-sm text-slate-600">Ajouter un hôtel depuis le deal.</p>
          )}
          {draft.deal_key ? (
            <Link
              to={`/?deal=${encodeURIComponent(draft.deal_key)}`}
              className="block w-full text-center border border-line bg-white hover:bg-slate-50 text-ink font-bold py-3 rounded-xl"
            >
              Voir l’offre hôtel
            </Link>
          ) : null}
        </section>

        <section className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 space-y-2">
          <h2 className="font-bold text-slate-800">Inviter des amis</h2>
          <p className="text-sm text-slate-600">
            Optionnel — pour un trip à plusieurs, connecte-toi puis ouvre le Planner.
          </p>
          <button
            type="button"
            onClick={() => void onClaim()}
            disabled={claiming}
            className="text-sm font-bold text-primary-600 underline disabled:opacity-50"
          >
            {claiming ? '…' : 'Sauvegarder / inviter (connexion)'}
          </button>
        </section>

        <Link to="/" className="block text-center text-sm text-slate-500 underline">
          ← Retour
        </Link>
      </div>
    </div>
  )
}
