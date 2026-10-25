import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { MyTripDraft } from '@flightwatcher/shared'
import {
  airportDisplayNameFr,
  boardLabelFr,
  computeTripPartyPrice,
  distantAirportLine,
  resolveCarrierBooking,
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

async function shareTrip(city: string, url: string) {
  const title = `Week-end à ${city}`
  const text = `Mon week-end à ${city} sur FlightWatcher`
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared' as const
    } catch {
      /* cancelled */
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied' as const
  } catch {
    return 'failed' as const
  }
}

/**
 * Lot A–C — conversion-first Mon voyage:
 * party price, 2-col layout, carrier booking + tab return (§4).
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
  const [markingBooked, setMarkingBooked] = useState(false)
  const [shareHint, setShareHint] = useState<string | null>(null)
  const [askFlightBooked, setAskFlightBooked] = useState(false)
  const [copyDone, setCopyDone] = useState(false)
  const leftForFlight = useRef(false)
  const leftForFlightAt = useRef(0)
  const hotelSectionRef = useRef<HTMLElement | null>(null)

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

  const outDep =
    flight.outbound_local || flight.out_dep_local || payload.out_dep_local
  const retDep =
    flight.inbound_local || flight.ret_dep_local || payload.ret_dep_local
  const outTime = formatTimeLocal(outDep)
  const retTime = formatTimeLocal(retDep)
  const outArrTime = formatTimeLocal(
    flight.outbound_arrival_local ||
      flight.out_arr_local ||
      flight.outbound_arr_local ||
      payload.out_arr_local,
  )
  const retArrTime = formatTimeLocal(
    flight.inbound_arrival_local ||
      flight.ret_arr_local ||
      flight.in_arr_local ||
      payload.ret_arr_local,
  )

  const carrier = useMemo(
    () =>
      resolveCarrierBooking({
        airline: flight.airline || flight.carrier || payload.airline,
        carrier: flight.carrier,
        provider: flight.provider || payload.provider,
        bookingUrl: flight.booking_url || payload.booking_url,
        originIata,
        destIata,
        outDate,
        retDate,
        outLocal: outDep,
        inLocal: retDep,
        adults,
        originLabel,
        arrivalLabel,
      }),
    [
      adults,
      arrivalLabel,
      destIata,
      flight,
      originIata,
      originLabel,
      outDate,
      outDep,
      payload.airline,
      payload.booking_url,
      payload.provider,
      retDate,
      retDep,
    ],
  )

  const flightUrl = carrier.url
  const compareUrl = carrier.compareUrl
  const cta = carrier.ctaLabel
  const airlineName = carrier.airlineName
  const distanceLine =
    distantAirportLine(destIata, city) ||
    (typeof payload.route_hint === 'string' && /km/i.test(payload.route_hint)
      ? String(payload.route_hint)
      : null)
  const stopsLabel =
    flight.direct === true
      ? 'vol direct'
      : flight.transfers === 1 || flight.stops === 1
        ? '1 escale'
        : flight.direct === false ||
            (flight.transfers != null && Number(flight.transfers) > 0)
          ? `${Number(flight.transfers || flight.stops || 1)} escale${Number(flight.transfers || flight.stops || 1) > 1 ? 's' : ''}`
          : null
  const flightBooked = Boolean(
    draft?.flight_booked_at || payload.flight_booked || payload.flight_booked_at,
  )
  const hotelBooked = Boolean(payload.hotel_booked || payload.hotel_booked_at)
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

  const backHref = searchParams.get('from') === 'recherche' ? '/recherche' : '/deals'
  const backLabel =
    searchParams.get('from') === 'recherche' ? '← Recherche' : '← Deals'

  const closeCompose = () => {
    setComposeOpen(false)
    const next = new URLSearchParams(searchParams)
    next.delete('compose')
    setSearchParams(next, { replace: true })
  }

  const onFlightClick = async () => {
    leftForFlight.current = true
    leftForFlightAt.current = Date.now()
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
    } catch {
      /* click still opens company tab */
    }
  }

  const scrollToHotel = () => {
    window.setTimeout(() => {
      hotelSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  const onFlightBooked = async () => {
    if (!token) return
    setMarkingBooked(true)
    setAskFlightBooked(false)
    leftForFlight.current = false
    try {
      const row = await getApiClient().markMyTripFlightBooked(token)
      setDraft(row)
      scrollToHotel()
      if (isCached) setShowPriceAsk(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d’enregistrer')
    } finally {
      setMarkingBooked(false)
    }
  }

  const onFlightNotYet = () => {
    setAskFlightBooked(false)
    leftForFlight.current = false
  }

  useEffect(() => {
    if (flightBooked) {
      setAskFlightBooked(false)
      return
    }
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return
      if (!leftForFlight.current) return
      // Ignore instant focus blips right after click
      if (Date.now() - leftForFlightAt.current < 1200) return
      setAskFlightBooked(true)
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [flightBooked])

  const copyRouteHint = async () => {
    if (!carrier.copyHint) return
    try {
      await navigator.clipboard.writeText(carrier.copyHint.replace(/^À saisir :\s*/i, ''))
      setCopyDone(true)
      window.setTimeout(() => setCopyDone(false), 2000)
    } catch {
      /* ignore */
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

  const onShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const result = await shareTrip(String(city), url)
    if (result === 'copied') {
      setShareHint('Lien copié')
      window.setTimeout(() => setShareHint(null), 2000)
    }
  }

  /** Unique next action for sticky / bottom bar (§5). */
  const nextAction = useMemo(() => {
    if (flightBooked && hotelBooked) {
      return {
        kind: 'done' as const,
        label: 'Voir ma réservation',
        href: hotelHref,
      }
    }
    if (flightBooked) {
      return {
        kind: 'hotel' as const,
        label:
          party.hotelTotal > 0
            ? `Réserver mon hôtel · ${party.hotelTotal} €`
            : 'Réserver mon hôtel',
        href: hotelHref,
      }
    }
    return {
      kind: 'flight' as const,
      label: 'Réserver mon vol',
      href: flightUrl,
    }
  }, [flightBooked, flightUrl, hotelBooked, hotelHref, party.hotelTotal])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-[1080px] mx-auto px-4 py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <div className="space-y-4">
            <div className="h-9 w-2/3 max-w-sm rounded-lg bg-slate-200 animate-pulse" />
            <div className="h-5 w-1/2 max-w-xs rounded bg-slate-200 animate-pulse" />
            <div className="h-48 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-48 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
          <div className="hidden lg:block">
            <div className="h-64 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
        </div>
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

  const travelersLabel = adults === 1 ? '1 voyageur' : `${adults} voyageurs`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Mon week-end à ${city} : ${typeof window !== 'undefined' ? window.location.href : ''}`,
  )}`

  const priceBreakdown = (
    <>
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
      <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
        <div className="flex justify-between gap-3">
          <dt>
            Vol
            {adults > 1 ? (
              <span className="text-slate-400">
                {' '}
                ({party.flightPp} € × {adults})
              </span>
            ) : null}
          </dt>
          <dd className="font-semibold tabular-nums">{party.flightTotal} €</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>
            Hôtel
            {nights > 0 ? (
              <span className="text-slate-400">
                {' '}
                ({nights} nuit{nights > 1 ? 's' : ''})
              </span>
            ) : null}
          </dt>
          <dd className="font-semibold tabular-nums">{party.hotelTotal} €</dd>
        </div>
      </dl>
      {party.cityTax != null ? (
        <p className="text-xs text-slate-500 mt-2">
          + taxe de séjour à régler à l’hôtel : {party.cityTax} €
        </p>
      ) : (
        <p className="text-xs text-slate-500 mt-2">
          Taxe de séjour éventuelle à régler à l’hôtel
        </p>
      )}
      {payload.price_pax_note ? (
        <p className="text-xs text-amber-800 mt-1">{String(payload.price_pax_note)}</p>
      ) : null}
    </>
  )

  const nextActionButton = (opts: { className?: string; compact?: boolean }) => {
    const cls =
      opts.className ||
      'block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl min-h-[48px]'
    if (nextAction.kind === 'flight') {
      return (
        <a
          href={nextAction.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => void onFlightClick()}
          className={cls}
        >
          {opts.compact ? 'Réserver mon vol' : nextAction.label}
        </a>
      )
    }
    return (
      <Link to={nextAction.href} className={cls}>
        {nextAction.label}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white pb-28 lg:pb-10">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <div className="max-w-[1080px] mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link
            to={backHref}
            className="text-sm font-bold text-slate-700 hover:text-primary-600 shrink-0"
          >
            {backLabel}
          </Link>
          <span className="text-sm font-extrabold text-ink tracking-tight">FlightWatcher</span>
          <div className="flex items-center gap-1 shrink-0">
            {shareHint ? (
              <span className="text-xs font-semibold text-emerald-700 mr-1">{shareHint}</span>
            ) : null}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Partager sur WhatsApp"
              title="WhatsApp"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </a>
            <button
              type="button"
              onClick={() => void onShare()}
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Partager"
              title="Partager"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1080px] mx-auto px-4 py-8">
        <div className="mb-6 lg:mb-8">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Ton week-end à {city}
          </h1>
          <p className="text-slate-600 mt-1.5">
            {formatDate(outDate)} → {formatDate(retDate)}
            {nights > 0 ? ` · ${nights} nuit${nights > 1 ? 's' : ''}` : ''}
            {` · ${travelersLabel}`}
          </p>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 lg:items-start">
          {/* Colonne gauche */}
          <div className="space-y-6 min-w-0">
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

              {flightBooked ? (
                <p className="text-sm text-slate-700">
                  <span className="font-bold text-slate-900">
                    {airlineName || 'Compagnie'}
                  </span>
                  {' · '}
                  {formatDate(outDate)} → {formatDate(retDate)}
                  {stopsLabel ? ` · ${stopsLabel}` : ''}
                </p>
              ) : (
                <>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 text-sm text-slate-800 space-y-1.5">
                    <p className="font-bold text-slate-900">
                      {airlineName || 'Compagnie'}
                      {stopsLabel ? ` · ${stopsLabel}` : ''}
                    </p>
                    <p>
                      Aller {formatDate(outDate)}
                      {outTime ? ` · ${outTime}` : ''}
                      {outArrTime ? ` → ${outArrTime}` : ''}
                    </p>
                    <p className="text-slate-600">
                      {originLabel} → {arrivalLabel}
                    </p>
                    <p>
                      Retour {formatDate(retDate)}
                      {retTime ? ` · ${retTime}` : ''}
                      {retArrTime ? ` → ${retArrTime}` : ''}
                    </p>
                    {payload.baggage_line ? (
                      <p className="text-xs text-slate-600 pt-1 border-t border-slate-200">
                        {String(payload.baggage_line)}
                      </p>
                    ) : null}
                    {distanceLine ? (
                      <p className="text-xs text-slate-500">{distanceLine}</p>
                    ) : null}
                  </div>

                  <a
                    href={flightUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => void onFlightClick()}
                    className="block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl min-h-[48px] lg:bg-white lg:text-primary-700 lg:border lg:border-primary-200 lg:hover:bg-primary-50"
                  >
                    {cta}
                  </a>

                  {carrier.copyHint && carrier.kind !== 'deeplink' ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                      <p className="text-xs text-slate-600 flex-1 leading-relaxed">
                        {carrier.copyHint}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copyRouteHint()}
                        className="shrink-0 text-xs font-bold text-primary-700 border border-primary-200 bg-white hover:bg-primary-50 px-3 py-2 rounded-lg min-h-[44px]"
                      >
                        {copyDone ? 'Copié ✓' : 'Copier'}
                      </button>
                    </div>
                  ) : null}

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

                  {askFlightBooked ? (
                    <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 p-3 space-y-2">
                      <p className="text-sm font-semibold text-slate-800">
                        Ton vol est réservé ?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void onFlightBooked()}
                          disabled={markingBooked}
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold min-h-[44px] disabled:opacity-60"
                        >
                          {markingBooked ? '…' : 'Oui'}
                        </button>
                        <button
                          type="button"
                          onClick={onFlightNotYet}
                          className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 min-h-[44px]"
                        >
                          Pas encore
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              {showPriceAsk && isCached && !feedbackSent && flightBooked ? (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-2">
                  <p className="text-sm font-medium text-slate-800">
                    Le prix était-il le même ?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['same', 'higher', 'gone'] as const).map((fb) => (
                      <button
                        key={fb}
                        type="button"
                        onClick={() => void sendFeedback(fb)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold min-h-[44px]"
                      >
                        {fb === 'same'
                          ? 'Oui'
                          : fb === 'higher'
                            ? 'Plus cher'
                            : 'Plus disponible'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            {/* ② Hôtel */}
            <section
              ref={hotelSectionRef}
              id="trip-hotel"
              className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm scroll-mt-20"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold text-slate-900">② Ton hôtel</h2>
                {hotelBooked ? (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                    Réservé ✓
                  </span>
                ) : (
                  <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded-lg">
                    À réserver
                  </span>
                )}
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
                      <p className="text-xs font-semibold text-emerald-700">
                        Annulation gratuite
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600">Aucun hôtel sélectionné pour l’instant.</p>
              )}

              <div className="flex flex-col sm:flex-row gap-2 lg:flex-col">
                {(draft.deal_key || hotelObj) && (
                  <Link
                    to={hotelHref}
                    className="flex-1 text-center border border-primary-200 bg-white hover:bg-primary-50 text-primary-700 font-bold py-3.5 rounded-xl min-h-[48px] lg:hidden"
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
                    className="sm:w-auto px-4 text-center text-sm font-semibold text-slate-600 underline-offset-2 hover:underline py-2 min-h-[44px]"
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
                Ton hôtel ne dépend pas de ton vol : si la compagnie modifie ton vol, ta
                réservation d’hôtel reste valable selon ses conditions.
              </p>
            </aside>
          </div>

          {/* Colonne droite sticky — desktop only */}
          <aside className="hidden lg:block">
            <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Récapitulatif
              </p>
              {priceBreakdown}
              {nextActionButton({})}
            </div>
          </aside>
        </div>
      </div>

      {/* Barre basse mobile */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-sm safe-pb">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {adults === 1 ? (
              <p className="text-lg font-black text-slate-900 tabular-nums leading-tight">
                Total {party.total} €
              </p>
            ) : (
              <>
                <p className="text-sm font-bold text-slate-800 tabular-nums leading-tight">
                  {party.perPerson} € / pers.
                </p>
                <p className="text-xs text-slate-500 tabular-nums">{party.total} €</p>
              </>
            )}
          </div>
          <div className="shrink-0 w-[min(58%,220px)]">
            {nextActionButton({
              className:
                'block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3 rounded-xl min-h-[48px] text-sm px-3',
              compact: true,
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
