import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { HotelBooking } from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'

function formatDate(dateStr?: string) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function MyBookings() {
  const [bookings, setBookings] = useState<HotelBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authed, setAuthed] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const user = await getCurrentUser()
      if (!user) {
        setAuthed(false)
        setBookings([])
        return
      }
      setAuthed(true)
      const list = await getApiClient().listHotelBookings()
      setBookings(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div>
            <p className="app-kicker mb-1">Compte</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              Mes réservations
            </h1>
            <p className="text-sm text-muted mt-1">Réservations hôtel via FlightWatcher</p>
          </div>
          <Link to="/" className="text-sm font-bold text-primary-600 hover:underline">
            ← Accueil
          </Link>
        </div>

        {!authed ? (
          <div className="bg-white rounded-3xl border border-line shadow-soft p-8 text-center">
            <p className="font-bold text-ink mb-2">Connexion requise</p>
            <p className="text-sm text-muted mb-4">Connecte-toi pour voir tes réservations hôtel.</p>
            <Link
              to="/login"
              className="inline-flex app-btn-primary rounded-2xl px-5 py-2.5 text-sm"
            >
              Se connecter
            </Link>
          </div>
        ) : loading ? (
          <p className="text-sm text-muted">Chargement…</p>
        ) : error ? (
          <div className="bg-white rounded-3xl border border-line p-6">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="text-sm font-bold text-primary-600"
            >
              Réessayer
            </button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-3xl border border-line shadow-soft p-8 text-center">
            <p className="font-bold text-ink mb-2">Aucune réservation</p>
            <p className="text-sm text-muted">Réserve un hôtel depuis un deal vol + hôtel.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {bookings.map((b) => (
              <li
                key={b.id}
                className="bg-white rounded-3xl border border-line shadow-soft p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-ink text-lg">
                      {b.city || 'Séjour'} · {b.hotel_name || 'Hôtel'}
                    </p>
                    <p className="text-sm text-muted mt-1">
                      {formatDate(b.dates?.outbound)} → {formatDate(b.dates?.inbound)}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary-50 text-primary-700 text-xs font-bold px-3 py-1">
                    {b.status}
                  </span>
                </div>
                <div className="mt-3 text-sm text-ink-soft space-y-1">
                  {b.charged_price != null ? (
                    <p>Montant hôtel : {Math.round(Number(b.charged_price))} €</p>
                  ) : null}
                  {b.confirmation_code ? (
                    <p>
                      Confirmation : <strong>{b.confirmation_code}</strong>
                    </p>
                  ) : null}
                  <p className="text-xs text-muted">
                    {b.created_at
                      ? new Date(b.created_at).toLocaleString('fr-FR')
                      : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
