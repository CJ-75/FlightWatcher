import { useEffect, useMemo, useState } from 'react'
import {
  arrivalCodesForCitySlug,
  citySlugDisplayNameFr,
  defaultAirportCodesForCity,
  encodeAirportCodes,
  filterDepartureCityGroups,
  findCityGroupByCodes,
  formatDateLocal,
  generateDatesFromPreset,
  groupAirportsByCity,
  parseAirportCodes,
  partyModeDefaultPassengers,
  partyModeFromCount,
  seedPopularAirports,
  suggestedParcoursDates,
  type Itinerary,
  type PartyMode,
} from '@waypop/shared'
import { getApiClient } from '../../utils/apiClient'
import { Calendar } from '../Calendar'
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
  /** Elsewhere nudge above toggles. */
  nudge?: string | null
}

const PARTY_PILLS: { id: PartyMode; label: string }[] = [
  { id: 'solo', label: 'Solo' },
  { id: 'duo', label: 'Duo' },
  { id: 'groupe', label: 'Groupe' },
]

/**
 * Feuille Pop → Planner : programme toujours ; Vol / Hôtel opt-in séparés.
 */
export function MakeTripSheet({
  itinerary,
  onClose,
  onCreated,
  nudge = null,
}: Props) {
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
  const todayIso = useMemo(() => formatDateLocal(new Date()), [])
  const [wantFlight, setWantFlight] = useState(false)
  const [wantHotel, setWantHotel] = useState(false)
  /** null = checking; only show Vol toggle when true */
  const [canOfferFlight, setCanOfferFlight] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadOnboardingPrefs().then((p) => {
      if (p.departureAirportCodes) setDeparture(p.departureAirportCodes)
    })
  }, [])

  useEffect(() => {
    if (!wantFlight) return
    const groups = filterDepartureCityGroups(
      groupAirportsByCity(seedPopularAirports()),
      { excludeCitySlug: itinerary.city_slug },
    )
    const selected = findCityGroupByCodes(
      groups,
      parseAirportCodes(departure),
    )
    if (selected) return
    const fallback = groups[0]
    if (!fallback) return
    const encoded = encodeAirportCodes(
      defaultAirportCodesForCity(fallback.airports.map((a) => a.code)),
    )
    if (encoded) setDeparture(encoded)
  }, [wantFlight, itinerary.city_slug, departure])

  useEffect(() => {
    setOutbound(suggested.outbound)
    setInbound(suggested.inbound)
  }, [suggested])

  const cityLabel =
    citySlugDisplayNameFr(itinerary.city_slug) ||
    itinerary.city_slug ||
    ''
  const arrival =
    arrivalCodesForCitySlug(itinerary.city_slug) || undefined

  useEffect(() => {
    const dep =
      encodeAirportCodes(parseAirportCodes(departure)) || 'CDG,ORY'
    const arr = arrivalCodesForCitySlug(itinerary.city_slug)
    if (!arr) {
      setCanOfferFlight(false)
      setWantFlight(false)
      return
    }
    let cancelled = false
    setCanOfferFlight(null)
    const timer = window.setTimeout(() => {
      void getApiClient()
        .checkRouteLink({ from: dep, to: arr })
        .then((res) => {
          if (cancelled) return
          const ok = Boolean(res.linked)
          setCanOfferFlight(ok)
          if (!ok) setWantFlight(false)
        })
        .catch(() => {
          if (cancelled) return
          setCanOfferFlight(false)
          setWantFlight(false)
        })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [departure, itinerary.city_slug])

  const flightEnabled = canOfferFlight === true && wantFlight
  const needsDeparture = flightEnabled

  const selectParty = (mode: PartyMode) => {
    setPartyMode(mode)
    setPassengers(partyModeDefaultPassengers(mode))
  }

  const changePassengers = (n: number) => {
    const pax = Math.min(9, Math.max(1, n))
    setPassengers(pax)
    setPartyMode(partyModeFromCount(pax))
  }

  const createTrip = async () => {
    const dep = encodeAirportCodes(parseAirportCodes(departure))
    if (needsDeparture && !dep) {
      setError('Choisis une ville de départ')
      return
    }
    const out = outbound || suggested.outbound
    const ret = inbound || suggested.inbound
    if (!out || !ret) {
      setError('Choisis des dates')
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
        want_flight: flightEnabled,
        want_hotel: wantHotel,
        source_itinerary_id: itinerary.id,
        source_city_slug: itinerary.city_slug || null,
      })
      const apply = await api.applyItinerary(itinerary.id, {
        planned_trip_id: trip.id,
      })
      if (!flightEnabled) {
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
            want_flight: flightEnabled,
            want_hotel: wantHotel,
          },
        })
        .catch(() => {})
      onCreated({
        tripId: trip.id,
        wantFlight: flightEnabled,
        wantHotel,
      })
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
            wantFlight: flightEnabled,
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
            On garde ce Pop dans ton Planner. Vol et hôtel, seulement si tu en
            as besoin.
          </p>

          <div className="space-y-2">
            {nudge ? (
              <p className="px-1 text-[12px] font-semibold text-[#E85A28]">
                {nudge}
              </p>
            ) : null}
            {canOfferFlight === true ? (
              <ToggleRow
                label="Trouver un vol"
                hint="Départ + scan des prix"
                checked={wantFlight}
                onChange={setWantFlight}
              />
            ) : null}
            <ToggleRow
              label="Trouver un hôtel"
              hint="Offres près du Pop"
              checked={wantHotel}
              onChange={setWantHotel}
            />
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
              Qui voyage ?
            </p>
            <div className="flex gap-2">
              {PARTY_PILLS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectParty(p.id)}
                  className={`min-w-0 flex-1 truncate rounded-full border px-2.5 py-2 text-center text-sm font-bold ${
                    partyMode === p.id
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-white text-muted'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                Voyageurs · {passengers}
              </p>
              <PassengerStepper
                value={passengers}
                onChange={changePassengers}
                min={1}
                max={9}
              />
            </div>
          </div>

          {needsDeparture ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                Départ
              </p>
              <CityAirportSelect
                value={departure}
                onChange={setDeparture}
                excludeCitySlug={itinerary.city_slug}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                Aller
              </p>
              <Calendar
                value={outbound}
                onChange={(d) => {
                  setOutbound(d)
                  if (inbound && inbound < d) setInbound(d)
                }}
                minDate={todayIso}
                displayFormat="slash"
                compact
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                Retour
              </p>
              <Calendar
                value={inbound}
                onChange={setInbound}
                minDate={outbound || todayIso}
                displayFormat="slash"
                compact
              />
            </div>
          </div>
          <button
            type="button"
            onClick={useNextWeekend}
            className="text-xs font-bold text-[color:var(--fw-accent)]"
          >
            Utiliser le week-end prochain
          </button>

          {flightEnabled ? (
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
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 text-left transition"
    >
      <span>
        <span className="block text-sm font-extrabold text-ink">{label}</span>
        <span className="mt-0.5 block text-[12px] font-medium text-muted">
          {hint}
        </span>
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          checked ? 'bg-[#2F9E5C]' : 'bg-[#EDE8E1]'
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
