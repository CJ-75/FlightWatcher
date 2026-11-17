import { useEffect, useMemo, useState } from 'react'
import {
  arrivalCodesForCitySlug,
  citySlugDisplayNameFr,
  encodeAirportCodes,
  generateDatesFromPreset,
  parseAirportCodes,
  partyModeDefaultPassengers,
  suggestedParcoursDates,
  type Itinerary,
  type PartyMode,
} from '@waypop/shared'
import { getApiClient } from '../../utils/apiClient'
import { CityAirportSelect } from '../CityAirportSelect'
import { PassengerStepper } from '../PassengerStepper'
import { getCurrentUser } from '../../lib/supabase'
import { useAuthSheet } from '../onboarding/AuthSheetHost'
import { loadOnboardingPrefs } from '@waypop/shared'

export type MakeTripCreated = {
  tripId: string
  wantFlight: boolean
  wantHotel: boolean
}

type Props = {
  itinerary: Itinerary
  onClose: () => void
  onCreated: (result: MakeTripCreated) => void
}

/**
 * Feuille Pop → Planner : programme toujours ; Vol / Hôtel opt-in séparés.
 */
export function MakeTripSheet({ itinerary, onClose, onCreated }: Props) {
  const { openAuthSheet } = useAuthSheet()
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
  const [wantFlight, setWantFlight] = useState(false)
  const [wantHotel, setWantHotel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadOnboardingPrefs().then((p) => {
      if (p.departureAirportCodes) setDeparture(p.departureAirportCodes)
    })
  }, [])

  useEffect(() => {
    setPassengers(partyModeDefaultPassengers(partyMode))
  }, [partyMode])

  const cityLabel =
    citySlugDisplayNameFr(itinerary.city_slug) ||
    itinerary.city_slug ||
    ''
  const arrival =
    arrivalCodesForCitySlug(itinerary.city_slug) || undefined
  const needsDates = wantFlight || wantHotel
  const needsDeparture = wantFlight

  const createTrip = async () => {
    const dep = encodeAirportCodes(parseAirportCodes(departure))
    if (needsDeparture && !dep) {
      setError('Choisis une ville de départ')
      return
    }
    if (needsDates && (!outbound || !inbound)) {
      setError('Choisis des dates')
      return
    }
    const out = outbound || suggested.outbound
    const ret = inbound || suggested.inbound
    if (!out || !ret) {
      setError('Dates indisponibles pour ce Pop')
      return
    }
    setSaving(true)
    try {
      const api = getApiClient()
      const trip = await api.createPlannedTrip({
        name: itinerary.title || `Week-end ${cityLabel}`,
        departure_airport: dep || 'CDG,ORY',
        arrival_airport: arrival || null,
        passengers,
        dates_depart: [
          { date: out, heure_min: '00:00', heure_max: '23:59' },
        ],
        dates_retour: [
          { date: ret, heure_min: '00:00', heure_max: '23:59' },
        ],
        budget_max: budget,
        direct: false,
        want_flight: wantFlight,
        want_hotel: wantHotel,
        source_itinerary_id: itinerary.id,
        source_city_slug: itinerary.city_slug || null,
      })
      const apply = await api.applyItinerary(itinerary.id, {
        planned_trip_id: trip.id,
      })
      if (!wantFlight) {
        await api.skipPlannedTripFlight(trip.id).catch(() => {})
      }
      if (!wantHotel) {
        await api.skipPlannedTripHotel(trip.id).catch(() => {})
      }
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
            want_flight: wantFlight,
            want_hotel: wantHotel,
          },
        })
        .catch(() => {})
      onCreated({ tripId: trip.id, wantFlight, wantHotel })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible')
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    setError(null)
    const user = await getCurrentUser()
    if (!user) {
      openAuthSheet({
        trigger: 'create_trip',
        pending: {
          type: 'create_trip_from_parcours',
          trigger: 'create_trip',
          payload: {
            itineraryId: itinerary.id,
            departure,
            passengers,
            outbound,
            inbound,
            budget,
            wantFlight,
            wantHotel,
          },
          createdAt: Date.now(),
        },
        onAuthenticated: () => {
          void createTrip()
        },
      })
      return
    }
    await createTrip()
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
          <h3 className="text-base font-extrabold text-ink">Ajouter au Planner</h3>
          <span className="w-14" />
        </div>

        <div className="space-y-5 px-5 py-5">
          <p className="text-sm text-muted">
            {itinerary.title}
            {cityLabel ? ` · ${cityLabel}` : ''}
          </p>
          <p className="rounded-2xl bg-[#FFF7F2] px-3.5 py-3 text-[13px] leading-snug text-[#5C4F44]">
            Le programme du Pop est ajouté tout de suite. Active Vol et/ou Hôtel
            si tu en as besoin — tu pourras aussi le faire plus tard.
          </p>

          <div className="space-y-2">
            <ToggleRow
              label="Vol"
              hint="Départ + dates, puis scan des prix"
              checked={wantFlight}
              onChange={setWantFlight}
            />
            <ToggleRow
              label="Hôtel"
              hint="Dates, puis offres près du Pop"
              checked={wantHotel}
              onChange={setWantHotel}
            />
            <p className="px-1 text-[12px] font-medium text-muted">
              Tu viens d’une autre ville ? Active Vol et/ou Hôtel.
            </p>
          </div>

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

          {needsDeparture ? (
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
          ) : null}

          {needsDates ? (
            <>
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
            </>
          ) : null}

          {wantFlight ? (
            <label className="block text-xs font-bold uppercase tracking-wide text-muted space-y-1">
              Budget max / pers. (€)
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink"
              />
            </label>
          ) : null}

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

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
        checked
          ? 'border-[rgba(255,107,53,0.35)] bg-[#FFF7F2]'
          : 'border-line bg-white'
      }`}
    >
      <span>
        <span className="block text-sm font-extrabold text-ink">{label}</span>
        <span className="mt-0.5 block text-[12px] font-medium text-muted">
          {hint}
        </span>
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          checked ? 'bg-[#FF6B35]' : 'bg-[#E8DFD6]'
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
            checked ? 'left-[1.35rem]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}
