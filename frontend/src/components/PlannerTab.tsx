import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type {
  CreatePlannedTripRequest,
  DateAvecHoraire,
  PlannedTrip,
  PlannedTripDetail,
  TripProposal,
} from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { DestinationCard } from './DestinationCard'
import { BudgetSlider } from './BudgetSlider'
import { PassengerStepper } from './PassengerStepper'
import { DatePresets, type DatePreset } from './DatePresets'
import { FlexibleDatesSelector } from './FlexibleDatesSelector'
import { generateDatesFromPreset, formatDateFr } from '@flightwatcher/shared'

function inviteUrl(token: string) {
  return `${window.location.origin}/planner/invite/${token}`
}

async function shareInvite(name: string, token: string) {
  const url = inviteUrl(token)
  const text = `Rejoins mon voyage « ${name} » sur FlightWatcher : ${url}`
  if (navigator.share) {
    try {
      await navigator.share({ title: name, text, url })
      return 'shared'
    } catch {
      /* cancelled */
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  scanning: 'Scan…',
  planning: 'Propositions',
  locked: 'Confirmé',
}

export function PlannerTab() {
  const { t } = useI18n()
  const [userId, setUserId] = useState<string | null>(null)
  const [trips, setTrips] = useState<PlannedTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    void getCurrentUser().then((u) => setUserId(u?.id ?? null))
  }, [])

  const load = useCallback(async () => {
    if (!userId) {
      setTrips([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await getApiClient().listPlannedTrips()
      setTrips(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
      setTrips([])
    } finally {
      setLoading(false)
    }
  }, [userId, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(id)
  }, [toast])

  if (!userId) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 px-4">
        <h2 className="text-2xl font-black text-slate-900 mb-2">{t('nav.planner')}</h2>
        <p className="text-slate-500 mb-6">{t('planner.loginRequired')}</p>
        <a
          href="/login"
          className="inline-block bg-primary-500 text-white font-bold px-6 py-3 rounded-xl"
        >
          {t('auth.signIn')}
        </a>
      </div>
    )
  }

  if (selectedTripId) {
    return (
      <TripDetailView
        tripId={selectedTripId}
        userId={userId}
        onBack={() => {
          setSelectedTripId(null)
          void load()
        }}
        onToast={setToast}
      />
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 sm:mb-8 px-1 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {t('nav.planner')}
          </h2>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">{t('planner.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="bg-primary-500 text-white font-bold px-5 py-2.5 rounded-xl shrink-0"
        >
          {t('planner.create')}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-4" />
          <p className="font-medium">{t('planner.loading')}</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <p className="font-bold text-slate-900 mb-2">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="bg-primary-500 text-white font-bold px-5 py-2.5 rounded-xl"
          >
            {t('deals.retry')}
          </button>
        </div>
      ) : trips.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <p className="font-bold text-slate-900 mb-2">{t('planner.emptyTitle')}</p>
          <p className="text-sm text-slate-500 mb-4">{t('planner.emptyBody')}</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="bg-primary-500 text-white font-bold px-5 py-2.5 rounded-xl"
          >
            {t('planner.create')}
          </button>
        </div>
      ) : (
        <motion.div layout className="space-y-3">
          {trips.map((trip) => (
            <button
              key={trip.id}
              type="button"
              onClick={() => setSelectedTripId(trip.id)}
              className="w-full text-left bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow p-5"
            >
              <div className="flex items-center gap-3">
                <h3 className="flex-1 font-bold text-lg text-slate-900 truncate">{trip.name}</h3>
                <span className="text-xs font-bold text-primary-700 bg-orange-50 px-2.5 py-1 rounded-full">
                  {STATUS_LABEL[trip.status] || trip.status}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {trip.departure_airport}
                {trip.arrival_airport ? ` → ${trip.arrival_airport}` : ' · inspire'}
                {' · '}
                {trip.passengers} voy. · {trip.budget_max}€
                {(trip.proposals_count ?? 0) > 0
                  ? ` · ${trip.proposals_count} prop.`
                  : ''}
              </p>
            </button>
          ))}
        </motion.div>
      )}

      {showCreate ? (
        <CreateTripModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false)
            void load()
            setSelectedTripId(id)
          }}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg z-50">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

function CreateTripModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { t } = useI18n()
  const initial = useMemo(() => generateDatesFromPreset('next-weekend'), [])
  const [name, setName] = useState('')
  const [departure, setDeparture] = useState('BVA')
  const [arrival, setArrival] = useState('')
  const [passengers, setPassengers] = useState(2)
  const [budget, setBudget] = useState(150)
  const [preset, setPreset] = useState<DatePreset>('next-weekend')
  const [datesDepart, setDatesDepart] = useState<DateAvecHoraire[]>(initial.dates_depart)
  const [datesRetour, setDatesRetour] = useState<DateAvecHoraire[]>(initial.dates_retour)
  const [showFlexible, setShowFlexible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPreset = (p: DatePreset) => {
    setPreset(p)
    if (p === 'flexible') {
      setShowFlexible(true)
      return
    }
    const d = generateDatesFromPreset(p)
    setDatesDepart(d.dates_depart)
    setDatesRetour(d.dates_retour)
  }

  const submit = async () => {
    if (!name.trim()) {
      setError('Nom requis')
      return
    }
    if (!datesDepart.length || !datesRetour.length) {
      setError('Dates requises')
      return
    }
    setSaving(true)
    setError(null)
    const body: CreatePlannedTripRequest = {
      name: name.trim(),
      departure_airport: departure.trim().toUpperCase(),
      arrival_airport: arrival.trim() ? arrival.trim().toUpperCase() : null,
      passengers,
      dates_depart: datesDepart,
      dates_retour: datesRetour,
      budget_max: budget,
    }
    try {
      const trip = await getApiClient().createPlannedTrip(body)
      onCreated(trip.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-black text-lg text-slate-900">{t('planner.create')}</h3>
          <button type="button" onClick={onClose} className="text-slate-500 font-semibold">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm font-bold text-slate-700 block mb-1">Nom</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekend Lisbonne"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-medium"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-slate-700 block mb-1">Départ</label>
              <input
                value={departure}
                onChange={(e) => setDeparture(e.target.value.toUpperCase())}
                maxLength={3}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-bold tracking-wider"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-700 block mb-1">Arrivée (opt.)</label>
              <input
                value={arrival}
                onChange={(e) => setArrival(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="ANY"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-bold tracking-wider"
              />
            </div>
          </div>
          <PassengerStepper value={passengers} onChange={setPassengers} />
          <BudgetSlider value={budget} onChange={setBudget} />
          <DatePresets
            selected={preset}
            onChange={onPreset}
            onFlexibleClick={() => {
              setPreset('flexible')
              setShowFlexible(true)
            }}
          />
          {datesDepart[0] && datesRetour[0] ? (
            <p className="text-sm text-slate-500">
              {formatDateFr(datesDepart[0].date)} →{' '}
              {formatDateFr(datesRetour[datesRetour.length - 1].date)}
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-600 font-medium">{error}</p> : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="w-full bg-primary-500 text-white font-bold py-3 rounded-xl disabled:opacity-60"
          >
            {saving ? '…' : 'Créer'}
          </button>
        </div>
      </div>

      {showFlexible ? (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-black text-slate-900">Dates libres</h4>
              <button
                type="button"
                onClick={() => setShowFlexible(false)}
                className="font-bold text-primary-600"
              >
                OK
              </button>
            </div>
            <FlexibleDatesSelector
              flexibleDates={{ dates_depart: datesDepart, dates_retour: datesRetour }}
              onFlexibleDatesChange={(d) => {
                setDatesDepart(d.dates_depart)
                setDatesRetour(d.dates_retour)
              }}
              formatDateFr={formatDateFr}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TripDetailView({
  tripId,
  userId,
  onBack,
  onToast,
}: {
  tripId: string
  userId: string
  onBack: () => void
  onToast: (msg: string) => void
}) {
  const { t } = useI18n()
  const [trip, setTrip] = useState<PlannedTripDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const detail = await getApiClient().getPlannedTrip(tripId)
      setTrip(detail)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setLoading(false)
    }
  }, [tripId, t])

  useEffect(() => {
    void load()
  }, [load])

  const isOrganizer = trip?.organizer_id === userId
  const pending = (trip?.proposals || []).filter((p) => p.status === 'pending')
  const accepted = (trip?.proposals || []).find((p) => p.status === 'accepted')

  const scan = async () => {
    setScanning(true)
    try {
      await getApiClient().scanPlannedTrip(tripId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setScanning(false)
    }
  }

  const accept = async (id: string) => {
    setActing(id)
    try {
      await getApiClient().acceptProposal(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setActing(null)
    }
  }

  const reject = async (id: string) => {
    setActing(id)
    try {
      await getApiClient().rejectProposal(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setActing(null)
    }
  }

  const doShare = async () => {
    if (!trip) return
    const result = await shareInvite(trip.name, trip.invite_token)
    if (result === 'copied') onToast(t('planner.shareCopied'))
  }

  if (loading && !trip) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Introuvable'}</p>
        <button type="button" onClick={onBack} className="font-bold text-primary-500">
          ← Retour
        </button>
      </div>
    )
  }

  const url = inviteUrl(trip.invite_token)
  const encoded = encodeURIComponent(`Rejoins mon voyage « ${trip.name} » : ${url}`)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button type="button" onClick={onBack} className="text-sm font-bold text-primary-600">
        ← {t('nav.planner')}
      </button>

      <div className="bg-white rounded-2xl shadow-md p-6 space-y-2">
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-2xl font-black text-slate-900">{trip.name}</h2>
          <span className="text-xs font-bold text-primary-700 bg-orange-50 px-2.5 py-1 rounded-full">
            {STATUS_LABEL[trip.status] || trip.status}
          </span>
        </div>
        <p className="text-slate-500">
          {trip.departure_airport}
          {trip.arrival_airport ? ` → ${trip.arrival_airport}` : ' · inspire'}
          {' · '}
          {trip.passengers} voy. · {trip.budget_max}€/pers
        </p>
        {trip.dates_depart[0] && trip.dates_retour[0] ? (
          <p className="text-sm text-slate-500">
            {formatDateFr(trip.dates_depart[0].date)} →{' '}
            {formatDateFr(trip.dates_retour[trip.dates_retour.length - 1].date)}
          </p>
        ) : null}
        <p className="text-sm text-slate-400">
          {t('planner.members')}: {(trip.members || []).length}
        </p>
      </div>

      {error ? <p className="text-red-600 text-sm font-medium">{error}</p> : null}

      {isOrganizer && trip.status !== 'locked' ? (
        <button
          type="button"
          disabled={scanning}
          onClick={() => void scan()}
          className="w-full sm:w-auto bg-primary-500 text-white font-bold px-6 py-3 rounded-xl disabled:opacity-60"
        >
          {scanning ? t('planner.scanning') : t('planner.scan')}
        </button>
      ) : null}

      {accepted ? (
        <section className="space-y-4">
          <h3 className="font-bold text-lg text-slate-900">Proposition acceptée</h3>
          <DestinationCard
            trip={accepted.trip_data}
            onSaveFavorite={() => undefined}
          />
          {isOrganizer ? <ShareBar onShare={() => void doShare()} encoded={encoded} url={url} t={t} /> : null}
        </section>
      ) : null}

      {pending.length > 0 ? (
        <section className="space-y-4">
          <h3 className="font-bold text-lg text-slate-900">
            {t('planner.proposals')} ({pending.length})
          </h3>
          {pending.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              isOrganizer={!!isOrganizer}
              busy={acting === p.id}
              onAccept={() => void accept(p.id)}
              onReject={() => void reject(p.id)}
              t={t}
            />
          ))}
        </section>
      ) : null}

      {!accepted && pending.length === 0 && !scanning ? (
        <div className="bg-white rounded-2xl shadow p-8 text-center text-slate-500">
          {isOrganizer
            ? 'Lance un scan pour trouver des vols.'
            : 'Pas encore de propositions.'}
        </div>
      ) : null}

      {trip.status === 'locked' && isOrganizer ? (
        <ShareBar onShare={() => void doShare()} encoded={encoded} url={url} t={t} />
      ) : null}
    </div>
  )
}

function ProposalCard({
  proposal,
  isOrganizer,
  busy,
  onAccept,
  onReject,
  t,
}: {
  proposal: TripProposal
  isOrganizer: boolean
  busy: boolean
  onAccept: () => void
  onReject: () => void
  t: (k: string) => string
}) {
  return (
    <div className="space-y-3">
      <DestinationCard trip={proposal.trip_data} onSaveFavorite={() => undefined} />
      {isOrganizer ? (
        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="flex-1 border border-slate-200 rounded-xl py-2.5 font-bold text-slate-600 disabled:opacity-50"
          >
            {t('planner.reject')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onAccept}
            className="flex-1 bg-primary-500 text-white rounded-xl py-2.5 font-bold disabled:opacity-50"
          >
            {t('planner.accept')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function ShareBar({
  onShare,
  encoded,
  url,
  t,
}: {
  onShare: () => void
  encoded: string
  url: string
  t: (k: string) => string
}) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-5 space-y-3">
      <p className="font-bold text-slate-900">{t('planner.share')}</p>
      <p className="text-xs text-slate-400 break-all">{url}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onShare}
          className="bg-primary-500 text-white font-bold px-4 py-2 rounded-xl text-sm"
        >
          {t('planner.share')}
        </button>
        <a
          href={`https://wa.me/?text=${encoded}`}
          target="_blank"
          rel="noreferrer"
          className="bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-sm"
        >
          WhatsApp
        </a>
        <a
          href={`https://twitter.com/intent/tweet?text=${encoded}`}
          target="_blank"
          rel="noreferrer"
          className="bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-sm"
        >
          X
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noreferrer"
          className="bg-blue-600 text-white font-bold px-4 py-2 rounded-xl text-sm"
        >
          Facebook
        </a>
      </div>
    </div>
  )
}
