'use client'

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
import { useAuthSheet } from '@/components/auth/AuthHost'
import { DateField } from '@/components/pop/DateField'
import { PopOriginSelect } from '@/components/pop/PopOriginSelect'
import { auth } from '@/lib/auth'
import { getPlannerApi, plannerTripHref } from '@/lib/plannerApi'

type Props = {
  open: boolean
  onClose: () => void
  itinerary: Pick<
    Itinerary,
    'id' | 'title' | 'city_slug' | 'duration_kind' | 'slug'
  > & {
    itinerary_items?: Itinerary['itinerary_items']
  }
}

const PARTY_PILLS: { id: PartyMode; label: string }[] = [
  { id: 'solo', label: 'Solo' },
  { id: 'duo', label: 'Duo' },
  { id: 'groupe', label: 'Groupe' },
]

export function PopAddPlannerSheet({ open, onClose, itinerary }: Props) {
  const { openAuthSheet, signedIn } = useAuthSheet()
  const suggested = useMemo(
    () => suggestedParcoursDates(itinerary as Itinerary),
    [itinerary],
  )
  const [departure, setDeparture] = useState('CDG,ORY')
  const [passengers, setPassengers] = useState(2)
  const [partyMode, setPartyMode] = useState<PartyMode>('duo')
  const [outbound, setOutbound] = useState(suggested.outbound)
  const [inbound, setInbound] = useState(suggested.inbound)
  const [wantFlight, setWantFlight] = useState(false)
  const [wantHotel, setWantHotel] = useState(false)
  const [canOfferFlight, setCanOfferFlight] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const todayIso = useMemo(() => formatDateLocal(new Date()), [])

  useEffect(() => {
    setOutbound(suggested.outbound)
    setInbound(suggested.inbound)
  }, [suggested])

  useEffect(() => {
    if (!open || !wantFlight) return
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
  }, [open, wantFlight, itinerary.city_slug, departure])

  useEffect(() => {
    if (!open) return
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
      void getPlannerApi()
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
  }, [open, departure, itinerary.city_slug])

  if (!open) return null

  const cityLabel =
    citySlugDisplayNameFr(itinerary.city_slug) ||
    itinerary.city_slug ||
    ''
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
    setError(null)
    try {
      const api = getPlannerApi()
      const arrival = arrivalCodesForCitySlug(itinerary.city_slug) || null
      const trip = await api.createPlannedTrip({
        name: itinerary.title || `Week-end ${cityLabel}`,
        departure_airport: dep || 'CDG,ORY',
        arrival_airport: arrival,
        passengers,
        dates_depart: [{ date: out, heure_min: '00:00', heure_max: '23:59' }],
        dates_retour: [{ date: ret, heure_min: '00:00', heure_max: '23:59' }],
        budget_max: 200,
        direct: false,
        want_flight: flightEnabled,
        want_hotel: wantHotel,
        source_itinerary_id: itinerary.id,
        source_city_slug: itinerary.city_slug || null,
      })
      await api.applyItinerary(itinerary.id, { planned_trip_id: trip.id })
      if (!flightEnabled) {
        await api.skipPlannedTripFlight(trip.id).catch(() => {})
      }
      if (!wantHotel) {
        await api.skipPlannedTripHotel(trip.id).catch(() => {})
      }
      const q = new URLSearchParams()
      if (flightEnabled) q.set('autoScan', '1')
      if (wantHotel && !flightEnabled) q.set('openHotel', '1')
      const href = `${plannerTripHref(trip.id)}${q.toString() ? `?${q}` : ''}`
      window.location.href = href
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible')
      setSaving(false)
    }
  }

  const submit = async () => {
    setError(null)
    const user = signedIn ? true : Boolean(await auth.getCurrentUser())
    if (!user) {
      openAuthSheet({
        trigger: 'favorite',
        pending: {
          type: 'create_trip_from_parcours',
          trigger: 'favorite',
          payload: { itineraryId: itinerary.id },
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

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <div className="relative z-[1] max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-cream shadow-soft sm:max-w-lg sm:rounded-[28px]">
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-cream/95 px-5 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-bold text-ink-muted"
          >
            Annuler
          </button>
          <h3 className="text-base font-extrabold text-ink">Ajouter au Planner</h3>
          <span className="w-14" />
        </div>

        <div className="space-y-5 px-5 py-5">
          <p className="text-sm text-ink-muted">
            {itinerary.title}
            {cityLabel ? ` · ${cityLabel}` : ''}
          </p>
          <p className="rounded-2xl bg-accent-soft/60 px-3.5 py-3 text-[13px] leading-snug text-ink">
            On garde ce Pop dans ton Planner. Vol et hôtel, seulement si tu en
            as besoin.
          </p>

          <p className="text-[12px] font-semibold text-accent">
            Tu n’es pas sur place ? Pense au vol et à l’hôtel.
          </p>
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

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
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
                      ? 'border-ink bg-ink text-cream'
                      : 'border-line bg-white text-ink-muted'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              Voyageurs · {passengers}
              <input
                type="number"
                min={1}
                max={9}
                value={passengers}
                onChange={(e) =>
                  changePassengers(Number(e.target.value) || 1)
                }
                className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-ink"
              />
            </label>
          </div>

          {needsDeparture ? (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                Départ
              </p>
              <PopOriginSelect
                value={departure}
                onChange={setDeparture}
                excludeCitySlug={itinerary.city_slug}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                Aller
              </p>
              <DateField
                value={outbound}
                minDate={todayIso}
                onChange={(d) => {
                  setOutbound(d)
                  if (inbound && inbound < d) setInbound(d)
                }}
              />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                Retour
              </p>
              <DateField
                value={inbound}
                minDate={outbound || todayIso}
                onChange={setInbound}
              />
            </div>
            <button
              type="button"
              className="col-span-2 text-left text-xs font-bold text-accent"
              onClick={() => {
                const d = generateDatesFromPreset('next-weekend')
                if (d.dates_depart[0]?.date) setOutbound(d.dates_depart[0].date)
                if (d.dates_retour[0]?.date) setInbound(d.dates_retour[0].date)
              }}
            >
              Utiliser le week-end prochain
            </button>
          </div>

          {error ? (
            <p className="text-sm font-semibold text-red-600">{error}</p>
          ) : null}

          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="w-full rounded-full bg-ink py-3.5 text-sm font-bold text-cream disabled:opacity-50"
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
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 text-left"
    >
      <span>
        <span className="block text-sm font-extrabold text-ink">{label}</span>
        <span className="mt-0.5 block text-[12px] font-medium text-ink-muted">
          {hint}
        </span>
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full ${
          checked ? 'bg-[#2F9E5C]' : 'bg-[#EDE8E1]'
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${
            checked ? 'left-[1.35rem]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}
