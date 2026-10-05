import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { InvitePreview } from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { DestinationCard } from '../components/DestinationCard'
import { formatDateFr } from '@flightwatcher/shared'

export default function PlannerInvite() {
  const { token = '' } = useParams<{ token: string }>()
  const { t } = useI18n()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)

  useEffect(() => {
    void getCurrentUser().then((u) => setUserId(u?.id ?? null))
  }, [])

  const load = useCallback(async () => {
    if (!token) {
      setError('Lien invalide')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await getApiClient().getInvitePreview(token)
      setPreview(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  const join = async () => {
    if (!token) return
    setJoining(true)
    setError(null)
    try {
      await getApiClient().joinInvite(token)
      setJoined(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <div className="max-w-lg mx-auto px-4 py-10 sm:py-16">
        <Link to="/" className="text-sm font-bold text-primary-600">
          ← FlightWatcher
        </Link>

        <h1 className="mt-6 text-3xl font-black text-slate-900 tracking-tight">
          {t('planner.invite.title')}
        </h1>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
          </div>
        ) : error && !preview ? (
          <div className="mt-8 bg-white rounded-2xl shadow-lg p-8 text-center">
            <p className="font-bold text-slate-900 mb-2">Oups</p>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        ) : preview ? (
          <div className="mt-8 space-y-6">
            <div className="bg-white rounded-2xl shadow-md p-6 space-y-2">
              <h2 className="text-xl font-black text-slate-900">{preview.name}</h2>
              <p className="text-slate-500">
                {preview.departure_airport}
                {preview.arrival_airport ? ` → ${preview.arrival_airport}` : ''}
              </p>
              <p className="text-sm text-slate-500">
                {preview.passengers} voy. · max {preview.budget_max}€/pers
              </p>
              {preview.dates_depart[0] && preview.dates_retour[0] ? (
                <p className="text-sm text-slate-500">
                  {formatDateFr(preview.dates_depart[0].date)} →{' '}
                  {formatDateFr(
                    preview.dates_retour[preview.dates_retour.length - 1].date,
                  )}
                </p>
              ) : null}
              <p className="text-sm text-slate-400">
                {preview.members_count} membre{preview.members_count > 1 ? 's' : ''}
              </p>
            </div>

            {preview.accepted_trip ? (
              <DestinationCard
                trip={preview.accepted_trip}
                onSaveFavorite={() => undefined}
              />
            ) : null}

            {joined ? (
              <div className="bg-emerald-50 text-emerald-800 font-bold rounded-xl p-4 text-center">
                {t('planner.invite.joined')}
              </div>
            ) : userId ? (
              <button
                type="button"
                disabled={joining}
                onClick={() => void join()}
                className="w-full bg-primary-500 text-white font-bold py-3.5 rounded-xl disabled:opacity-60"
              >
                {joining ? '…' : t('planner.invite.join')}
              </button>
            ) : (
              <Link
                to={`/login?redirect=${encodeURIComponent(`/planner/invite/${token}`)}`}
                className="block w-full text-center bg-primary-500 text-white font-bold py-3.5 rounded-xl"
              >
                {t('planner.invite.login')}
              </Link>
            )}

            {error ? <p className="text-sm text-red-600 font-medium text-center">{error}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
