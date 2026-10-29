import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type {
  DealRevalidateResponse,
  HotelBooking,
  TravelDeal,
} from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { rememberTrip } from '../utils/tripRecovery'
import { DealComplianceNotice } from './DealComplianceNotice'

type Step = 'revalidate' | 'confirm' | 'guests' | 'pay' | 'pending' | 'done' | 'error'

interface Props {
  deal: TravelDeal
  hotelId?: string
  onClose: () => void
  /** Required when not using draftToken guest path */
  onNeedLogin?: () => void
  /** Lot D — guest MyTrip: skip login, pass to prebook/book */
  draftToken?: string | null
  onBooked?: (booking: HotelBooking) => void
  /** Lot E — hotel no longer available at these dates */
  onUnavailable?: () => void
  onAccountCta?: () => void
  /** Compact récap dates / hotel total for MyTrip */
  hotelTotalHint?: number | null
}

declare global {
  interface Window {
    LiteAPIPayment?: {
      init: (opts: Record<string, unknown>) => { mount?: (el: HTMLElement) => void }
    }
  }
}

function loadPaymentScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.LiteAPIPayment) {
      resolve()
      return
    }
    const existing = document.querySelector('script[data-liteapi-payment]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('payment script')))
      return
    }
    const s = document.createElement('script')
    s.src = 'https://payment-wrapper.liteapi.travel/v1.0/payment-wrapper.js'
    s.async = true
    s.dataset.liteapiPayment = '1'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Impossible de charger le SDK paiement LiteAPI'))
    document.body.appendChild(s)
  })
}

export function DealCheckoutFlow({
  deal,
  hotelId,
  onClose,
  onNeedLogin,
  draftToken,
  onBooked,
  onUnavailable,
  onAccountCta,
  hotelTotalHint,
}: Props) {
  const { t } = useI18n()
  const guestMode = Boolean(draftToken)
  const [step, setStep] = useState<Step>('revalidate')
  const [error, setError] = useState<string | null>(null)
  const [reval, setReval] = useState<DealRevalidateResponse | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [prebookMeta, setPrebookMeta] = useState<{
    secret_key?: string | null
    payment_public_key?: string | null
    liteapi_env?: string
    charged_price?: number
  } | null>(null)
  const [booking, setBooking] = useState<HotelBooking | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [showAccountCta, setShowAccountCta] = useState(false)
  const payRef = useRef<HTMLDivElement>(null)
  const dealKey = deal.deal_key || deal.id

  const runRevalidate = useCallback(async () => {
    setStep('revalidate')
    setError(null)
    try {
      if (!guestMode) {
        const user = await getCurrentUser()
        if (!user) {
          onNeedLogin?.()
          onClose()
          return
        }
      }
      const res = await getApiClient().revalidateDeal(dealKey, {
        hotel_id: hotelId || deal.hotel?.id,
        displayed_price_pp: deal.price_per_person,
      })
      setReval(res)
      if (res.action === 'confirm') setStep('confirm')
      else if (res.action === 'fallback' && res.hotel_switched) setStep('confirm')
      else setStep('guests')
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('app.error')
      setError(msg)
      if (/indisponible|unavailable|409/i.test(msg)) onUnavailable?.()
      setStep('error')
    }
  }, [deal, dealKey, guestMode, hotelId, onClose, onNeedLogin, onUnavailable, t])

  useEffect(() => {
    void runRevalidate()
  }, [runRevalidate])

  const doPrebook = async () => {
    if (!reval?.offer_id || !reval.hotel_id) {
      setError('Offre invalide')
      setStep('error')
      return
    }
    setError(null)
    try {
      const price = reval.revalidated_price_pp ?? deal.price_per_person
      const hotelCharge =
        reval.public_hotel_price ??
        (deal.price_breakdown?.hotel_public_total || price)
      const pb = await getApiClient().prebookHotel({
        deal_key: dealKey,
        offer_id: reval.offer_id,
        hotel_id: reval.hotel_id,
        displayed_price: hotelCharge,
        charged_price: hotelCharge,
        margin_pct_used: reval.margin_pct_used,
        ssp_at_booking: reval.ssp_total,
        deal_snapshot: (reval.deal_snapshot || deal) as TravelDeal,
        draft_token: draftToken || undefined,
      })
      setBookingId(pb.booking_id)
      setPrebookMeta({
        secret_key: pb.secret_key,
        payment_public_key: pb.payment_public_key,
        liteapi_env: pb.liteapi_env,
        charged_price: pb.charged_price,
      })
      if (draftToken) {
        rememberTrip({
          draft_token: draftToken,
          booking_id: pb.booking_id,
          city: deal.city,
        })
      }
      setStep('pay')
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('app.error')
      setError(msg)
      if (/indisponible|unavailable|409/i.test(msg)) {
        onUnavailable?.()
      }
      setStep('error')
    }
  }

  useEffect(() => {
    if (step !== 'pay' || !prebookMeta?.secret_key || !prebookMeta.payment_public_key) return
    let cancelled = false
    ;(async () => {
      try {
        await loadPaymentScript()
        if (cancelled || !payRef.current || !window.LiteAPIPayment) return
        payRef.current.innerHTML = ''
        const widget = window.LiteAPIPayment.init({
          publicKey: prebookMeta.payment_public_key,
          secretKey: prebookMeta.secret_key,
          appearance: { theme: 'stripe' },
          onSuccess: async () => {
            await finalizeBook('succeeded')
          },
        })
        widget.mount?.(payRef.current)
      } catch {
        // SDK optional — sandbox fallback button remains
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finalizeBook closed over latest state via pay step
  }, [step, prebookMeta])

  const finalizeBook = async (
    payment_status: 'succeeded' | 'requires_capture',
    opts?: { sandboxSimulate?: boolean },
  ) => {
    if (!bookingId) return
    setStep('pending')
    setError(null)
    try {
      // LiteAPI: one primary guest per room (not one per traveler)
      const guests = [
        {
          firstName,
          lastName,
          email,
          occupancyNumber: 1,
        },
      ]
      const b = await getApiClient().bookHotel(bookingId, {
        holder: { firstName, lastName, email },
        guests,
        payment_status,
        draft_token: draftToken || undefined,
        sandbox_simulate: opts?.sandboxSimulate || undefined,
      })
      let final = b
      if (b.status === 'booking_pending') {
        await new Promise((r) => setTimeout(r, 1500))
        final = await getApiClient().getHotelBooking(bookingId, {
          draft_token: draftToken || undefined,
        })
      }
      setBooking(final)

      if (draftToken) {
        rememberTrip({
          draft_token: draftToken,
          booking_id: final.id,
          city: deal.city,
        })
        try {
          await getApiClient().markMyTripHotelBooked(draftToken, {
            booking_id: final.id,
            confirmation_code: final.confirmation_code,
            holder_email: email,
          })
        } catch {
          /* draft mark best-effort — booking already succeeded */
        }
      }

      onBooked?.(final)
      setShowAccountCta(guestMode)
      setStep('done')
    } catch (e) {
      let msg = e instanceof Error ? e.message : t('app.error')
      // Surface nested LiteAPI body when API returns { detail: { message, liteapi } }
      try {
        const raw = String(msg)
        if (raw.includes('liteapi') || raw.includes('Book échoué')) {
          msg = raw
        }
      } catch {
        /* keep msg */
      }
      setError(msg)
      // Keep holder fields — retry payment without re-typing
      setStep('error')
    }
  }

  const price = reval?.revalidated_price_pp ?? deal.price_per_person
  const fees = reval?.excluded_fees ?? deal.price_breakdown?.excluded_fees ?? 0
  const hotelName =
    reval?.hotel_name || deal.hotel?.name || deal.hotel_name || 'Hôtel'
  const dates = deal.dates
  const hotelTotal =
    hotelTotalHint ??
    reval?.public_hotel_price ??
    deal.price_breakdown?.hotel_public_total ??
    null

  return (
    <AnimatePresence>
      <motion.div className="app-dialog-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <button type="button" className="app-dialog-backdrop" aria-label="Fermer" onClick={onClose} />
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="app-dialog-panel app-dialog-xl max-h-[92vh] overflow-y-auto"
        >
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Réservation hôtel
                </p>
                <h2 className="text-xl font-black text-slate-900">{deal.city}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-slate-100 font-bold"
              >
                ×
              </button>
            </div>

            {/* Compact récap */}
            <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 space-y-0.5">
              <p className="font-bold text-slate-900">{hotelName}</p>
              {dates?.outbound && dates?.inbound ? (
                <p className="text-xs text-slate-600">
                  {dates.outbound} → {dates.inbound}
                  {deal.nights ? ` · ${deal.nights} nuit${deal.nights > 1 ? 's' : ''}` : ''}
                </p>
              ) : null}
              {hotelTotal != null ? (
                <p className="text-xs font-semibold text-slate-800">
                  {Math.round(Number(hotelTotal))} € hôtel
                </p>
              ) : null}
              {reval?.cancel_deadline || deal.hotel?.refundable === false ? (
                <DealComplianceNotice cancelDeadline={reval?.cancel_deadline} />
              ) : deal.hotel?.refundable === true ? (
                <p className="text-xs text-emerald-700 font-semibold">Annulation gratuite</p>
              ) : null}
            </div>

            {step === 'revalidate' ? (
              <p className="text-sm text-slate-600">Vérification du prix en cours…</p>
            ) : null}

            {step === 'confirm' && reval ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-700 font-medium">
                  Le prix a changé : {Math.round(reval.displayed_price_pp || 0)} € →{' '}
                  {Math.round(reval.revalidated_price_pp || 0)} € / pers.
                </p>
                {reval.hotel_switched ? (
                  <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                    Hôtel mis à jour : {reval.hotel_name}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep('guests')}
                    className="flex-1 bg-primary-500 text-white font-bold py-3 rounded-xl min-h-[48px]"
                  >
                    Continuer
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 border border-line font-bold py-3 rounded-xl min-h-[48px]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : null}

            {step === 'guests' ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Titulaire de la réservation
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Nom sur la réservation hôtel
                    {fees > 0 ? ` · + ${Math.round(fees)} € taxes sur place` : ''}
                  </p>
                </div>
                {!guestMode ? (
                  <p className="text-sm text-slate-600">
                    Total affiché : <strong>{Math.round(price)} € / pers.</strong>
                  </p>
                ) : null}
                <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-3 shadow-sm">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                        Prénom
                      </span>
                      <input
                        className="w-full rounded-xl border-2 border-slate-300 bg-slate-50 px-3.5 py-3 text-base font-medium text-slate-900 placeholder:text-slate-400 min-h-[48px] focus:outline-none focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-200"
                        placeholder="Marie"
                        autoComplete="given-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                        Nom
                      </span>
                      <input
                        className="w-full rounded-xl border-2 border-slate-300 bg-slate-50 px-3.5 py-3 text-base font-medium text-slate-900 placeholder:text-slate-400 min-h-[48px] focus:outline-none focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-200"
                        placeholder="Dupont"
                        autoComplete="family-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                      Email
                    </span>
                    <input
                      className="w-full rounded-xl border-2 border-slate-300 bg-slate-50 px-3.5 py-3 text-base font-medium text-slate-900 placeholder:text-slate-400 min-h-[48px] focus:outline-none focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-200"
                      placeholder="marie.dupont@email.com"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <span className="text-[11px] text-slate-500">
                      Confirmation de réservation envoyée à cette adresse
                    </span>
                  </label>
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (reval?.action === 'confirm' || reval?.hotel_switched) {
                        setStep('confirm')
                        return
                      }
                      onClose()
                    }}
                    className="sm:w-auto px-4 border border-line font-bold py-3 rounded-xl min-h-[48px] text-slate-700"
                  >
                    Précédent
                  </button>
                  <button
                    type="button"
                    disabled={!firstName || !lastName || !email}
                    onClick={() => void doPrebook()}
                    className="flex-1 bg-primary-500 disabled:bg-slate-200 text-white font-bold py-3.5 rounded-xl min-h-[48px]"
                  >
                    Continuer vers le paiement
                  </button>
                </div>
                {guestMode ? (
                  <p className="text-xs text-slate-500 text-center">
                    Aucun compte requis pour payer. Tu pourras retrouver ce voyage via le
                    lien /trip ou Mes réservations.
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === 'pay' ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Paiement hôtel :{' '}
                  <strong>
                    {Math.round(prebookMeta?.charged_price || reval?.public_hotel_price || 0)} €
                  </strong>
                </p>
                <div ref={payRef} className="min-h-[120px] rounded-xl border border-line p-3" />
                {prebookMeta?.liteapi_env === 'sandbox' ? (
                  <button
                    type="button"
                    onClick={() => void finalizeBook('succeeded', { sandboxSimulate: true })}
                    className="w-full border border-dashed border-primary-300 text-primary-700 font-bold py-3 rounded-xl min-h-[48px]"
                  >
                    Simuler paiement réussi (sandbox)
                  </button>
                ) : null}
                {!prebookMeta?.payment_public_key ? (
                  <p className="text-xs text-amber-800">
                    Clé publique paiement manquante — utilisez le mode sandbox ou configurez
                    LITEAPI_PAYMENT_PUBLIC_KEY_*.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setStep('guests')}
                  className="w-full border border-line font-bold py-3 rounded-xl min-h-[48px] text-slate-700"
                >
                  Précédent — modifier les coordonnées
                </button>
              </div>
            ) : null}

            {step === 'pending' ? (
              <p className="text-sm text-slate-600">Confirmation en cours…</p>
            ) : null}

            {step === 'done' && booking ? (
              <div className="space-y-3">
                <p className="text-lg font-bold text-ink">Hôtel réservé ✓</p>
                {booking.confirmation_code ? (
                  <p className="text-sm">
                    N° de réservation : <strong>{booking.confirmation_code}</strong>
                  </p>
                ) : (
                  <p className="text-sm text-slate-600">Statut : {booking.status}</p>
                )}
                {email ? (
                  <p className="text-sm text-slate-600">
                    Confirmation envoyée à <strong>{email}</strong>
                  </p>
                ) : null}

                {showAccountCta && draftToken ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
                    <p className="text-sm font-semibold text-slate-800">
                      Retrouve ce voyage sur tous tes appareils
                    </p>
                    <p className="text-xs text-slate-500">
                      Optionnel — sans compte, garde le lien Mon voyage ou Mes
                      réservations sur cet appareil.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Link
                        to={`/login?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(`/trip/${draftToken}?claim=1`)}`}
                        onClick={() => onAccountCta?.()}
                        className="flex-1 text-center bg-primary-500 text-white font-bold py-3 rounded-xl min-h-[44px]"
                      >
                        Créer un compte
                      </Link>
                      <button
                        type="button"
                        onClick={() => setShowAccountCta(false)}
                        className="flex-1 text-center border border-line font-semibold py-3 rounded-xl min-h-[44px] text-sm"
                      >
                        Non merci
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2">
                  {draftToken ? (
                    <Link
                      to={`/trip/${draftToken}`}
                      onClick={onClose}
                      className="block text-center bg-primary-500 text-white font-bold py-3 rounded-xl min-h-[48px]"
                    >
                      Retour à mon voyage
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full bg-primary-500 text-white font-bold py-3 rounded-xl min-h-[48px]"
                    >
                      Fermer
                    </button>
                  )}
                  <Link
                    to={
                      draftToken
                        ? `/bookings?draft=${encodeURIComponent(draftToken)}${
                            booking.id
                              ? `&id=${encodeURIComponent(booking.id)}`
                              : ''
                          }`
                        : `/bookings?id=${encodeURIComponent(booking.id)}`
                    }
                    onClick={onClose}
                    className="block text-center border border-line font-bold py-3 rounded-xl hover:bg-slate-50 min-h-[44px]"
                  >
                    Mes réservations
                  </Link>
                </div>
              </div>
            ) : null}

            {step === 'error' ? (
              <div className="space-y-3">
                <p className="text-sm text-red-600">{error || 'Erreur'}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (firstName && lastName && email && bookingId) {
                      setStep('pay')
                      return
                    }
                    if (firstName && lastName && email) {
                      setStep('guests')
                      return
                    }
                    void runRevalidate()
                  }}
                  className="w-full border border-line font-bold py-3 rounded-xl min-h-[48px]"
                >
                  Réessayer
                </button>
              </div>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
