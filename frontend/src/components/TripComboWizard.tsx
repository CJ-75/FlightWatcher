import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  buildBookingUrl,
  cityDisplayNameFr,
  dateFromFlightIso,
  type HotelUpsellOption,
} from '@flightwatcher/shared'
import type { EnrichedTripResponse } from '../types'
import { getApiClient } from '../utils/apiClient'

interface Props {
  trip: EnrichedTripResponse
  passengers?: number
  /** Budget saisi à la recherche — alerte si le total vol+hôtel dépasse. */
  searchBudget?: number | null
  onClose: () => void
  onSaveFavorite?: () => void
  onNeedLogin?: () => void
}

type Step = 1 | 2 | 3

const spring = { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.55 }

function formatShort(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function TripComboWizard({
  trip,
  passengers = 1,
  searchBudget = null,
  onClose,
  onSaveFavorite,
}: Props) {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [options, setOptions] = useState<HotelUpsellOption[]>([])
  const [selected, setSelected] = useState<HotelUpsellOption | null>(null)
  const [loadingHotels, setLoadingHotels] = useState(false)
  const [hotelError, setHotelError] = useState<string | null>(null)
  const [nightCap, setNightCap] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftToken, setDraftToken] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [hotelsReady, setHotelsReady] = useState(false)

  const city = cityDisplayNameFr(
    trip.destination_code,
    trip.aller?.destinationFull?.split(',')[0]?.trim(),
  )
  const flightPp = Number(trip.prix_total) || 0
  const pax = Math.min(6, Math.max(1, passengers || 1))
  const checkin = dateFromFlightIso(trip.aller?.departureTime)
  const checkout = dateFromFlightIso(trip.retour?.departureTime)
  const flightUrl = buildBookingUrl(trip, pax)
  const hotelPp = selected?.hotel_pp ?? 0
  const totalPp = Math.round(flightPp + (selected ? hotelPp : 0))

  const applyHotelResult = (
    opts: HotelUpsellOption[],
    night?: number | null,
    reason?: string | null,
  ) => {
    setOptions(opts)
    if (night != null) setNightCap(night)
    if (opts[0]) setSelected(opts[0])
    setHotelsReady(true)
    if (!opts.length) {
      setHotelError(
        reason === 'no_hotel_in_city_tier' || reason === 'no_hotel_in_flight_budget'
          ? 'Aucun hôtel confort pour ces dates — élargis ou continue sans hôtel'
          : 'Aucun hôtel pour cette destination',
      )
    } else {
      setHotelError(null)
    }
  }

  const loadHotels = async () => {
    if (!trip.destination_code || !checkin || !checkout) {
      setHotelError('Dates ou destination manquantes')
      return
    }
    if (hotelsReady && options.length > 0) return
    setLoadingHotels(true)
    setHotelError(null)
    try {
      const item = {
        iata: trip.destination_code,
        checkin,
        checkout,
        participants: pax,
        flight_pp: flightPp,
      }
      // 1) Cache-only lookup (hotel_rates_cache) — often ready
      let result = (
        await getApiClient().lookupHotelUpsell([item])
      ).results?.[0]

      if (result?.status === 'ready' && (result.options?.length || result.hotel)) {
        applyHotelResult(
          result.options || (result.hotel ? [result.hotel] : []),
          result.night_cap ?? result.max_hotel_pp,
          result.reason,
        )
        return
      }

      if (result?.status === 'miss' || result?.status === 'pending') {
        result = await getApiClient().fetchHotelUpsell(item)
      }

      if (result?.status === 'pending' && result.job_id) {
        for (let i = 0; i < 14; i++) {
          await new Promise((r) => setTimeout(r, 1200))
          const job = await getApiClient().getHotelUpsellJob(result.job_id!)
          if (job.done && job.status === 'ready') {
            applyHotelResult(
              job.options || [],
              job.night_cap ?? job.max_hotel_pp,
              null,
            )
            return
          }
          if (job.done) {
            setHotelError('Aucun hôtel disponible pour ces dates')
            setHotelsReady(true)
            return
          }
        }
        setHotelError('Recherche hôtel trop longue — réessaie')
        setHotelsReady(true)
        return
      }

      if (result?.status === 'rate_limited') {
        setHotelError('Trop de demandes — réessaie dans un moment')
        setHotelsReady(true)
        return
      }

      applyHotelResult(
        result?.options || (result?.hotel ? [result.hotel] : []),
        result?.night_cap ?? result?.max_hotel_pp,
        result?.reason,
      )
    } catch {
      setHotelError('Impossible de charger les hôtels')
      setHotelsReady(true)
    } finally {
      setLoadingHotels(false)
    }
  }

  // Prefetch during step 1 (user reads flight recap)
  useEffect(() => {
    void loadHotels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goHotels = () => {
    setStep(2)
    if (!hotelsReady) void loadHotels()
  }
  const skipHotel = () => {
    setSelected(null)
    void finalize(null)
  }

  const finalize = async (hotel: HotelUpsellOption | null) => {
    setCreating(true)
    setCreateError(null)
    try {
      const draft = await getApiClient().createMyTrip({
        origin_iata: trip.aller?.origin,
        departure_airport: trip.aller?.origin,
        destination: trip.destination_code,
        city,
        dates: {
          outbound: checkin,
          inbound: checkout,
        },
        adults: pax,
        flight: {
          price_pp: flightPp,
          provider: trip.provider,
          airline: trip.airline,
          booking_url: flightUrl,
          direct: (trip.transfers ?? 0) === 0,
          origin_iata: trip.aller?.origin,
          destination_iata: trip.destination_code,
        },
        hotel: hotel
          ? {
              id: hotel.id || hotel.hotel_id,
              hotel_id: hotel.hotel_id || hotel.id,
              name: hotel.name,
              stars: hotel.stars,
              rating: hotel.rating,
              photo: hotel.photo || hotel.thumbnail,
              board: hotel.board,
              public_hotel_price: hotel.public_hotel_price,
              hotel_pp: hotel.hotel_pp,
            }
          : undefined,
        price_per_person: Math.round(flightPp + (hotel?.hotel_pp || 0)),
        booking_url: flightUrl,
      })
      setDraftToken(draft.draft_token)
      setStep(3)
    } catch {
      setCreateError('Impossible de créer le voyage — réessaie')
    } finally {
      setCreating(false)
    }
  }

  const confirmHotel = () => void finalize(selected)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-ink/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={spring}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl border border-line shadow-lift w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Composer ton voyage"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">
            Étape {step} / 3
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="px-5 pb-2 flex gap-1.5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                s <= step ? 'bg-primary-500' : 'bg-line'
              }`}
            />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="s1"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-2xl font-black text-ink tracking-tight mt-1">
                  {city}
                </h2>
                <p className="text-muted text-sm mt-1">
                  {formatShort(trip.aller?.departureTime)} →{' '}
                  {formatShort(trip.retour?.departureTime)}
                  {pax > 1 ? ` · ${pax} voyageurs` : ''}
                </p>
                <p className="text-4xl font-extrabold text-primary-500 mt-5 tracking-tight">
                  {Math.round(flightPp)} €
                  <span className="text-base font-semibold text-muted ml-2">
                    / pers. vol A/R
                  </span>
                </p>
                <p className="text-sm text-muted mt-3 leading-relaxed">
                  Ajoute un hôtel bien noté dans la gamme confort de la ville, ou continue
                  avec le vol seul.
                </p>
                {loadingHotels ? (
                  <p className="text-xs text-muted mt-2">Préparation des hôtels…</p>
                ) : hotelsReady && options.length > 0 ? (
                  <p className="text-xs text-emerald-700 mt-2 font-semibold">
                    {options.length} hôtel{options.length > 1 ? 's' : ''} prêt
                    {options.length > 1 ? 's' : ''}
                  </p>
                ) : null}
                <div className="mt-8 space-y-3">
                  <button
                    type="button"
                    onClick={goHotels}
                    className="w-full rounded-2xl bg-primary-500 text-white font-bold py-3.5 hover:bg-primary-600 transition-colors"
                  >
                    Ajouter un hôtel
                  </button>
                  <button
                    type="button"
                    onClick={skipHotel}
                    disabled={creating}
                    className="w-full rounded-2xl bg-slate-100 text-slate-700 font-semibold py-3 hover:bg-slate-200 transition-colors"
                  >
                    Continuer sans hôtel
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="s2"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-xl font-black text-ink tracking-tight mt-1">
                  {city ? `Hôtels à ${city}` : 'Choisis ton hôtel'}
                </h2>
                <p className="text-sm text-muted mt-1">
                  Meilleur rapport note/prix
                  {nightCap != null
                    ? ` · confort ≤ ~${Math.round(nightCap)} €/nuit`
                    : ' · gamme confort de la ville'}
                </p>

                {loadingHotels && (
                  <div className="mt-4 space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-24 rounded-2xl bg-gradient-to-r from-primary-100 via-primary-50 to-primary-100 bg-[length:200%_100%] animate-[shimmer_2s_infinite]"
                      />
                    ))}
                    <p className="text-xs text-muted text-center">Recherche LiteAPI…</p>
                  </div>
                )}

                {!loadingHotels && hotelError && (
                  <div className="mt-6 rounded-2xl bg-amber-50 border border-amber-100 p-4 text-center">
                    <p className="font-semibold text-ink text-sm">{hotelError}</p>
                    <button
                      type="button"
                      onClick={() => void loadHotels()}
                      className="mt-3 text-sm font-bold text-primary-600"
                    >
                      Réessayer
                    </button>
                    <button
                      type="button"
                      onClick={skipHotel}
                      className="mt-2 block w-full text-sm font-medium text-muted"
                    >
                      Continuer sans hôtel
                    </button>
                  </div>
                )}

                {!loadingHotels && !hotelError && (
                  <ul className="mt-4 space-y-3">
                    {options.map((h, idx) => {
                      const id = String(h.id || h.hotel_id || idx)
                      const active =
                        (selected?.id || selected?.hotel_id) === (h.id || h.hotel_id)
                      return (
                        <motion.li
                          key={id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelected(h)}
                            className={`w-full flex gap-3 text-left rounded-2xl border-2 p-2.5 transition-all ${
                              active
                                ? 'border-primary-500 bg-primary-50 shadow-soft'
                                : 'border-line hover:border-primary-200'
                            }`}
                          >
                            <div className="w-20 h-20 rounded-xl overflow-hidden bg-line shrink-0">
                              {h.photo || h.thumbnail ? (
                                <img
                                  src={h.photo || h.thumbnail}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1 py-0.5">
                              <p className="font-bold text-ink truncate">{h.name}</p>
                              <p className="text-xs text-muted mt-0.5">
                                {h.rating != null ? `Note ${Number(h.rating).toFixed(1)}` : ''}
                                {h.rating != null && h.stars ? ' · ' : ''}
                                {h.stars ? `${h.stars} étoiles` : ''}
                              </p>
                              <p className="text-sm font-extrabold text-primary-600 mt-1">
                                {Math.round(h.hotel_pp || 0)} € / pers.
                              </p>
                              {searchBudget != null &&
                              flightPp + Number(h.hotel_pp || 0) > Number(searchBudget) ? (
                                <p className="text-[11px] font-semibold text-amber-700 mt-0.5">
                                  Au-dessus de ton budget ({Math.round(Number(searchBudget))} €)
                                </p>
                              ) : null}
                            </div>
                          </button>
                        </motion.li>
                      )
                    })}
                  </ul>
                )}

                {!loadingHotels && options.length > 0 && (
                  <div className="mt-5 space-y-2 sticky bottom-0 bg-white pt-2">
                    <button
                      type="button"
                      disabled={!selected || creating}
                      onClick={confirmHotel}
                      className="w-full rounded-2xl bg-primary-500 text-white font-bold py-3.5 disabled:opacity-50"
                    >
                      {creating ? 'Création…' : 'Continuer avec cet hôtel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="w-full text-sm font-medium text-muted py-2"
                    >
                      Retour
                    </button>
                  </div>
                )}
                {createError && (
                  <p className="text-sm text-red-600 mt-2 text-center">{createError}</p>
                )}
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="s3"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-xl font-black text-ink tracking-tight mt-1">
                  Voyage enregistré
                </h2>
                <p className="text-sm text-muted mt-1">
                  {city} · {Math.round(totalPp)} € / pers.
                  {selected ? ' (vol + hôtel)' : ' (vol)'}
                </p>

                {selected?.photo && (
                  <div className="mt-4 h-36 rounded-2xl overflow-hidden">
                    <img
                      src={selected.photo}
                      alt={selected.name || ''}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="mt-5 space-y-3">
                  <a
                    href={flightUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center rounded-2xl bg-primary-500 text-white font-bold py-3.5 hover:bg-primary-600"
                  >
                    Réserver le vol
                  </a>
                  {selected && (
                    <button
                      type="button"
                      onClick={() => {
                        if (draftToken) {
                          onClose()
                          navigate(`/trip/${draftToken}?book_hotel=1`)
                        }
                      }}
                      className="block w-full text-center rounded-2xl border-2 border-primary-500 text-primary-600 font-bold py-3.5"
                    >
                      Réserver l’hôtel
                      {selected.name ? ` · ${selected.name}` : ''}
                    </button>
                  )}
                  {draftToken && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose()
                        navigate(`/trip/${draftToken}`)
                      }}
                      className="block w-full text-center rounded-2xl bg-slate-100 text-slate-800 font-semibold py-3"
                    >
                      Ouvrir Mon voyage
                    </button>
                  )}
                  {onSaveFavorite && (
                    <button
                      type="button"
                      onClick={onSaveFavorite}
                      className="block w-full text-sm font-medium text-muted py-2"
                    >
                      Sauvegarder en favori
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
