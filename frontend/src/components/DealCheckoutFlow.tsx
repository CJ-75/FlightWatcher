import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { hotelCancelLabel } from '@flightwatcher/shared'
import type {
  DealRevalidateResponse,
  HotelBooking,
  TravelDeal,
} from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { rememberTrip } from '../utils/tripRecovery'
import { PaymentCardMarks } from './PaymentCardMarks'

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

function formatStayDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function LockIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function CheckIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MailIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BoltIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M13 2 4 14h7l-1 8 10-14h-7l0-6z" strokeLinejoin="round" />
    </svg>
  )
}

function TrustPoints() {
  // Cancel deadline lives only in staySummary — avoid repeating it here.
  const items = [
    { icon: <LockIcon className="w-3.5 h-3.5" />, label: 'Tu paies en toute sécurité' },
    { icon: <BoltIcon className="w-3.5 h-3.5" />, label: 'Ta chambre est confirmée tout de suite' },
    { icon: <MailIcon className="w-3.5 h-3.5" />, label: 'Tu reçois ton n° de réservation par email' },
  ]
  return (
    <ul className="space-y-1.5" aria-label="Ce que tu obtiens">
      {items.map((item) => (
        <li
          key={item.label}
          className="flex items-center gap-2.5 text-[12px] sm:text-[13px] font-medium text-slate-700"
        >
          <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
            {item.icon}
          </span>
          <span className="leading-snug">{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

const STEP_ORDER = ['guests', 'pay', 'done'] as const

function CheckoutSteps({ current }: { current: Step }) {
  const active =
    current === 'confirm' || current === 'revalidate'
      ? 'guests'
      : current === 'error' || current === 'pending'
        ? 'pay'
        : current === 'done'
          ? 'done'
          : current === 'pay'
            ? 'pay'
            : 'guests'
  const idx = STEP_ORDER.indexOf(active as (typeof STEP_ORDER)[number])
  const labels = ['Coordonnées', 'Paiement', 'Confirmé']
  return (
    <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Étapes de réservation">
      {labels.map((label, i) => {
        const done = idx > i || (active === 'done' && i <= 2)
        const here = idx === i && active !== 'done'
        return (
          <li key={label} className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {i > 0 ? (
              <span
                className={`hidden sm:block w-6 h-px shrink-0 ${
                  done || here ? 'bg-slate-900' : 'bg-slate-200'
                }`}
                aria-hidden
              />
            ) : null}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold tracking-wide ${
                done
                  ? 'bg-slate-900 text-white'
                  : here
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              <span className="tabular-nums">{i + 1}</span>
              <span className="truncate">{label}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[15px] font-medium text-slate-900 placeholder:text-slate-400 min-h-[48px] shadow-sm transition focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10'

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
  const dealKey =
    draftToken && !String(deal.deal_key || '').startsWith('mytrip-')
      ? `mytrip-${draftToken}`
      : deal.deal_key || deal.id || (draftToken ? `mytrip-${draftToken}` : '')

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
      const body = {
        hotel_id: hotelId || deal.hotel?.id,
        displayed_price_pp: deal.price_per_person,
        draft_token: draftToken || undefined,
      }
      const api = getApiClient()
      const res = draftToken
        ? await api.revalidateMyTripHotel(draftToken, body)
        : await api.revalidateDeal(dealKey, body)
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
  }, [
    deal,
    dealKey,
    draftToken,
    guestMode,
    hotelId,
    onClose,
    onNeedLogin,
    onUnavailable,
    t,
  ])

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
      const baseSnap = (reval.deal_snapshot || deal) as TravelDeal
      const snapHotel = {
        ...(baseSnap.hotel || {}),
        refundable:
          reval.refundable ?? baseSnap.hotel?.refundable ?? null,
        cancel_deadline:
          reval.cancel_deadline ??
          baseSnap.hotel?.cancel_deadline ??
          null,
      }
      const pb = await getApiClient().prebookHotel({
        deal_key: dealKey,
        offer_id: reval.offer_id,
        hotel_id: reval.hotel_id,
        displayed_price: hotelCharge,
        charged_price: hotelCharge,
        margin_pct_used: reval.margin_pct_used,
        ssp_at_booking: reval.ssp_total,
        deal_snapshot: {
          ...baseSnap,
          hotel: snapHotel,
          refundable: snapHotel.refundable,
          cancel_deadline: snapHotel.cancel_deadline,
        } as TravelDeal,
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

  const fees = reval?.excluded_fees ?? deal.price_breakdown?.excluded_fees ?? 0
  const hotelName =
    reval?.hotel_name || deal.hotel?.name || deal.hotel_name || 'Hôtel'
  const dates = deal.dates
  const hotelTotal =
    hotelTotalHint ??
    reval?.public_hotel_price ??
    deal.price_breakdown?.hotel_public_total ??
    null
  const chargeTotal = Math.round(
    Number(prebookMeta?.charged_price ?? reval?.public_hotel_price ?? hotelTotal ?? 0),
  )
  const nightsLabel =
    deal.nights && deal.nights > 0
      ? `${deal.nights} nuit${deal.nights > 1 ? 's' : ''}`
      : null
  const adults = Math.max(1, Number(deal.adults) || 2)
  const canSubmitGuests = Boolean(firstName.trim() && lastName.trim() && email.trim())
  const cancelHotel = {
    refundable:
      reval?.refundable ?? deal.hotel?.refundable ?? null,
    cancel_deadline:
      reval?.cancel_deadline || deal.hotel?.cancel_deadline || null,
  }
  const cancelBadge = hotelCancelLabel(cancelHotel, {
    includeNonRefundable: true,
  })
  const isRefundable = cancelHotel.refundable === true
  const hasCancelDeadline = Boolean(
    cancelHotel.cancel_deadline && isRefundable,
  )

  const staySummary = (
    <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
            Séjour à {deal.city || '—'}
          </p>
          <h3 className="mt-1 text-[17px] sm:text-lg font-extrabold text-slate-900 tracking-tight leading-snug">
            {hotelName}
          </h3>
          {dates?.outbound && dates?.inbound ? (
            <p className="mt-1.5 text-sm text-slate-600">
              {formatStayDate(dates.outbound)}
              <span className="text-slate-300 mx-1.5">→</span>
              {formatStayDate(dates.inbound)}
              {nightsLabel ? (
                <span className="text-slate-400"> · {nightsLabel}</span>
              ) : null}
              <span className="text-slate-400">
                {' '}
                · {adults} voyageur{adults > 1 ? 's' : ''}
              </span>
            </p>
          ) : null}
        </div>
        {hotelTotal != null || chargeTotal > 0 ? (
          <div className="text-right shrink-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Total hôtel
            </p>
            <p className="mt-0.5 text-2xl font-black text-slate-900 tabular-nums tracking-tight">
              {chargeTotal > 0 ? chargeTotal : Math.round(Number(hotelTotal))}&nbsp;€
            </p>
          </div>
        ) : null}
      </div>
      {cancelBadge ? (
        <div
          className={`rounded-xl px-3.5 py-3 ${
            isRefundable
              ? 'bg-emerald-50 border border-emerald-100'
              : 'bg-slate-100 border border-slate-200'
          }`}
        >
          <p
            className={`text-[11px] font-bold uppercase tracking-wide ${
              isRefundable ? 'text-emerald-800/70' : 'text-slate-500'
            }`}
          >
            Conditions d’annulation
          </p>
          <p
            className={`mt-1 text-[13px] font-semibold leading-snug ${
              isRefundable ? 'text-emerald-900' : 'text-slate-700'
            }`}
          >
            {cancelBadge}
          </p>
          {hasCancelDeadline ? (
            <p className="mt-1 text-[11px] text-emerald-800/75 leading-snug">
              Après cette date, les conditions de l’hôtel s’appliquent.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  return (
    <AnimatePresence>
      <motion.div
        className="app-dialog-root"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button
          type="button"
          className="app-dialog-backdrop"
          aria-label="Fermer"
          onClick={onClose}
        />
        <motion.div
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="app-dialog-panel app-dialog-lg max-h-[94vh] overflow-hidden flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-title"
        >
          <header className="shrink-0 border-b border-slate-100 px-5 sm:px-6 pt-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  <LockIcon className="w-3.5 h-3.5 text-slate-400" />
                  Paiement sécurisé
                </p>
                <h2
                  id="checkout-title"
                  className="mt-1 text-xl sm:text-[22px] font-extrabold text-slate-900 tracking-tight"
                >
                  Réserver l’hôtel
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xl leading-none font-medium transition shrink-0"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="mt-4">
              <CheckoutSteps current={step} />
            </div>
            <p className="mt-3 text-[12px] text-slate-500">
              Paiement sécurisé · confirmation immédiate · reçu par email
            </p>
          </header>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-5">
            {step !== 'done' ? staySummary : null}
            {step === 'guests' || step === 'pay' || step === 'confirm' ? (
              <TrustPoints />
            ) : null}

            <AnimatePresence mode="wait">
              {step === 'revalidate' ? (
                <motion.div
                  key="revalidate"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-3 py-10 text-center"
                >
                  <span className="w-9 h-9 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">Vérification de la disponibilité</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Prix et conditions confirmés en direct auprès de l’hôtel.
                    </p>
                  </div>
                </motion.div>
              ) : null}

              {step === 'confirm' && reval ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3.5">
                    <p className="text-sm font-bold text-amber-950">Le tarif a été mis à jour</p>
                    <p className="text-sm text-amber-900/80 mt-1 leading-relaxed">
                      Nouveau total hôtel :{' '}
                      <strong className="tabular-nums">
                        {Math.round(
                          Number(reval.public_hotel_price ?? hotelTotal ?? 0),
                        )}{' '}
                        €
                      </strong>
                      . Confirme pour continuer avec ce prix.
                    </p>
                    {reval.hotel_switched ? (
                      <p className="text-sm text-amber-900 mt-2 font-medium">
                        Hôtel proposé : {reval.hotel_name}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="sm:flex-1 border border-slate-200 font-bold py-3.5 rounded-xl min-h-[48px] text-slate-700 hover:bg-slate-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('guests')}
                      className="sm:flex-[1.4] bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl min-h-[48px]"
                    >
                      Continuer avec ce prix
                    </button>
                  </div>
                </motion.div>
              ) : null}

              {step === 'guests' ? (
                <motion.div
                  key="guests"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                      Titulaire de la réservation
                    </h3>
                    <p className="text-[13px] text-slate-500 mt-1 leading-snug">
                      Nom tel qu’il apparaîtra sur la confirmation hôtel
                      {fees > 0
                        ? ` · taxes de séjour estimées ${Math.round(fees)} € à régler sur place`
                        : ''}
                      .
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Prénom
                        </span>
                        <input
                          className={fieldClass}
                          placeholder="Marie"
                          autoComplete="given-name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Nom
                        </span>
                        <input
                          className={fieldClass}
                          placeholder="Dupont"
                          autoComplete="family-name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                        />
                      </label>
                    </div>
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Email de confirmation
                      </span>
                      <input
                        className={fieldClass}
                        placeholder="marie.dupont@email.com"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <span className="text-[11px] text-slate-400">
                        Le bon de réservation sera envoyé à cette adresse.
                      </span>
                    </label>
                  </div>
                  {guestMode ? (
                    <p className="text-[12px] text-slate-500 leading-relaxed rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
                      Aucun compte requis. Tu pourras retrouver ce voyage via le lien Mon
                      voyage ou Mes réservations.
                    </p>
                  ) : null}
                </motion.div>
              ) : null}

              {step === 'pay' ? (
                <motion.div
                  key="pay"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                      Régler l’hôtel
                    </h3>
                    <p className="text-[13px] text-slate-500 mt-1">
                      Montant débité maintenant :{' '}
                      <strong className="text-slate-800 tabular-nums">{chargeTotal} €</strong>
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                    <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                      <LockIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <p className="text-[12px] font-semibold text-slate-700">
                        Ton paiement est protégé
                      </p>
                    </div>
                    <div ref={payRef} className="min-h-[140px] p-4" />
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3">
                    <PaymentCardMarks />
                    <p className="mt-2 text-center text-[11px] text-slate-500">
                      Tu paies le montant affiché · tu reçois ta confirmation par email
                    </p>
                  </div>
                  {prebookMeta?.liteapi_env === 'sandbox' ? (
                    <button
                      type="button"
                      onClick={() =>
                        void finalizeBook('succeeded', { sandboxSimulate: true })
                      }
                      className="w-full border border-dashed border-slate-300 text-slate-600 font-semibold py-3 rounded-xl min-h-[48px] hover:bg-slate-50 text-sm"
                    >
                      Simuler un paiement réussi (sandbox)
                    </button>
                  ) : null}
                  {!prebookMeta?.payment_public_key &&
                  prebookMeta?.liteapi_env !== 'sandbox' ? (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                      Module de paiement indisponible pour le moment. Réessaie dans un instant.
                    </p>
                  ) : null}
                </motion.div>
              ) : null}

              {step === 'pending' ? (
                <motion.div
                  key="pending"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-3 py-12 text-center"
                >
                  <span className="w-9 h-9 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">Confirmation en cours</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Nous finalisons ta réservation auprès de l’hôtel…
                    </p>
                  </div>
                </motion.div>
              ) : null}

              {step === 'done' && booking ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5"
                >
                  <div className="text-center pt-2 pb-1">
                    <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <CheckIcon className="w-7 h-7" />
                    </div>
                    <h3 className="mt-4 text-xl font-extrabold text-slate-900 tracking-tight">
                      Hôtel réservé
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">{hotelName}</p>
                  </div>

                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-4 space-y-2">
                    {booking.confirmation_code ? (
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800/70">
                          N° de réservation
                        </p>
                        <p className="mt-1 font-mono text-xl font-extrabold text-emerald-950 tracking-wide">
                          {booking.confirmation_code}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600">Statut : {booking.status}</p>
                    )}
                    {email ? (
                      <p className="text-[13px] text-emerald-900/80">
                        Confirmation envoyée à <strong>{email}</strong>
                      </p>
                    ) : null}
                  </div>

                  {staySummary}

                  {showAccountCta && draftToken ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          Retrouve ce voyage partout
                        </p>
                        <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">
                          Optionnel — sans compte, conserve le lien Mon voyage sur cet
                          appareil.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Link
                          to={`/login?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(`/trip/${draftToken}?claim=1`)}`}
                          onClick={() => onAccountCta?.()}
                          className="flex-1 text-center bg-slate-900 text-white font-bold py-3 rounded-xl min-h-[44px]"
                        >
                          Créer un compte
                        </Link>
                        <button
                          type="button"
                          onClick={() => setShowAccountCta(false)}
                          className="flex-1 text-center border border-slate-200 font-semibold py-3 rounded-xl min-h-[44px] text-sm text-slate-600"
                        >
                          Plus tard
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    {draftToken ? (
                      <Link
                        to={`/trip/${draftToken}`}
                        onClick={onClose}
                        className="block text-center bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl min-h-[48px]"
                      >
                        Retour à mon voyage
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={onClose}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl min-h-[48px]"
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
                      className="block text-center border border-slate-200 font-bold py-3 rounded-xl hover:bg-slate-50 min-h-[44px] text-slate-800"
                    >
                      Voir mes réservations
                    </Link>
                  </div>
                </motion.div>
              ) : null}

              {step === 'error' ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3.5">
                    <p className="text-sm font-bold text-red-900">Impossible de finaliser</p>
                    <p className="text-sm text-red-800/80 mt-1 break-words">
                      {error || 'Une erreur est survenue. Réessaie.'}
                    </p>
                  </div>
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
                    className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl min-h-[48px]"
                  >
                    Réessayer
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full border border-slate-200 font-semibold py-3 rounded-xl min-h-[44px] text-slate-600"
                  >
                    Fermer
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {step === 'guests' || step === 'pay' ? (
            <footer className="shrink-0 border-t border-slate-100 bg-white/95 backdrop-blur-sm px-5 sm:px-6 py-4 space-y-3">
              {step === 'guests' ? (
                <>
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
                      className="sm:w-auto px-5 border border-slate-200 font-bold py-3.5 rounded-xl min-h-[48px] text-slate-700 hover:bg-slate-50"
                    >
                      Précédent
                    </button>
                    <button
                      type="button"
                      disabled={!canSubmitGuests}
                      onClick={() => void doPrebook()}
                      className="flex-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3.5 rounded-xl min-h-[48px] transition"
                    >
                      Continuer vers le paiement
                      {hotelTotal != null
                        ? ` · ${Math.round(Number(hotelTotal))} €`
                        : ''}
                    </button>
                  </div>
                  <PaymentCardMarks compact />
                </>
              ) : null}
              {step === 'pay' ? (
                <button
                  type="button"
                  onClick={() => setStep('guests')}
                  className="w-full border border-slate-200 font-bold py-3 rounded-xl min-h-[44px] text-slate-700 hover:bg-slate-50 text-sm"
                >
                  Modifier les coordonnées
                </button>
              ) : null}
            </footer>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
