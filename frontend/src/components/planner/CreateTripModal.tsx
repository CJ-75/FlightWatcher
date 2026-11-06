/**
 * Nouveau voyage — étape 1 Solo/Duo/À plusieurs, puis critères.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Airport, DateAvecHoraire } from '../../types'
import { getApiClient, destinationsToAirports, normalizeDestinations } from '../../utils/apiClient'
import { loadAirportsOnce } from '../../hooks/useAirports'
import { useI18n } from '../../contexts/I18nContext'
import { BudgetSlider } from '../BudgetSlider'
import { PassengerStepper } from '../PassengerStepper'
import { FlexibleDatesSelector } from '../FlexibleDatesSelector'
import { CityAirportSelect } from '../CityAirportSelect'
import {
  cityDisplayNameFr,
  encodeAirportCodes,
  encodeArrivalCodes,
  findCityGroupByKey,
  formatDateFr,
  formatTripDateRangeFr,
  generateDatesFromPreset,
  groupAirportsByCity,
  parseAirportCodes,
  PARTY_MODE_OPTIONS,
  partyModeCreateHintFr,
  partyModeDefaultPassengers,
  partyModeKickerFr,
  partyModeMaxPassengers,
  partyModeMinPassengers,
  type CityAirportGroup,
  type PartyMode,
} from '@flightwatcher/shared'
import type { DatePreset } from '../DatePresets'

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'next-weekend', label: 'Weekend prochain' },
  { id: 'flexible', label: 'Dates libres' },
]

export function CreateTripModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { t } = useI18n()
  const initial = useMemo(() => {
    const d = generateDatesFromPreset('next-weekend')
    return {
      dates_depart: d.dates_depart.map((x) => ({
        ...x,
        heure_min: '00:00',
        heure_max: '23:59',
      })),
      dates_retour: d.dates_retour.map((x) => ({
        ...x,
        heure_min: '00:00',
        heure_max: '23:59',
      })),
    }
  }, [])

  const [step, setStep] = useState<1 | 2>(1)
  const [partyMode, setPartyMode] = useState<PartyMode | null>(null)
  const [name, setName] = useState('')
  const [departure, setDeparture] = useState('')
  const [arrivalCityKey, setArrivalCityKey] = useState('')
  const [arrivalCodes, setArrivalCodes] = useState<string[]>([])
  const [arrivalAirports, setArrivalAirports] = useState<Airport[]>([])
  const [cityQuery, setCityQuery] = useState('')
  const [passengers, setPassengers] = useState(2)
  const [budget, setBudget] = useState(150)
  const [directOnly, setDirectOnly] = useState(false)
  const [preset, setPreset] = useState<DatePreset>('next-weekend')
  const [datesDepart, setDatesDepart] = useState<DateAvecHoraire[]>(initial.dates_depart)
  const [datesRetour, setDatesRetour] = useState<DateAvecHoraire[]>(initial.dates_retour)
  const [showFlexible, setShowFlexible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cityGroups = useMemo(
    () => groupAirportsByCity(arrivalAirports),
    [arrivalAirports],
  )
  const selectedCity = useMemo(
    () => findCityGroupByKey(cityGroups, arrivalCityKey),
    [cityGroups, arrivalCityKey],
  )
  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase()
    if (!q) return cityGroups.slice(0, 12)
    return cityGroups
      .filter(
        (g) =>
          g.city.toLowerCase().includes(q) ||
          g.country.toLowerCase().includes(q) ||
          g.airports.some((a) => a.code.toLowerCase().includes(q)),
      )
      .slice(0, 40)
  }, [cityGroups, cityQuery])

  useEffect(() => {
    void loadAirportsOnce().catch(() => undefined)
  }, [])

  useEffect(() => {
    const origins = parseAirportCodes(departure)
    if (!origins.length) {
      setArrivalAirports([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const lists = await Promise.all(
          origins.map(async (code) => {
            try {
              return normalizeDestinations(await getApiClient().getDestinations(code))
            } catch {
              return []
            }
          }),
        )
        if (cancelled) return
        const seen = new Set<string>()
        const merged = []
        for (const list of lists) {
          for (const d of list) {
            const code = (d?.code || '').toUpperCase()
            if (!code || seen.has(code)) continue
            seen.add(code)
            merged.push(d)
          }
        }
        const next = destinationsToAirports(merged)
        setArrivalAirports(next)
        setArrivalCodes((codes) => {
          const allowed = new Set(next.map((a) => a.code))
          const kept = codes.filter((c) => allowed.has(c))
          if (kept.length !== codes.length) {
            setArrivalCityKey('')
            return []
          }
          return codes
        })
      } catch {
        if (!cancelled) setArrivalAirports([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [departure])

  const selectParty = (mode: PartyMode) => {
    if (!name.trim()) {
      setError('Donne un nom au voyage')
      return
    }
    setPartyMode(mode)
    setPassengers(partyModeDefaultPassengers(mode))
    setError(null)
    setStep(2)
  }

  const selectCity = (group: CityAirportGroup | null) => {
    if (!group) {
      setArrivalCityKey('')
      setArrivalCodes([])
      setCityQuery('')
      return
    }
    setArrivalCityKey(group.key)
    setArrivalCodes(group.airports.map((a) => a.code))
    setCityQuery(group.city)
    if (!name.trim() || name.startsWith('Weekend ')) {
      setName(`Weekend ${group.city}`)
    }
  }

  const onPreset = (p: DatePreset) => {
    setPreset(p)
    if (p === 'flexible') {
      setShowFlexible(true)
      return
    }
    const d = generateDatesFromPreset(p)
    setDatesDepart(
      d.dates_depart.map((x) => ({ ...x, heure_min: '00:00', heure_max: '23:59' })),
    )
    setDatesRetour(
      d.dates_retour.map((x) => ({ ...x, heure_min: '00:00', heure_max: '23:59' })),
    )
  }

  const submit = async () => {
    if (!partyMode) {
      setStep(1)
      setError('Choisis Solo, Duo ou À plusieurs')
      return
    }
    const depEncoded = encodeAirportCodes(parseAirportCodes(departure))
    if (!depEncoded) {
      setError('Choisis une ville / aéroport de départ')
      return
    }
    if (!datesDepart.length || !datesRetour.length) {
      setError('Choisis des dates aller et retour')
      return
    }
    const tripName =
      name.trim() ||
      (selectedCity
        ? `Weekend ${selectedCity.city}`
        : `Weekend depuis ${cityDisplayNameFr(parseAirportCodes(departure)[0] || '') || depEncoded}`)
    setSaving(true)
    setError(null)
    try {
      const trip = await getApiClient().createPlannedTrip({
        name: tripName,
        departure_airport: depEncoded,
        arrival_airport: encodeArrivalCodes(arrivalCodes),
        passengers,
        dates_depart: datesDepart,
        dates_retour: datesRetour,
        budget_max: budget,
        direct: directOnly,
      })
      onCreated(trip.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-dialog-root items-center">
      <button type="button" aria-label="Fermer" className="app-dialog-backdrop" onClick={onClose} />
      <div
        className={`app-dialog-panel w-full overflow-hidden flex flex-col ${
          step === 1
            ? 'sm:max-w-lg max-h-[90vh]'
            : 'app-dialog-xl max-h-[92vh]'
        }`}
      >
        <div
          className={`sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-white/95 backdrop-blur ${
            step === 1 ? 'px-5 sm:px-6 py-4' : 'px-6 sm:px-8 py-4 sm:py-5'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              if (step === 2) {
                setStep(1)
                setError(null)
                return
              }
              onClose()
            }}
            className="text-sm font-bold text-muted hover:text-ink min-w-[64px] text-left"
          >
            {step === 2 ? 'Retour' : 'Annuler'}
          </button>
          <div className="text-center min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-700">
              Étape {step}/2
            </p>
            <h3
              className={`font-extrabold text-ink tracking-tight ${
                step === 1 ? 'text-lg sm:text-xl' : 'text-xl'
              }`}
            >
              {step === 1
                ? 'Nouveau voyage'
                : partyMode
                  ? `Nouveau voyage · ${partyModeKickerFr(partyMode)}`
                  : 'Nouveau voyage'}
            </h3>
          </div>
          <span className="min-w-[64px]" />
        </div>

        <div
          className={
            step === 1
              ? 'px-5 sm:px-6 pt-5 pb-6 space-y-5 overflow-y-auto'
              : 'flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-6'
          }
        >
          {step === 1 ? (
            <div className="space-y-5">
              <div>
                <label className="text-sm font-bold text-ink block mb-1.5">
                  Nom du voyage
                </label>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (error) setError(null)
                  }}
                  placeholder="Weekend Lisbonne"
                  autoFocus
                  className="w-full border border-line rounded-2xl px-4 py-3.5 font-medium text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
                />
              </div>

              <div>
                <p className="text-sm font-bold text-ink mb-1">
                  Avec qui tu voyages ?
                </p>
                <p className="text-[13px] text-ink-soft leading-snug mb-3">
                  Solo, duo ou groupe — ça fixe les places.
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  {PARTY_MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.mode}
                      type="button"
                      onClick={() => selectParty(opt.mode)}
                      className="rounded-2xl border border-line bg-canvas px-2.5 py-3.5 text-center hover:border-primary-400 hover:bg-primary-50/50 transition-colors"
                    >
                      <p aria-hidden className="text-2xl leading-none mb-1.5">
                        {opt.emoji}
                      </p>
                      <p className="font-extrabold text-ink text-sm tracking-tight leading-none">
                        {opt.label}
                      </p>
                      <p className="mt-1.5 text-[11px] font-semibold text-ink-soft leading-tight line-clamp-2">
                        {opt.hint}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                <div className="space-y-5">
                  <div className="rounded-2xl border border-line bg-slate-50/80 px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
                      Nom du voyage
                    </p>
                    <p className="mt-0.5 font-extrabold text-ink text-[15px] truncate">
                      {name.trim() || '—'}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-ink block mb-1.5">Départ</label>
                    <CityAirportSelect value={departure} onChange={setDeparture} />
                  </div>

                  <div>
                    <label className="text-sm font-bold text-ink block mb-1.5">
                      Arrivée (optionnel)
                    </label>
                    <input
                      value={cityQuery}
                      onChange={(e) => {
                        setCityQuery(e.target.value)
                        if (arrivalCityKey) {
                          setArrivalCityKey('')
                          setArrivalCodes([])
                        }
                      }}
                      placeholder={
                        parseAirportCodes(departure).length
                          ? 'Ville ou aéroport…'
                          : 'Choisis d’abord un départ'
                      }
                      disabled={!parseAirportCodes(departure).length}
                      className="w-full border border-line rounded-2xl px-4 py-3 font-medium text-[15px] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
                    />
                    {selectedCity ? (
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-primary-50 border border-primary-100 px-3 py-2">
                        <p className="text-sm font-bold text-ink">
                          {selectedCity.city}
                          <span className="text-muted font-medium">
                            {' '}
                            · {arrivalCodes.join(' · ')}
                          </span>
                        </p>
                        <button
                          type="button"
                          className="text-xs font-bold text-primary-700"
                          onClick={() => selectCity(null)}
                        >
                          Effacer
                        </button>
                      </div>
                    ) : cityQuery.trim() && filteredCities.length > 0 ? (
                      <ul className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-line bg-white shadow-soft divide-y divide-line">
                        {filteredCities.map((g) => (
                          <li key={g.key}>
                            <button
                              type="button"
                              onClick={() => selectCity(g)}
                              className="w-full text-left px-3.5 py-2.5 hover:bg-primary-50"
                            >
                              <span className="font-bold text-ink text-sm">{g.city}</span>
                              <span className="text-muted text-xs ml-2">{g.country}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="text-xs text-muted mt-1.5">
                      Laisse vide pour t’inspirer (scan inspire).
                    </p>
                  </div>
                </div>

                <div className="space-y-5">
                  {partyMode === 'groupe' ? (
                    <PassengerStepper
                      value={passengers}
                      onChange={setPassengers}
                      min={partyModeMinPassengers('groupe')}
                      max={partyModeMaxPassengers('groupe')}
                      label="Taille du groupe"
                    />
                  ) : (
                    <div className="rounded-2xl border border-line bg-slate-50/80 px-4 py-3">
                      <p className="text-sm font-bold text-ink">
                        {partyMode ? partyModeKickerFr(partyMode) : 'Voyageurs'}
                      </p>
                      <p className="text-sm text-muted mt-0.5">
                        {partyMode
                          ? partyModeCreateHintFr(partyMode)
                          : `${passengers} place(s)`}
                      </p>
                    </div>
                  )}

                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={directOnly}
                      onChange={(e) => setDirectOnly(e.target.checked)}
                      className="w-5 h-5 rounded border-orange-300 text-[#FF6B35] focus:ring-orange-200"
                    />
                    <span className="text-sm font-semibold text-ink">
                      Vols directs uniquement
                    </span>
                  </label>

                  <BudgetSlider value={budget} onChange={setBudget} />

                  <div>
                    <p className="text-sm font-bold text-ink mb-2">Dates</p>
                    <div className="flex flex-wrap gap-2">
                      {PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onPreset(p.id)}
                          className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-colors ${
                            preset === p.id
                              ? 'bg-ink text-white border-ink'
                              : 'bg-white text-ink-soft border-line hover:bg-primary-50'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    {datesDepart[0] && datesRetour[0] ? (
                      <p className="text-sm font-semibold text-muted mt-2">
                        {formatTripDateRangeFr(
                          datesDepart[0].date,
                          datesRetour[datesRetour.length - 1].date,
                        )}
                      </p>
                    ) : (
                      <p className="text-sm text-muted mt-2">Choisis tes dates libres</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-1 border-t border-line">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void submit()}
                  className="app-btn-primary rounded-2xl py-3.5 px-10 disabled:opacity-60 min-w-[200px] mt-4"
                >
                  {saving ? '…' : 'Créer'}
                </button>
              </div>
            </>
          )}

          {error ? (
            <p className="text-sm font-semibold text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {showFlexible ? (
          <div className="app-dialog-root z-[60]">
            <button
              type="button"
              aria-label="Fermer"
              className="app-dialog-backdrop"
              onClick={() => setShowFlexible(false)}
            />
            <div className="app-dialog-panel app-dialog-xl p-5 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-extrabold text-lg text-ink">Dates libres</h4>
                <button
                  type="button"
                  onClick={() => setShowFlexible(false)}
                  className="font-bold text-primary-600 px-3 py-1.5 rounded-xl hover:bg-primary-50"
                >
                  OK
                </button>
              </div>
              <FlexibleDatesSelector
                flexibleDates={{ dates_depart: datesDepart, dates_retour: datesRetour }}
                onFlexibleDatesChange={(d) => {
                  setDatesDepart(d.dates_depart)
                  setDatesRetour(d.dates_retour)
                  setPreset('flexible')
                }}
                formatDateFr={formatDateFr}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
