import { useEffect, useMemo, useState } from 'react'
import {
  arrivalCodesForCitySlug,
  cityDisplayNameFr,
  encodeAirportCodes,
  generateDatesFromPreset,
  parseAirportCodes,
  partyModeDefaultPassengers,
  suggestedParcoursDates,
  type Itinerary,
  type PartyMode,
} from '@flightwatcher/shared'
import { getApiClient } from '../../utils/apiClient'
import { CityAirportSelect } from '../CityAirportSelect'
import { PassengerStepper } from '../PassengerStepper'
import { getCurrentUser, signInWithGoogle } from '../../lib/supabase'

type Props = {
  itinerary: Itinerary
  onClose: () => void
  onCreated: (tripId: string) => void
}

/**
 * Feuille §7.4 — dates / départ / pax → create trip + apply parcours.
 */
export function MakeTripSheet({ itinerary, onClose, onCreated }: Props) {
  const suggested = useMemo(
    () => suggestedParcoursDates(itinerary),
    [itinerary],
  )
  const [departure, setDeparture] = useState('CDG,ORY')
  const [passengers, setPassengers] = useState(2)
  const [partyMode, setPartyMode] = useState<PartyMode>('duo')
  const [outbound, setOutbound] = useState(suggested.outbound)
  const [inbound, setInbound] = useState(suggested.inbound)
  const [budget, setBudget] = useState(200)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needAuth, setNeedAuth] = useState(false)

  useEffect(() => {
    void getCurrentUser().then((u) => {
      if (!u) setNeedAuth(true)
    })
  }, [])

  useEffect(() => {
    setPassengers(partyModeDefaultPassengers(partyMode))
  }, [partyMode])

  const cityLabel =
    cityDisplayNameFr(null, itinerary.city_slug || '') ||
    itinerary.city_slug ||
    ''
  const arrival =
    arrivalCodesForCitySlug(itinerary.city_slug) || undefined

  const submit = async () => {
    setError(null)
    const user = await getCurrentUser()
    if (!user) {
      setNeedAuth(true)
      const { error: authErr } = await signInWithGoogle()
      if (authErr) {
        setError(authErr.message || 'Connexion requise')
        return
      }
    }
    const dep = encodeAirportCodes(parseAirportCodes(departure))
    if (!dep) {
      setError('Choisis une ville de départ')
      return
    }
    if (!outbound || !inbound) {
      setError('Choisis des dates')
      return
    }
    setSaving(true)
    try {
      const api = getApiClient()
      const trip = await api.createPlannedTrip({
        name: itinerary.title || `Week-end ${cityLabel}`,
        departure_airport: dep,
        arrival_airport: arrival || null,
        passengers,
        dates_depart: [
          { date: outbound, heure_min: '00:00', heure_max: '23:59' },
        ],
        dates_retour: [
          { date: inbound, heure_min: '00:00', heure_max: '23:59' },
        ],
        budget_max: budget,
        direct: false,
      })
      const apply = await api.applyItinerary(itinerary.id, {
        planned_trip_id: trip.id,
      })
      void api
        .trackActivityEvent({
          domain: 'itinerary',
          event: 'itinerary_make_trip',
          surface: 'parcours',
          platform: 'web',
          meta: {
            itinerary_id: itinerary.id,
            trip_id: trip.id,
            created: apply.created,
          },
        })
        .catch(() => {})
      onCreated(trip.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible')
    } finally {
      setSaving(false)
    }
  }

  const useNextWeekend = () => {
    const d = generateDatesFromPreset('next-weekend')
    const out = d.dates_depart[0]?.date
    const ret = d.dates_retour[0]?.date
    if (out) setOutbound(out)
    if (ret) setInbound(ret)
  }

  return (
    <div className="app-dialog-root items-end sm:items-center">
      <button
        type="button"
        aria-label="Fermer"
        className="app-dialog-backdrop"
        onClick={onClose}
      />
      <div className="app-dialog-panel w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white/95 px-5 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-bold text-muted"
          >
            Annuler
          </button>
          <h3 className="text-base font-extrabold text-ink">En faire mon voyage</h3>
          <span className="w-14" />
        </div>

        <div className="space-y-5 px-5 py-5">
          <p className="text-sm text-muted">
            {itinerary.title}
            {cityLabel ? ` · ${cityLabel}` : ''}
          </p>

          {needAuth ? (
            <p className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
              Connexion requise pour créer le voyage.
            </p>
          ) : null}

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
              Qui voyage ?
            </p>
            <div className="flex gap-2">
              {(
                [
                  { id: 'solo' as const, label: 'Solo' },
                  { id: 'duo' as const, label: 'Duo' },
                  { id: 'groupe' as const, label: 'À plusieurs' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPartyMode(p.id)}
                  className={`flex-1 rounded-full px-3 py-2 text-sm font-bold border ${
                    partyMode === p.id
                      ? 'bg-ink text-white border-ink'
                      : 'bg-white text-muted border-line'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
              Voyageurs
            </p>
            <PassengerStepper value={passengers} onChange={setPassengers} min={1} max={9} />
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
              Départ
            </p>
            <CityAirportSelect
              value={departure}
              onChange={setDeparture}
              placeholder="Ville / aéroport"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold uppercase tracking-wide text-muted space-y-1">
              Aller
              <input
                type="date"
                value={outbound}
                onChange={(e) => setOutbound(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-muted space-y-1">
              Retour
              <input
                type="date"
                value={inbound}
                onChange={(e) => setInbound(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={useNextWeekend}
            className="text-xs font-bold text-[color:var(--fw-accent)]"
          >
            Utiliser le week-end prochain
          </button>

          <label className="block text-xs font-bold uppercase tracking-wide text-muted space-y-1">
            Budget max / pers. (€)
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value) || 0)}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink"
            />
          </label>

          {error ? (
            <p className="text-sm font-semibold text-red-600">{error}</p>
          ) : null}

          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="w-full rounded-full bg-ink py-3.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Création…' : 'Créer le voyage'}
          </button>
        </div>
      </div>
    </div>
  )
}
