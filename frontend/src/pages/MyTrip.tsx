import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { MyTripDraft } from '@flightwatcher/shared'
import {
  airportDisplayNameFr,
  boardLabelFr,
  buildRyanairBookingUrl,
  computeTripPartyPrice,
  formatAirlineLabel,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { MyTripHotelCompose } from '../components/MyTripHotelCompose'

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatTimeLocal(iso?: string | null): string {
  if (!iso) return ''
  const m = String(iso).match(/(\d{2}):(\d{2})/)
  if (m) return `${m[1]}:${m[2]}`
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function companyCtaLabel(airlineName: string, bookingUrl: string): string {
  const u = bookingUrl.toLowerCase()
  if (u.includes('ryanair.com') || /ryanair/i.test(airlineName)) {
    return 'Réserver sur ryanair.com'
  }
  if (u.includes('transavia') || /transavia/i.test(airlineName)) {
    return 'Réserver sur transavia.com'
  }
  if (airlineName) return `Réserver sur ${airlineName}`
  return 'Réserver mon vol'
}

/**
 * Lot A — conversion-first Mon voyage:
 * suppressions + party price display (no email / suivi / hotel lock / lien indisponible).
 */
export default function MyTrip() {
  const { token } = useParams<{ token: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [draft, setDraft] = useState<MyTripDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(
    () => searchParams.get('compose') === '1',
  )
  const [showPriceAsk, setShowPriceAsk] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [checkId, setCheckId] = useState<string | null>(null)
  const [flightClicked, setFlightClicked] = useState(false)
  const [markingBooked, setMarkingBooked] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const row = await getApiClient().getMyTrip(token)
      setDraft(row)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voyage introuvable')
      setDraft(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const payload = (draft?.payload || {}) as Record<string, any>
  const flight = payload.flight || {}
  const hotel = payload.hotel || draft?.hotel
  const hotelObj = hotel && typeof hotel === 'object' ? (hotel as Record<string, any>) : null
  const city = draft?.city_name || payload.city || '—'
  const adults = Math.max(1, Number(draft?.adults || payload.adults || 2))
  const outDate = draft?.out_date || payload.dates?.outbound
  const retDate = draft?.ret_date || payload.dates?.inbound
  const bd = payload.price_breakdown || {}

  const party = useMemo(() => {
    if (bd.total_eur != null && bd.flight_total_eur != null) {
      return {
        adults: Number(bd.adults) || adults,
        nights: Number(payload.nights) || 0,
        flightPp: Number(bd.flight_pp_eur) || 0,
        flightTotal: Number(bd.flight_total_eur) || 0,
        hotelTotal: Number(bd.hotel_total_eur) || 0,
        total: Number(bd.total_eur) || 0,
        perPerson: Number(bd.per_person_eur) || 0,
        cityTax:
          bd.city_tax_eur != null && Number(bd.city_tax_eur) > 0
            ? Number(bd.city_tax_eur)
            : null,
      }
    }
    const flightPp =
      flight.price_pp != null
        ? Number(flight.price_pp)
        : bd.flight_pp != null
          ? Number(bd.flight_pp)
          : null
    const hotelTotal =
      hotelObj?.public_hotel_price != null
        ? Number(hotelObj.public_hotel_price)
        : bd.hotel_public_total != null
          ? Number(bd.hotel_public_total)
          : null
    return computeTripPartyPrice({
      adults,
      flightPp,
      hotelTotal,
      cityTax: payload.excluded_fees ?? hotelObj?.excluded_fees ?? null,
      outDate,
      retDate,
      nights: payload.nights,
    })
  }, [adults, bd, flight.price_pp, hotelObj, outDate, payload, retDate])

  const nights = party.nights || Number(payload.nights) || 0

  const originIata = String(
    flight.origin_iata || payload.origin_iata || draft?.origin_iata || '',
  ).toUpperCase()
  const destIata = String(
    flight.destination_iata || payload.destination || payload.dest_iata || '',
  ).toUpperCase()

  const originName = airportDisplayNameFr(originIata, null)
  const arrivalName = airportDisplayNameFr(destIata, city)
  const originLabel =
    payload.origin_airport_label ||
    (originName && originName.toUpperCase() !== originIata ? originName : null) ||
    'Départ'
  const arrivalLabel =
    payload.arrival_airport_label ||
    (arrivalName && arrivalName.toUpperCase() !== destIata ? arrivalName : null) ||
    city

  const airlineName =
    formatAirlineLabel({
      airline: flight.airline || flight.carrier || payload.airline,
      provider: flight.provider || payload.provider,
    }) || ''
  const outTime = formatTimeLocal(flight.outbound_local)
  const retTime = formatTimeLocal(flight.inbound_local)

  /** Always a company CTA — never « lien indisponible ». */
  const flightUrl = useMemo(() => {
    const raw = String(flight.booking_url || payload.booking_url || '').trim()
    if (raw.startsWith('http') && !/aviasales|travelpayouts/i.test(raw)) {
      return raw
    }
    // Prefer airline deep-link when we have route + dates
    if (originIata && destIata && outDate && retDate) {
      try {
        return buildRyanairBookingUrl(
          {
            aller: {
              origin: originIata,
              destination: destIata,
              departureTime: String(flight.outbound_local || outDate),
            },
            retour: {
              departureTime: String(flight.inbound_local || retDate),
            },
          },
          adults,
        )
      } catch {
        /* fall through */
      }
    }
    if (raw.startsWith('http')) return raw
    if (/ryanair|FR|RK/i.test(String(flight.airline || flight.carrier || airlineName))) {
      return 'https://www.ryanair.com/fr/fr'
    }
    if (/transavia|TO|HV/i.test(String(flight.airline || flight.carrier || airlineName))) {
      return 'https://www.transavia.com/fr-FR/'
    }
    return 'https://www.ryanair.com/fr/fr'
  }, [
    adults,
    airlineName,
    destIata,
    flight,
    originIata,
    outDate,
    payload.booking_url,
    retDate,
  ])

  const compareUrl = useMemo(() => {
    const raw = String(flight.booking_url || payload.booking_url || '').trim()
    if (raw.startsWith('http') && /aviasales|travelpayouts/i.test(raw)) return raw
    return null
  }, [flight.booking_url, payload.booking_url])

  const cta = companyCtaLabel(airlineName, flightUrl)
  const flightBooked = Boolean(
    draft?.flight_booked_at || payload.flight_booked || payload.flight_booked_at,
  )
  const vlevel =
    flight.verification_level ||
    payload.flags?.verification_level ||
    payload.verification_level ||
    'live'
  const isCached = vlevel === 'cached'
  const hotelPhoto = hotelObj?.photo || hotelObj?.thumbnail || payload.image_url || ''
  const board = boardLabelFr(hotelObj?.board || payload.board)
  const wantsCompose =
    composeOpen || payload.compose_hotel === true || searchParams.get('compose') === '1'

  const hotelHref =
    draft?.deal_key && outDate && retDate
      ? `/deals?deal=${encodeURIComponent(draft.deal_key)}&book_hotel=1&checkin=${encodeURIComponent(String(outDate).slice(0, 10))}&checkout=${encodeURIComponent(String(retDate).slice(0, 10))}`
      : draft?.deal_key
        ? `/deals?deal=${encodeURIComponent(draft.deal_key)}&book_hotel=1`
        : '/deals'

  const closeCompose = () => {
    setComposeOpen(false)
    const next = new URLSearchParams(searchParams)
    next.delete('compose')
    setSearchParams(next, { replace: true })
  }

  const onFlightClick = async () => {
    setFlightClicked(true)
    if (!draft?.deal_key && !payload.deal_key) return
    try {
      const res = await getApiClient().recordFlightClick({
        deal_key: String(draft?.deal_key || payload.deal_key),
        verification_level: vlevel,
        displayed_pp: party.perPerson || party.flightPp,
        source: 'deals',
        draft_token: token,
        partner: flight.provider || null,
        outcome: 'unknown',
      })
      if (res?.check?.id) setCheckId(String(res.check.id))
      if (isCached) setShowPriceAsk(true)
    } catch {
      if (isCached) setShowPriceAsk(true)
    }
  }

  const onFlightBooked = async () => {
    if (!token) return
    setMarkingBooked(true)
    try {
      const row = await getApiClient().markMyTripFlightBooked(token)
      setDraft(row)
      if (isCached) setShowPriceAsk(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d’enregistrer')
    } finally {
      setMarkingBooked(false)
    }
  }

  const sendFeedback = async (feedback: 'same' | 'higher' | 'gone') => {
    try {
      await getApiClient().flightClickFeedback({
        feedback,
        check_id: checkId,
        draft_token: token,
        deal_key: draft?.deal_key || payload.deal_key,
      })
    } catch {
      /* ignore */
    }
    setFeedbackSent(true)
    setShowPriceAsk(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
        Chargement…
      </div>
    )
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-slate-700 font-medium">{error || 'Voyage introuvable ou expiré'}</p>
        <Link to="/deals" className="text-primary-600 font-bold underline">
          ← Deals
        </Link>
      </div>
    )
  }

  const travelersLabel =
    adults === 1 ? '1 voyageur' : `${adults} voyageurs`

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <div className="max-w-lg mx-auto lg:max-w-5xl px-4 h-14 flex items-center justify-between gap-3">
          <Link to="/deals" className="text-sm font-bold text-slate-700 hover:text-primary-600">
            ← Deals
          </Link>
          <span className="text-sm font-extrabold text-ink tracking-tight">FlightWatcher</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto lg:max-w-5xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Ton week-end à {city}
          </h1>
          <p className="text-slate-600 mt-1.5">
            {formatDate(outDate)} → {formatDate(retDate)}
            {nights > 0 ? ` · ${nights} nuit${nights > 1 ? 's' : ''}` : ''}
            {` · ${travelersLabel}`}
          </p>

          {/* Prix — Lot A §2 */}
          <div className="mt-4 rounded-2xl border border-primary-100 bg-primary-50/50 px-4 py-3.5">
            {adults === 1 ? (
              <p className="text-3xl font-black text-primary-600 tracking-tight">
                Total {party.total} €
              </p>
            ) : (
              <>
                <p className="text-3xl font-black text-primary-600 tracking-tight">
                  Total {party.total} €{' '}
                  <span className="text-lg font-bold text-slate-600">pour {adults}</span>
                </p>
                <p className="text-sm font-semibold text-slate-700 mt-1">
                  {party.perPerson} € / pers.
                </p>
              </>
            )}
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Vol {party.flightTotal} €
              {adults > 1 ? (
                <span className="text-slate-400">
                  {' '}
                  ({party.flightPp} € × {adults})
                </span>
              ) : null}
              {' · '}
              Hôtel {party.hotelTotal} €
              {nights > 0 ? (
                <span className="text-slate-400">
                  {' '}
                  ({nights} nuit{nights > 1 ? 's' : ''})
                </span>
              ) : null}
            </p>
            {party.cityTax != null ? (
              <p className="text-xs text-slate-500 mt-1.5">
                + taxe de séjour à régler à l’hôtel : {party.cityTax} €
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-1.5">
                Taxe de séjour éventuelle à régler à l’hôtel
              </p>
            )}
            {payload.price_pax_note ? (
              <p className="text-xs text-amber-800 mt-1">{String(payload.price_pax_note)}</p>
            ) : null}
          </div>
        </div>

        {wantsCompose && token && draft ? (
          <MyTripHotelCompose
            draft={draft}
            token={token}
            onUpdated={(row) => setDraft(row)}
            onDone={closeCompose}
          />
        ) : null}

        {/* ① Vol */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-slate-900">① Ton vol</h2>
            {flightBooked ? (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                Réservé ✓
              </span>
            ) : (
              <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded-lg">
                À réserver
              </span>
            )}
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 text-sm text-slate-800 space-y-1.5">
            <p className="font-bold text-slate-900">
              {airlineName || 'Compagnie'}
              {flight.direct === true
                ? ' · vol direct'
                : flight.direct === false
                  ? ' · avec escale'
                  : ''}
            </p>
            <p>
              Aller {formatDate(outDate)}
              {outTime ? ` · ${outTime}` : ''}
            </p>
            <p className="text-slate-600">
              {originLabel} → {arrivalLabel}
            </p>
            <p>
              Retour {formatDate(retDate)}
              {retTime ? ` · ${retTime}` : ''}
            </p>
            {payload.baggage_line ? (
              <p className="text-xs text-slate-600 pt-1 border-t border-slate-200">
                {String(payload.baggage_line)}
              </p>
            ) : null}
            {payload.route_hint ? (
              <p className="text-xs text-slate-500">{String(payload.route_hint)}</p>
            ) : null}
          </div>

          <a
            href={flightUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void onFlightClick()}
            className="block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl min-h-[48px]"
          >
            {cta}
          </a>
          {compareUrl ? (
            <a
              href={compareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs font-semibold text-slate-500 underline-offset-2 hover:underline"
            >
              Comparer sur Aviasales
            </a>
          ) : null}

          {(flightClicked || flightBooked) && !flightBooked ? (
            <button
              type="button"
              onClick={() => void onFlightBooked()}
              disabled={markingBooked}
              className="w-full text-center border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold py-3 rounded-xl disabled:opacity-60 min-h-[44px]"
            >
              {markingBooked ? '…' : 'J’ai réservé mon vol ✓'}
            </button>
          ) : null}

          {showPriceAsk && isCached && !feedbackSent ? (
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-2">
              <p className="text-sm font-medium text-slate-800">Le prix était-il le même ?</p>
              <div className="flex flex-wrap gap-2">
                {(['same', 'higher', 'gone'] as const).map((fb) => (
                  <button
                    key={fb}
                    type="button"
                    onClick={() => void sendFeedback(fb)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold"
                  >
                    {fb === 'same' ? 'Oui' : fb === 'higher' ? 'Plus cher' : 'Plus disponible'}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* ② Hôtel — toujours réservable (plus de verrou vol) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-slate-900">② Ton hôtel</h2>
            <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded-lg">
              À réserver
            </span>
          </div>
          {hotelObj?.name ? (
            <div className="flex gap-3">
              {hotelPhoto ? (
                <img
                  src={String(hotelPhoto)}
                  alt=""
                  className="w-24 h-24 rounded-xl object-cover bg-slate-100 shrink-0"
                />
              ) : (
                <div className="w-24 h-24 rounded-xl bg-slate-100 shrink-0" aria-hidden />
              )}
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-slate-900 font-bold leading-snug">
                  {String(hotelObj.name)}
                </p>
                <p className="text-xs text-slate-600">
                  {hotelObj.stars != null ? `${hotelObj.stars} étoiles` : null}
                  {hotelObj.stars != null && hotelObj.rating != null ? ' · ' : null}
                  {hotelObj.rating != null
                    ? `${Number(hotelObj.rating).toFixed(1).replace('.', ',')}/10`
                    : null}
                  {hotelObj.review_count != null
                    ? ` (${Number(hotelObj.review_count).toLocaleString('fr-FR')} avis)`
                    : null}
                </p>
                {board ? <p className="text-xs text-slate-600">{board}</p> : null}
                <p className="text-sm font-bold text-slate-800">
                  {party.hotelTotal} €
                  {nights > 0 ? ` · ${nights} nuit${nights > 1 ? 's' : ''}` : ''}
                </p>
                {hotelObj.distance_m != null ? (
                  <p className="text-xs text-slate-500">
                    À {Math.round(Number(hotelObj.distance_m) / 100) / 10} km du centre
                  </p>
                ) : null}
                {hotelObj.refundable === false ? (
                  <p className="text-xs font-semibold text-slate-700">Non remboursable</p>
                ) : hotelObj.refundable === true ? (
                  <p className="text-xs font-semibold text-emerald-700">Annulation gratuite</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Aucun hôtel sélectionné pour l’instant.</p>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            {(draft.deal_key || hotelObj) && (
              <Link
                to={hotelHref}
                className="flex-1 text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl min-h-[48px]"
              >
                Réserver l’hôtel
                {party.hotelTotal > 0 ? ` · ${party.hotelTotal} €` : ''}
              </Link>
            )}
            {!wantsCompose ? (
              <button
                type="button"
                onClick={() => {
                  setComposeOpen(true)
                  const next = new URLSearchParams(searchParams)
                  next.set('compose', '1')
                  setSearchParams(next, { replace: true })
                }}
                className="sm:w-auto px-4 text-center border border-line bg-white hover:bg-slate-50 text-ink font-semibold py-3 rounded-xl min-h-[44px]"
              >
                Changer d’hôtel
              </button>
            ) : null}
          </div>
          {hotelObj?.refundable === false && !flightBooked ? (
            <p className="text-xs text-slate-500">
              Conseil : réserve ton vol d’abord, son prix bouge plus vite.
            </p>
          ) : null}
        </section>

        <aside className="rounded-2xl border border-slate-100 bg-white/80 px-4 py-3 text-sm text-slate-600 leading-relaxed">
          <p className="font-bold text-slate-800 mb-1">Comment ça marche</p>
          <p>
            Tu réserves ton vol sur le site de la compagnie, puis ton hôtel ici en 2 minutes.
            Ton hôtel ne dépend pas de ton vol : si la compagnie modifie ton vol, ta réservation
            d’hôtel reste valable selon ses conditions.
          </p>
        </aside>
      </div>
    </div>
  )
}
