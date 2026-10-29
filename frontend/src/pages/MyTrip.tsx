import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { MyTripDraft, TravelDeal } from '@flightwatcher/shared'
import {
  airportDisplayNameFr,
  computeTripPartyPrice,
  distantAirportLine,
  resolveCarrierBooking,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { getCurrentSession } from '../lib/supabase'
import { rememberTrip } from '../utils/tripRecovery'
import { MyTripHotelCompose } from '../components/MyTripHotelCompose'
import { DealCheckoutFlow } from '../components/DealCheckoutFlow'
import { PaymentCardMarks } from '../components/PaymentCardMarks'
import { MyTripHotelPanel } from '../components/MyTripHotelPanel'

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
 * Lot A–D — conversion-first Mon voyage:
 * party price, layout, carrier CTA, guest hotel checkout (§5).
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
  const [checkoutDeal, setCheckoutDeal] = useState<TravelDeal | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  /** After compose → checkout, Précédent / fermer returns to compose. */
  const [returnToCompose, setReturnToCompose] = useState(false)
  const [priceChange, setPriceChange] = useState<{ from: number; to: number } | null>(
    null,
  )
  const [flightUnavailable, setFlightUnavailable] = useState(false)
  const [hotelUnavailable, setHotelUnavailable] = useState(false)
  const [switchingHotel, setSwitchingHotel] = useState(false)
  const leftForFlight = useRef(false)
  const leftForFlightAt = useRef(0)
  const hotelSectionRef = useRef<HTMLElement | null>(null)
  const autoBookHotel = useRef(searchParams.get('book_hotel') === '1')
  const trackedView = useRef(false)

  const track = useCallback(
    (event: string, meta?: Record<string, unknown>) => {
      if (!token) return
      void getApiClient()
        .trackMyTripEvent(token, event, meta)
        .catch(() => undefined)
    },
    [token],
  )

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const row = await getApiClient().getMyTrip(token)
      setDraft(row)
      rememberTrip({
        draft_token: token,
        city: row.city_name || (row.payload as { city?: string } | undefined)?.city,
        booking_id:
          (row.payload as { hotel_booking_id?: string } | undefined)?.hotel_booking_id ||
          null,
      })
      if (!trackedView.current) {
        trackedView.current = true
        void getApiClient()
          .trackMyTripEvent(token, 'view')
          .catch(() => undefined)
      }
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

  // After login (?claim=1) attach draft + hotel bookings to the account
  useEffect(() => {
    if (!token || searchParams.get('claim') !== '1') return
    let cancelled = false
    ;(async () => {
      try {
        const session = await getCurrentSession()
        if (!session?.user || cancelled) return
        await getApiClient().claimMyTrip(token)
        if (cancelled) return
        const next = new URLSearchParams(searchParams)
        next.delete('claim')
        setSearchParams(next, { replace: true })
        await load()
      } catch {
        /* guest / already claimed */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, searchParams, setSearchParams, load])

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
        language: 'fr',
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
  const hotelBooked = Boolean(
    draft?.hotel_booked_at || payload.hotel_booked || payload.hotel_booked_at,
  )
  const hotelConfirmation =
    payload.hotel_confirmation_code != null
      ? String(payload.hotel_confirmation_code)
      : null
  const hotelHolderEmail =
    payload.hotel_holder_email != null ? String(payload.hotel_holder_email) : null
  const vlevel =
    flight.verification_level ||
    payload.flags?.verification_level ||
    payload.verification_level ||
    'live'
  const isCached = vlevel === 'cached'
  const hotelPhoto = hotelObj?.photo || hotelObj?.thumbnail || payload.image_url || ''
  const hotelId = hotelObj?.id != null ? String(hotelObj.id) : null
  const wantsCompose =
    composeOpen || payload.compose_hotel === true || searchParams.get('compose') === '1'

  const from = searchParams.get('from')
  const backHref =
    from === 'recherche' || from === 'vols' ? '/vols' : '/sejours'
  const backLabel =
    from === 'recherche' || from === 'vols' ? '← Vols' : '← Séjours'

  const closeCompose = () => {
    setComposeOpen(false)
    const next = new URLSearchParams(searchParams)
    next.delete('compose')
    setSearchParams(next, { replace: true })
  }

  const openCompose = useCallback(() => {
    setComposeOpen(true)
    const next = new URLSearchParams(searchParams)
    next.set('compose', '1')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const dismissHotelCheckout = useCallback(() => {
    setCheckoutDeal(null)
    if (!returnToCompose) return
    setReturnToCompose(false)
    openCompose()
  }, [openCompose, returnToCompose])

  const onFlightClick = async () => {
    leftForFlight.current = true
    leftForFlightAt.current = Date.now()
    track('company_click', { airline: airlineName, site: carrier.siteLabel })
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
    track('flight_booked_no')
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

  const buildDealFromMyTrip = useCallback(
    (d: MyTripDraft): TravelDeal | null => {
      const pl = (d.payload || {}) as Record<string, any>
      const fl = (pl.flight || {}) as Record<string, any>
      const hRaw =
        (pl.hotel as Record<string, any> | undefined) ||
        (d.hotel as Record<string, any> | undefined) ||
        null
      const out = String(d.out_date || pl.dates?.outbound || '').slice(0, 10)
      const inn = String(d.ret_date || pl.dates?.inbound || '').slice(0, 10)
      if (!out || !inn) return null
      const pax = Math.max(1, Number(d.adults || pl.adults || 2))
      const cityName = String(d.city_name || pl.city || city || 'Séjour')
      const flightPp =
        fl.price_pp != null
          ? Number(fl.price_pp)
          : pl.price_breakdown?.flight_pp != null
            ? Number(pl.price_breakdown.flight_pp)
            : Number(party.flightPp) || 0
      const hotelTotal =
        hRaw?.public_hotel_price != null
          ? Number(hRaw.public_hotel_price)
          : pl.price_breakdown?.hotel_public_total != null
            ? Number(pl.price_breakdown.hotel_public_total)
            : Number(party.hotelTotal) || 0
      const perPerson =
        Number(pl.price_per_person) ||
        Math.round(flightPp + hotelTotal / pax) ||
        Number(party.perPerson) ||
        0
      const key =
        String(d.deal_key || pl.deal_key || '').trim() ||
        `mytrip-${d.draft_token}`
      const photo = hRaw?.photo || hRaw?.thumbnail || pl.image_url || ''
      const nightCount =
        Number(pl.nights) ||
        Math.max(
          1,
          Math.round(
            (new Date(inn + 'T12:00:00').getTime() -
              new Date(out + 'T12:00:00').getTime()) /
              86400000,
          ),
        )
      const hotel = hRaw
        ? {
            id: String(hRaw.id || hRaw.hotel_id || ''),
            name: hRaw.name ? String(hRaw.name) : undefined,
            stars: hRaw.stars != null ? Number(hRaw.stars) : undefined,
            rating: hRaw.rating != null ? Number(hRaw.rating) : undefined,
            review_count:
              hRaw.review_count != null ? Number(hRaw.review_count) : undefined,
            distance_m:
              hRaw.distance_m != null ? Number(hRaw.distance_m) : undefined,
            photo: photo ? String(photo) : undefined,
            board: hRaw.board != null ? String(hRaw.board) : undefined,
            refundable:
              typeof hRaw.refundable === 'boolean' ? hRaw.refundable : undefined,
            cancel_deadline: hRaw.cancel_deadline
              ? String(hRaw.cancel_deadline)
              : null,
            public_hotel_price: hotelTotal || undefined,
          }
        : undefined
      if (hotel && !hotel.id) return null
      return {
        id: key,
        deal_key: key,
        title: `Week-end à ${cityName}`,
        city: cityName,
        country: '',
        image_url: photo ? String(photo) : '',
        price_per_person: perPerson,
        currency: 'EUR',
        nights: nightCount,
        departure_airport: String(
          d.origin_iata || pl.origin_iata || fl.origin_iata || originIata || '',
        ),
        dates: { outbound: out, inbound: inn },
        hotel_name: hotel?.name,
        hotel_stars: hotel?.stars,
        board: hotel?.board,
        highlights: [],
        description: '',
        provider: 'liteapi',
        booking_url: '',
        adults: pax,
        origin_iata:
          String(d.origin_iata || pl.origin_iata || fl.origin_iata || originIata || '') ||
          undefined,
        destination:
          String(d.dest_iata || pl.destination || fl.destination_iata || destIata || '') ||
          undefined,
        flight: {
          price_pp: flightPp,
          airline: fl.airline || fl.carrier,
          booking_url: fl.booking_url || pl.booking_url,
          origin_iata: fl.origin_iata,
          destination_iata: fl.destination_iata,
          direct: fl.direct,
          provider: fl.provider,
        },
        hotel,
        price_breakdown: {
          flight_pp: flightPp,
          hotel_public_total: hotelTotal,
          total_pp: perPerson,
        },
      } as TravelDeal
    },
    [city, destIata, originIata, party.flightPp, party.hotelTotal, party.perPerson],
  )

  const openHotelCheckout = useCallback(
    async (overrideDraft?: MyTripDraft | null) => {
      const d = overrideDraft || draft
      if (!d || hotelBooked) return
      const pl = (d.payload || {}) as Record<string, unknown>
      const hotel =
        (pl.hotel as Record<string, unknown> | undefined) ||
        (d.hotel as Record<string, unknown> | undefined) ||
        null
      if (!hotel?.id && !hotel?.hotel_id) {
        setError('Choisis un hôtel avant de payer')
        return
      }
      setCheckoutLoading(true)
      setError(null)
      setHotelUnavailable(false)
      try {
        let deal: TravelDeal | null = null
        const key = String(d.deal_key || pl.deal_key || '').trim()
        if (key && !key.startsWith('mytrip-')) {
          try {
            deal = await getApiClient().getDeal(key)
          } catch {
            deal = null
          }
        }
        if (!deal) deal = buildDealFromMyTrip(d)
        if (!deal) {
          setError('Impossible d’ouvrir la réservation hôtel')
          return
        }
        const hid = String(hotel?.id || hotel?.hotel_id || deal.hotel?.id || '')
        const pub =
          hotel?.public_hotel_price != null
            ? Number(hotel.public_hotel_price)
            : deal.hotel?.public_hotel_price
        if (hid) {
          deal = {
            ...deal,
            hotel: {
              ...(deal.hotel || { id: hid }),
              id: hid,
              name: hotel?.name ? String(hotel.name) : deal.hotel?.name,
              stars:
                hotel?.stars != null ? Number(hotel.stars) : deal.hotel?.stars,
              rating:
                hotel?.rating != null
                  ? Number(hotel.rating)
                  : deal.hotel?.rating,
              photo: hotel?.photo
                ? String(hotel.photo)
                : deal.hotel?.photo,
              board: hotel?.board
                ? String(hotel.board)
                : deal.hotel?.board,
              refundable:
                typeof hotel?.refundable === 'boolean'
                  ? hotel.refundable
                  : deal.hotel?.refundable,
              public_hotel_price: pub ?? deal.hotel?.public_hotel_price,
            },
            hotel_name: hotel?.name
              ? String(hotel.name)
              : deal.hotel_name,
            price_breakdown: {
              ...(deal.price_breakdown || { flight_pp: 0 }),
              hotel_public_total:
                pub ?? deal.price_breakdown?.hotel_public_total,
            },
          }
        }
        track('hotel_checkout_open', {
          deal_key: deal.deal_key || key || null,
          draft_token: d.draft_token || null,
        })
        setCheckoutDeal(deal)
        const next = new URLSearchParams(searchParams)
        next.delete('book_hotel')
        setSearchParams(next, { replace: true })
      } finally {
        setCheckoutLoading(false)
      }
    },
    [
      buildDealFromMyTrip,
      draft,
      hotelBooked,
      searchParams,
      setSearchParams,
      track,
    ],
  )

  /** Soft revalidate on load — price change / flight gone (§7). */
  useEffect(() => {
    if (!draft?.deal_key || loading) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await getApiClient().revalidateDealFlight(
          String(draft.deal_key),
          adults,
        )
        if (cancelled || !res?.ok) return
        if (res.available === false) {
          setFlightUnavailable(true)
          return
        }
        const displayed = Number(res.displayed_pp)
        const checked = Number(res.checked_pp)
        if (
          Number.isFinite(displayed) &&
          Number.isFinite(checked) &&
          Math.abs(checked - displayed) >= 1
        ) {
          const fromTotal = Math.round(displayed) * adults + party.hotelTotal
          const toTotal = Math.round(checked) * adults + party.hotelTotal
          setPriceChange({ from: fromTotal, to: toTotal })
        }
      } catch {
        /* soft fail */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [adults, draft?.deal_key, loading, party.hotelTotal])

  const altHotels = useMemo(() => {
    const raw = payload.alt_hotels
    if (!Array.isArray(raw)) return [] as Record<string, any>[]
    return raw.filter((h) => h && typeof h === 'object').slice(0, 2)
  }, [payload.alt_hotels])

  const pickAltHotel = async (hotel: Record<string, any>) => {
    if (!token || !hotel?.id) return
    setSwitchingHotel(true)
    try {
      const row = await getApiClient().updateMyTripHotel(token, {
        hotel: {
          id: String(hotel.id),
          name: hotel.name,
          public_hotel_price: hotel.public_hotel_price,
        },
      })
      setDraft(row)
      setHotelUnavailable(false)
    } catch {
      setHotelUnavailable(true)
    } finally {
      setSwitchingHotel(false)
    }
  }

  useEffect(() => {
    if (!autoBookHotel.current || !draft || hotelBooked || loading) return
    autoBookHotel.current = false
    void openHotelCheckout()
  }, [draft, hotelBooked, loading, openHotelCheckout])

  /** Unique next action for sticky / bottom bar (§5). */
  const nextAction = useMemo(() => {
    if (flightBooked && hotelBooked) {
      return { kind: 'done' as const, label: 'Voir ma réservation' }
    }
    if (flightBooked) {
      return {
        kind: 'hotel' as const,
        label:
          party.hotelTotal > 0
            ? `Réserver mon hôtel · ${party.hotelTotal} €`
            : 'Réserver mon hôtel',
      }
    }
    return {
      kind: 'flight' as const,
      label: 'Réserver mon vol',
      href: flightUrl,
    }
  }, [flightBooked, flightUrl, hotelBooked, party.hotelTotal])

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
        <Link to="/sejours" className="text-primary-600 font-bold underline">
          ← Séjours
        </Link>
      </div>
    )
  }

  const travelersLabel = adults === 1 ? '1 voyageur' : `${adults} voyageurs`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Mon week-end à ${city} : ${typeof window !== 'undefined' ? window.location.href : ''}`,
  )}`

  /** Hotel payment focus: never cite the flight in the sticky récap. */
  const hotelPaymentFocus =
    nextAction.kind === 'hotel' || Boolean(checkoutDeal)
  const hotelRecapTotal = Math.round(Number(party.hotelTotal) || 0)
  const hotelRecapPp =
    adults > 1 && hotelRecapTotal > 0
      ? Math.round(hotelRecapTotal / adults)
      : hotelRecapTotal

  const priceBreakdown = hotelPaymentFocus ? (
    <>
      {adults === 1 ? (
        <p className="text-3xl font-black text-primary-600 tracking-tight">
          Hôtel {hotelRecapTotal} €
        </p>
      ) : (
        <>
          <p className="text-3xl font-black text-primary-600 tracking-tight">
            Hôtel {hotelRecapTotal} €{' '}
            <span className="text-lg font-bold text-slate-600">pour {adults}</span>
          </p>
          <p className="text-sm font-semibold text-slate-700 mt-1">
            {hotelRecapPp} € / pers.
          </p>
        </>
      )}
      <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
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
          <dd className="font-semibold tabular-nums">{hotelRecapTotal} €</dd>
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
    </>
  ) : (
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

  const nextActionButton = () => {
    const cls =
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
          {nextAction.label}
        </a>
      )
    }
    if (nextAction.kind === 'hotel') {
      return (
        <div className="w-full space-y-2">
          <button
            type="button"
            disabled={checkoutLoading}
            onClick={() => void openHotelCheckout()}
            className={cls}
          >
            {checkoutLoading ? '…' : nextAction.label}
          </button>
          <PaymentCardMarks />
        </div>
      )
    }
    return (
      <button
        type="button"
        onClick={() => hotelSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
        className={cls}
      >
        {nextAction.label}
      </button>
    )
  }

  const cancelLabel = (() => {
    if (hotelObj?.refundable === false) return 'Non remboursable'
    const deadline = hotelObj?.cancel_deadline
    if (hotelObj?.refundable === true && deadline) {
      try {
        const d = new Date(String(deadline))
        if (Number.isFinite(d.getTime())) {
          return `Annulation gratuite jusqu’au ${d.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
          })}`
        }
      } catch {
        /* fall through */
      }
    }
    if (hotelObj?.refundable === true) return 'Annulation gratuite'
    return null
  })()

  return (
    <div
      className={`min-h-screen bg-[#F7F7F7] pb-4 lg:pb-10`}
    >
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <div
          className={`max-w-[1500px] mx-auto h-14 flex items-center justify-between gap-3 ${
            wantsCompose
              ? 'w-full px-3 sm:w-[92%] sm:px-4'
              : 'w-[92%] px-2 sm:px-4'
          }`}
        >
          <Link
            to={backHref}
            className="text-sm font-bold text-slate-700 hover:text-primary-600 shrink-0 min-h-[44px] inline-flex items-center"
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

      <div
        className={`max-w-[1500px] mx-auto ${
          wantsCompose
            ? 'w-full px-3 sm:w-[92%] sm:px-4 py-3 sm:py-6'
            : 'w-[92%] px-2 sm:px-4 py-6 sm:py-8'
        }`}
      >
        <div className={`mb-5 lg:mb-7 ${wantsCompose ? 'hidden lg:block' : ''}`}>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            {flightBooked && hotelBooked
              ? `Ton voyage à ${city} est prêt`
              : `Ton week-end à ${city}`}
          </h1>
          <p className="text-slate-600 mt-1.5">
            {formatDate(outDate)} → {formatDate(retDate)}
            {nights > 0 ? ` · ${nights} nuit${nights > 1 ? 's' : ''}` : ''}
            {` · ${travelersLabel}`}
          </p>
          {priceChange ? (
            <p className="mt-3 text-sm font-medium text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Le prix a changé depuis ta recherche : {priceChange.from} € →{' '}
              {priceChange.to} €
            </p>
          ) : null}
        </div>

        {wantsCompose && token && draft ? (
          <MyTripHotelCompose
            draft={draft}
            token={token}
            onUpdated={(row) => setDraft(row)}
            onDone={closeCompose}
            onHotelChosen={(row) => {
              setDraft(row)
              setReturnToCompose(true)
              closeCompose()
              void openHotelCheckout(row)
            }}
          />
        ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 lg:items-start">
          {/* Colonne gauche */}
          <div className="space-y-6 min-w-0">
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

              {flightUnavailable && !flightBooked ? (
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-sm text-amber-950 space-y-2">
                  <p className="font-semibold">Ce vol n’apparaît plus au même prix</p>
                  <p className="text-xs text-amber-900/80">
                    Vérifie sur le site de la compagnie — le lien ci-dessous reste
                    disponible.
                  </p>
                  <Link
                    to="/sejours"
                    className="inline-block text-xs font-bold text-primary-700 underline-offset-2 hover:underline"
                  >
                    Voir d’autres dates
                  </Link>
                </div>
              ) : null}

              {flightBooked ? (
                <p className="text-sm text-slate-700">
                  <span className="font-bold text-slate-900">
                    {airlineName || 'Compagnie'}
                  </span>
                  {' · '}
                  {formatDate(outDate)} → {formatDate(retDate)}
                  {stopsLabel ? ` · ${stopsLabel}` : ''}
                  {outTime ? ` · ${outTime}` : ''}
                  {retTime ? ` / ${retTime}` : ''}
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
                <MyTripHotelPanel
                  hotel={hotelObj}
                  hotelId={hotelId}
                  cityLabel={String(city !== '—' ? city : '')}
                  nights={nights}
                  adults={adults}
                  hotelTotal={party.hotelTotal}
                  outLabel={formatDate(outDate)}
                  retLabel={formatDate(retDate)}
                  cancelLabel={cancelLabel}
                  booked={hotelBooked}
                  onChangeHotel={
                    !wantsCompose && !hotelBooked ? () => openCompose() : undefined
                  }
                />
              ) : (
                <p className="text-sm text-slate-600">Aucun hôtel sélectionné pour l’instant.</p>
              )}

              {hotelUnavailable && !hotelBooked ? (
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-3 space-y-3">
                  <p className="text-sm font-semibold text-amber-950">
                    Cet hôtel n’est plus disponible à ces dates
                  </p>
                  {altHotels.length > 0 ? (
                    <div className="space-y-2">
                      {altHotels.map((h) => {
                        const hid = String(h.id || h.hotel_id || '')
                        const price =
                          h.public_hotel_price != null
                            ? Math.round(Number(h.public_hotel_price))
                            : null
                        return (
                          <button
                            key={hid}
                            type="button"
                            disabled={switchingHotel || !hid}
                            onClick={() => void pickAltHotel(h)}
                            className="w-full text-left rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:border-primary-300 disabled:opacity-60"
                          >
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {String(h.name || 'Hôtel')}
                            </p>
                            <p className="text-xs text-slate-600">
                              {price != null ? `${price} €` : 'Prix à confirmer'}
                              {h.stars != null ? ` · ${h.stars}★` : ''}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openCompose()}
                      className="text-sm font-bold text-primary-700 underline-offset-2 hover:underline"
                    >
                      Choisir un autre hôtel
                    </button>
                  )}
                </div>
              ) : null}

              {hotelBooked ? (
                <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 px-3 py-3 text-sm space-y-1">
                  <p className="font-bold text-emerald-900">Hôtel réservé ✓</p>
                  {hotelConfirmation ? (
                    <p className="text-slate-700">
                      N° : <strong>{hotelConfirmation}</strong>
                    </p>
                  ) : null}
                  {hotelHolderEmail ? (
                    <p className="text-slate-600 text-xs">
                      Confirmation envoyée à {hotelHolderEmail}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!hotelObj?.name && !hotelBooked && !hotelUnavailable ? (
                <button
                  type="button"
                  onClick={() => openCompose()}
                  className="w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl min-h-[48px]"
                >
                  Choisir un hôtel
                </button>
              ) : null}
            </section>

            <aside className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 leading-relaxed shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">
                Réservation en 2 étapes
              </p>
              <p className="text-[12px] text-slate-600 mb-3 leading-snug">
                Pour le week-end complet, réserve les deux : le vol chez la compagnie, puis
                l’hôtel ici. Tu peux aussi ne prendre que l’hôtel si ton vol est déjà réglé.
              </p>
              <ol className="space-y-3">
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-black flex items-center justify-center">
                    1
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-[13px]">Vol auprès de la compagnie</p>
                    <p className="text-[12px] text-slate-600 mt-0.5 leading-snug">
                      Réserve et paie ton billet sur le site officiel de la compagnie aérienne
                      (conseillé en premier : les tarifs vols bougent plus vite).
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-black flex items-center justify-center">
                    2
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-[13px]">Hôtel sur FlightWatcher</p>
                    <p className="text-[12px] text-slate-600 mt-0.5 leading-snug">
                      Confirme ta chambre ici en quelques minutes. Paiement sécurisé, confirmation
                      immédiate.
                    </p>
                  </div>
                </li>
              </ol>
              <p className="mt-3.5 pt-3 border-t border-slate-100 text-[11px] text-slate-500 leading-snug">
                Vol et hôtel restent indépendants : une modification de vol par la compagnie
                n’annule pas ton hôtel — les conditions de l’établissement s’appliquent.
              </p>
            </aside>
          </div>

          {/* Récapitulatif — sticky desktop, flux mobile */}
          <aside className="mt-6 lg:mt-0">
            <div className="lg:sticky lg:top-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Récapitulatif
              </p>
              {priceBreakdown}
              {nextActionButton()}
            </div>
          </aside>
        </div>
        )}
      </div>

      {checkoutDeal && token ? (
        <DealCheckoutFlow
          deal={checkoutDeal}
          hotelId={hotelObj?.id ? String(hotelObj.id) : checkoutDeal.hotel?.id}
          draftToken={token}
          hotelTotalHint={party.hotelTotal}
          onClose={dismissHotelCheckout}
          onUnavailable={() => {
            setCheckoutDeal(null)
            setHotelUnavailable(true)
            if (returnToCompose) {
              setReturnToCompose(false)
              openCompose()
            }
          }}
          onAccountCta={() => track('account_cta')}
          onBooked={() => {
            setReturnToCompose(false)
            void load()
          }}
        />
      ) : null}
    </div>
  )
}
