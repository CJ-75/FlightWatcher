import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { MyTripDraft } from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'
import { MyTripHotelCompose } from '../components/MyTripHotelCompose'

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function partnerLabel(
  provider?: string,
  bookingUrl?: string,
  airline?: string | null,
): string {
  const air = String(airline || '').trim().toUpperCase()
  if (air === 'FR' || air === 'RK' || /ryanair/i.test(String(airline || ''))) {
    return 'Réserver sur Ryanair'
  }
  if (bookingUrl && /ryanair\.com/i.test(bookingUrl)) return 'Réserver sur Ryanair'
  const p = (provider || '').toLowerCase()
  if (p === 'ryanair') return 'Réserver sur Ryanair'
  if (air === 'TO' || air === 'HV' || /transavia/i.test(String(airline || ''))) {
    return 'Réserver sur Transavia'
  }
  if (p === 'travelpayouts' || p === 'aviasales') return 'Réserver via Aviasales'
  if (bookingUrl && /aviasales|travelpayouts/i.test(bookingUrl)) {
    return 'Réserver via Aviasales'
  }
  return 'Continuer vers le partenaire'
}

function formatTimeLocal(iso?: string | null): string {
  if (!iso) return ''
  // Already local "HH:MM" or ISO
  const m = String(iso).match(/(\d{2}):(\d{2})/)
  if (m) return `${m[1]}:${m[2]}`
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function airlineDisplay(flight: Record<string, any>, payload: Record<string, any>): string {
  const raw = flight.airline || flight.carrier || payload.airline || ''
  const code = String(raw).trim().toUpperCase()
  const names: Record<string, string> = {
    FR: 'Ryanair',
    RK: 'Ryanair',
    TO: 'Transavia',
    HV: 'Transavia',
    VY: 'Vueling',
    U2: 'easyJet',
  }
  if (names[code]) return names[code]
  if (raw && String(raw).length > 3) return String(raw)
  if (code) return `Compagnie ${code}`
  return ''
}

/**
 * Booking-oriented « Mon voyage » (not Planner).
 * ① Vol (lien externe) ② Hôtel (in-app) — invite optionnelle.
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
  const [claiming, setClaiming] = useState(false)
  const [showPriceAsk, setShowPriceAsk] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [checkId, setCheckId] = useState<string | null>(null)
  const [flightClicked, setFlightClicked] = useState(false)
  const [markingBooked, setMarkingBooked] = useState(false)
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailMsg, setEmailMsg] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [showLoginGate, setShowLoginGate] = useState(false)
  const [tripMode, setTripMode] = useState<'duo' | 'groupe'>('duo')

  useEffect(() => {
    void getCurrentUser().then((u) => setUserId(u?.id ?? null))
  }, [])

  const requireLogin = () => {
    if (userId) return true
    setShowLoginGate(true)
    return false
  }

  const goLogin = () => {
    window.location.href = `/login?next=${encodeURIComponent(`/trip/${token}`)}`
  }

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
  const flightUrl = flight.booking_url || payload.booking_url || ''
  const city = draft?.city_name || payload.city || '—'
  const price = payload.price_per_person
  const wantsCompose =
    composeOpen || payload.compose_hotel === true || searchParams.get('compose') === '1'

  const closeCompose = () => {
    setComposeOpen(false)
    const next = new URLSearchParams(searchParams)
    next.delete('compose')
    setSearchParams(next, { replace: true })
  }
  const vlevel =
    flight.verification_level ||
    payload.flags?.verification_level ||
    payload.verification_level ||
    'live'
  const isCached = vlevel === 'cached'
  const airlineName = airlineDisplay(flight, payload)
  const cta = partnerLabel(flight.provider, flightUrl, flight.airline || flight.carrier || airlineName)
  const flightBooked = Boolean(
    draft?.flight_booked_at || payload.flight_booked || payload.flight_booked_at,
  )
  const outDate = draft?.out_date || payload.dates?.outbound
  const retDate = draft?.ret_date || payload.dates?.inbound
  const originIata = String(
    flight.origin_iata || payload.origin_iata || draft?.origin_iata || '',
  ).toUpperCase()
  const destIata = String(
    flight.destination_iata || payload.destination || payload.dest_iata || '',
  ).toUpperCase()
  const originLabel =
    payload.origin_airport_label ||
    (originIata ? originIata : null)
  const arrivalLabel =
    payload.arrival_airport_label ||
    payload.distance_label ||
    (destIata ? destIata : null)
  const outTime = formatTimeLocal(flight.outbound_local)
  const retTime = formatTimeLocal(flight.inbound_local)
  const hotelObj = hotel && typeof hotel === 'object' ? (hotel as Record<string, any>) : null
  const hotelPhoto = hotelObj?.photo || hotelObj?.thumbnail || payload.image_url || ''
  const hotelPrice =
    hotelObj?.public_hotel_price ??
    payload.price_breakdown?.hotel_public_total ??
    null
  const flightPp =
    flight.price_pp != null
      ? Number(flight.price_pp)
      : payload.price_breakdown?.flight_pp != null
        ? Number(payload.price_breakdown.flight_pp)
        : null
  const hotelHref =
    draft?.deal_key && outDate && retDate
      ? `/deals?deal=${encodeURIComponent(draft.deal_key)}&book_hotel=1&checkin=${encodeURIComponent(String(outDate).slice(0, 10))}&checkout=${encodeURIComponent(String(retDate).slice(0, 10))}`
      : draft?.deal_key
        ? `/deals?deal=${encodeURIComponent(draft.deal_key)}&book_hotel=1`
        : '/deals'

  const onFlightClick = async () => {
    // Guest OK — affiliate click tracked with draft_token
    setFlightClicked(true)
    if (!draft?.deal_key && !payload.deal_key) {
      return
    }
    try {
      const res = await getApiClient().recordFlightClick({
        deal_key: String(draft?.deal_key || payload.deal_key),
        verification_level: vlevel,
        displayed_pp:
          flight.price_pp != null
            ? Number(flight.price_pp)
            : price != null
              ? Number(price)
              : null,
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
    // Guest OK — draft token is enough
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
      setFeedbackSent(true)
      setShowPriceAsk(false)
    } catch {
      setFeedbackSent(true)
      setShowPriceAsk(false)
    }
  }

  const onSendEmail = async () => {
    if (!token) return
    setEmailSending(true)
    setEmailMsg(null)
    try {
      await getApiClient().emailMyTrip(token, { email, consent })
      setEmailMsg('Email envoyé — vérifie ta boîte de réception.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Envoi impossible'
      setEmailMsg(
        msg.includes('email_not_sent')
          ? 'Envoi indisponible (Resend non configuré).'
          : msg,
      )
    } finally {
      setEmailSending(false)
    }
  }

  const onClaim = async () => {
    if (!token) return
    setClaiming(true)
    try {
      const user = await getCurrentUser()
      if (!user) {
        window.location.href = `/login?next=${encodeURIComponent(`/trip/${token}`)}`
        return
      }
      const row = await getApiClient().claimMyTrip(token)
      setDraft(row)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion requise')
    } finally {
      setClaiming(false)
    }
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
        <Link to="/recherche" className="text-primary-600 font-bold underline">
          Retour aux deals
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link
            to="/recherche"
            className="text-sm font-bold text-slate-700 hover:text-primary-600"
          >
            ← Accueil
          </Link>
          <Link to="/deals" className="text-sm font-semibold text-primary-600">
            Deals
          </Link>
        </div>
      </header>
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
            Mon voyage
          </p>
          <h1 className="text-3xl font-black text-slate-900">{city}</h1>
          <p className="text-slate-600 mt-1">
            {formatDate(outDate)} → {formatDate(retDate)}
            {draft.adults ? ` · ${draft.adults} pers.` : null}
          </p>
          {price != null ? (
            <p className="text-2xl font-black text-primary-600 mt-2">
              {Math.round(Number(price))} € / pers.
            </p>
          ) : null}
          {(flightPp != null || hotelPrice != null) && (
            <p className="text-sm text-slate-600 mt-1">
              {flightPp != null ? `Vol ${Math.round(flightPp)} €` : null}
              {flightPp != null && hotelPrice != null ? ' + ' : null}
              {hotelPrice != null ? `hôtel ${Math.round(Number(hotelPrice))} €` : null}
            </p>
          )}
          {payload.price_pax_note ? (
            <p className="text-xs text-amber-800 mt-1">{String(payload.price_pax_note)}</p>
          ) : null}
          {isCached ? (
            <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-2 inline-block">
              Prix agrégateur · à confirmer chez le partenaire
            </p>
          ) : null}
        </div>

        {wantsCompose && token && draft ? (
          <MyTripHotelCompose
            draft={draft}
            token={token}
            onUpdated={(row) => setDraft(row)}
            onDone={closeCompose}
          />
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-slate-900">1. Réserver le vol</h2>
            {flightBooked ? (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                Réservé ✓
              </span>
            ) : null}
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 text-sm text-slate-800 space-y-1.5">
            {airlineName ? (
              <p className="font-bold text-slate-900">
                {airlineName}
                {flight.direct === true ? ' · Direct' : flight.direct === false ? ' · Avec escale' : ''}
              </p>
            ) : null}
            {(originLabel || arrivalLabel) && (
              <p>
                {originLabel || originIata || '—'}
                {' → '}
                {arrivalLabel || destIata || '—'}
              </p>
            )}
            <p>
              Aller {formatDate(outDate)}
              {outTime ? ` · ${outTime}` : ''}
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
          <p className="text-sm text-slate-600">
            Deux réservations distinctes (vol + hôtel). Le lien ouvre le partenaire ci-dessous.
          </p>
          {flightUrl ? (
            <a
              href={flightUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void onFlightClick()}
              className="block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl"
            >
              {cta}
            </a>
          ) : (
            <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
              Lien vol indisponible pour l’instant — réessaie dans un instant.
            </p>
          )}

          {(flightClicked || flightBooked) && !flightBooked ? (
            <button
              type="button"
              onClick={() => void onFlightBooked()}
              disabled={markingBooked}
              className="w-full text-center border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold py-3 rounded-xl disabled:opacity-60"
            >
              {markingBooked ? '…' : 'J’ai réservé mon vol ✓'}
            </button>
          ) : null}

          {showPriceAsk && isCached && !feedbackSent ? (
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-2">
              <p className="text-sm font-medium text-slate-800">
                Le prix était-il le même ?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void sendFeedback('same')}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold"
                >
                  Oui
                </button>
                <button
                  type="button"
                  onClick={() => void sendFeedback('higher')}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold"
                >
                  Plus cher
                </button>
                <button
                  type="button"
                  onClick={() => void sendFeedback('gone')}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold"
                >
                  Plus disponible
                </button>
              </div>
            </div>
          ) : null}
          {feedbackSent ? (
            <p className="text-xs text-slate-500">Merci — ça nous aide à rester honnêtes.</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
          <h2 className="font-bold text-slate-900">2. Hôtel du voyage</h2>
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
                <p className="text-sm text-slate-900 font-bold leading-snug">{String(hotelObj.name)}</p>
                <p className="text-xs text-slate-600">
                  {hotelObj.stars != null ? `${hotelObj.stars}★` : null}
                  {hotelObj.stars != null && hotelObj.rating != null ? ' · ' : null}
                  {hotelObj.rating != null ? `note ${hotelObj.rating}` : null}
                  {hotelObj.board ? ` · ${String(hotelObj.board)}` : null}
                </p>
                {hotelPrice != null ? (
                  <p className="text-sm font-bold text-slate-800">
                    {Math.round(Number(hotelPrice))} € hôtel
                  </p>
                ) : null}
                {hotelObj.distance_m != null ? (
                  <p className="text-xs text-slate-500">
                    {Math.round(Number(hotelObj.distance_m) / 100) / 10} km du centre
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Aucun hôtel sélectionné pour l’instant.</p>
          )}
          <p className="text-sm text-slate-600">
            Dates : {formatDate(outDate)} → {formatDate(retDate)}
          </p>
          {!wantsCompose ? (
            <button
              type="button"
              onClick={() => {
                setComposeOpen(true)
                const next = new URLSearchParams(searchParams)
                next.set('compose', '1')
                setSearchParams(next, { replace: true })
              }}
              className="w-full text-center border border-primary-200 bg-primary-50 hover:bg-primary-100 text-primary-800 font-bold py-3 rounded-xl"
            >
              Modifier l’hôtel
            </button>
          ) : null}
          {flightBooked && (draft.deal_key || hotel) ? (
            <Link
              to={hotelHref}
              className="block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3 rounded-xl"
            >
              Réserver l’hôtel
            </Link>
          ) : !flightBooked ? (
            <p className="text-xs text-slate-500">
              Réserve le vol (étape 1), puis confirme « J’ai réservé mon vol ✓ » pour
              débloquer la réservation hôtel in-app.
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
          <h2 className="font-bold text-slate-900">Recevoir ce voyage par email</h2>
          <p className="text-sm text-slate-600">
            Sans créer de compte — on t’envoie uniquement le lien de ce voyage.
          </p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@email.com"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            autoComplete="email"
          />
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              J’accepte de recevoir ce lien par email. Aucune autre utilisation de mon adresse.
            </span>
          </label>
          <button
            type="button"
            disabled={!consent || !email.trim() || emailSending}
            onClick={() => void onSendEmail()}
            className="w-full text-center border border-line bg-white hover:bg-slate-50 text-ink font-bold py-3 rounded-xl disabled:opacity-50"
          >
            {emailSending ? 'Envoi…' : 'Envoyer le lien'}
          </button>
          {emailMsg ? <p className="text-xs text-slate-600">{emailMsg}</p> : null}
        </section>

        <section className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 space-y-3">
          <h2 className="font-bold text-slate-800">Suivi du combo</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTripMode('duo')}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold border-2 ${
                tripMode === 'duo'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-line text-muted'
              }`}
            >
              Duo / couple
            </button>
            <button
              type="button"
              onClick={() => setTripMode('groupe')}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold border-2 ${
                tripMode === 'groupe'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-line text-muted'
              }`}
            >
              Groupe
            </button>
          </div>
          <p className="text-sm text-slate-600">
            {tripMode === 'duo'
              ? 'Suivi à deux des étapes vol → hôtel. Pas de vote — juste le combo partagé.'
              : 'Besoin du feu vert du groupe : invite des membres dans le Planner (l’organisateur valide).'}
          </p>
          <button
            type="button"
            onClick={() => void onClaim()}
            disabled={claiming}
            className="w-full rounded-xl bg-slate-900 text-white font-bold py-3 disabled:opacity-50"
          >
            {claiming
              ? '…'
              : tripMode === 'duo'
                ? 'Sauvegarder mon voyage (connexion)'
                : 'Ouvrir le Planner groupe (connexion)'}
          </button>
        </section>

        <Link to="/recherche" className="block text-center text-sm text-slate-500 underline">
          ← Retour
        </Link>
      </div>

      {showLoginGate ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/45 backdrop-blur-[2px] p-4">
          <div className="bg-white rounded-3xl shadow-lift border border-line max-w-sm w-full p-6 text-center">
            <h3 className="text-xl font-black text-ink">Connecte-toi pour continuer</h3>
            <p className="text-sm text-muted mt-2">
              Réservation vol et suivi « j’ai réservé » restent possibles sans compte. La
              connexion sert à inviter, synchroniser et ouvrir le Planner.
            </p>
            <button
              type="button"
              onClick={goLogin}
              className="mt-5 w-full rounded-2xl bg-primary-500 text-white font-bold py-3.5"
            >
              Se connecter
            </button>
            <button
              type="button"
              onClick={() => setShowLoginGate(false)}
              className="mt-2 w-full text-sm font-medium text-muted py-2"
            >
              Plus tard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
