'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  arrivalCodesForCitySlug,
  citySlugDisplayNameFr,
  encodeAirportCodes,
  generateDatesFromPreset,
  parseAirportCodes,
  suggestedParcoursDates,
  type Itinerary,
} from '@waypop/shared'
import { useAuthSheet } from '@/components/auth/AuthHost'
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

export function PopAddPlannerSheet({ open, onClose, itinerary }: Props) {
  const { openAuthSheet, signedIn } = useAuthSheet()
  const suggested = useMemo(
    () => suggestedParcoursDates(itinerary as Itinerary),
    [itinerary],
  )
  const [departure, setDeparture] = useState('CDG,ORY')
  const [passengers, setPassengers] = useState(2)
  const [outbound, setOutbound] = useState(suggested.outbound)
  const [inbound, setInbound] = useState(suggested.inbound)
  const [wantFlight, setWantFlight] = useState(false)
  const [wantHotel, setWantHotel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOutbound(suggested.outbound)
    setInbound(suggested.inbound)
  }, [suggested])

  if (!open) return null

  const cityLabel =
    citySlugDisplayNameFr(itinerary.city_slug) ||
    itinerary.city_slug ||
    ''
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
        want_flight: wantFlight,
        want_hotel: wantHotel,
        source_itinerary_id: itinerary.id,
        source_city_slug: itinerary.city_slug || null,
      })
      await api.applyItinerary(itinerary.id, { planned_trip_id: trip.id })
      if (!wantFlight) {
        await api.skipPlannedTripFlight(trip.id).catch(() => {})
      }
      if (!wantHotel) {
        await api.skipPlannedTripHotel(trip.id).catch(() => {})
      }
      const q = new URLSearchParams()
      if (wantFlight) q.set('autoScan', '1')
      if (wantHotel && !wantFlight) q.set('openHotel', '1')
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
            Le programme du Pop est ajouté tout de suite. Active Vol et/ou Hôtel
            si tu en as besoin — tu pourras aussi le faire plus tard.
          </p>

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
          <p className="text-[12px] font-medium text-ink-muted">
            Tu viens d’une autre ville ? Active Vol et/ou Hôtel.
          </p>

          <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted">
            Voyageurs
            <input
              type="number"
              min={1}
              max={9}
              value={passengers}
              onChange={(e) =>
                setPassengers(Math.min(9, Math.max(1, Number(e.target.value) || 1)))
              }
              className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-ink"
            />
          </label>

          {needsDeparture ? (
            <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              Départ (IATA)
              <input
                value={departure}
                onChange={(e) => setDeparture(e.target.value.toUpperCase())}
                placeholder="CDG,ORY"
                className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-ink"
              />
            </label>
          ) : null}

          {needsDates ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                Aller
                <input
                  type="date"
                  value={outbound}
                  onChange={(e) => setOutbound(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-ink"
                />
              </label>
              <label className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                Retour
                <input
                  type="date"
                  value={inbound}
                  onChange={(e) => setInbound(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-ink"
                />
              </label>
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
          ) : null}

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
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left ${
        checked
          ? 'border-[rgba(255,107,53,0.35)] bg-[#FFF7F2]'
          : 'border-line bg-white'
      }`}
    >
      <span>
        <span className="block text-sm font-extrabold text-ink">{label}</span>
        <span className="mt-0.5 block text-[12px] font-medium text-ink-muted">
          {hint}
        </span>
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full ${
          checked ? 'bg-[#FF6B35]' : 'bg-[#E8DFD6]'
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
