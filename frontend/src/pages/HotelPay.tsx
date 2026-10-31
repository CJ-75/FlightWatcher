/**
 * Minimal LiteAPI payment page for mobile WebView.
 * Query: booking_id, public_key, secret_key, draft_token?, firstName, lastName, email, env?
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getApiClient } from '../utils/apiClient'

declare global {
  interface Window {
    LiteAPIPayment?: {
      init: (opts: Record<string, unknown>) => { mount?: (el: HTMLElement) => void }
    }
    ReactNativeWebView?: { postMessage: (msg: string) => void }
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

function postToApp(payload: Record<string, unknown>) {
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify(payload))
  } catch {
    /* browser preview */
  }
  try {
    window.parent?.postMessage(payload, '*')
  } catch {
    /* ignore */
  }
}

export default function HotelPay() {
  const [params] = useSearchParams()
  const payRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  const bookingId = params.get('booking_id') || ''
  const publicKey = params.get('public_key') || ''
  const secretKey = params.get('secret_key') || ''
  const draftToken = params.get('draft_token') || ''
  const firstName = params.get('firstName') || ''
  const lastName = params.get('lastName') || ''
  const email = params.get('email') || ''
  const liteapiEnv = (params.get('env') || '').toLowerCase()
  const isSandbox = liteapiEnv === 'sandbox'

  const finalizeBook = useCallback(
    async (opts?: { sandboxSimulate?: boolean }) => {
      if (!bookingId || !firstName || !lastName || !email) {
        setError('Coordonnées manquantes')
        return
      }
      setPending(true)
      setError(null)
      try {
        let booked = await getApiClient().bookHotel(bookingId, {
          holder: { firstName, lastName, email },
          guests: [{ firstName, lastName, email, occupancyNumber: 1 }],
          payment_status: 'succeeded',
          draft_token: draftToken || undefined,
          sandbox_simulate: opts?.sandboxSimulate || undefined,
        })
        if (booked.status === 'booking_pending') {
          await new Promise((r) => setTimeout(r, 1500))
          booked = await getApiClient().getHotelBooking(bookingId, {
            draft_token: draftToken || undefined,
          })
        }
        if (draftToken) {
          try {
            await getApiClient().markMyTripHotelBooked(draftToken, {
              booking_id: booked.id || bookingId,
              confirmation_code: booked.confirmation_code || null,
              holder_email: email,
            })
          } catch {
            /* best-effort */
          }
        }
        setDone(true)
        postToApp({
          type: 'booked',
          booking_id: booked.id || bookingId,
          confirmation_code: booked.confirmation_code || booked.status,
          draft_token: draftToken || null,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erreur paiement'
        setError(msg)
        postToApp({ type: 'error', message: msg })
      } finally {
        setPending(false)
      }
    },
    [bookingId, draftToken, email, firstName, lastName],
  )

  useEffect(() => {
    if (!bookingId || !publicKey || !secretKey || done) return
    let cancelled = false
    ;(async () => {
      try {
        await loadPaymentScript()
        if (cancelled || !payRef.current || !window.LiteAPIPayment) return
        payRef.current.innerHTML = ''
        const widget = window.LiteAPIPayment.init({
          publicKey,
          secretKey,
          appearance: { theme: 'stripe' },
          onSuccess: async () => {
            await finalizeBook()
          },
        })
        widget.mount?.(payRef.current)
        postToApp({ type: 'ready' })
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Impossible de charger le paiement',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookingId, publicKey, secretKey, done, finalizeBook])

  if (!bookingId || !publicKey || !secretKey) {
    return (
      <div className="min-h-screen bg-[#FFF9F5] flex items-center justify-center p-6">
        <p className="text-sm text-slate-600">Lien de paiement invalide.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FFF9F5] text-slate-900">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[#FF6B35]">
          FlightWatcher
        </p>
        <h1 className="text-xl font-extrabold tracking-tight">Payer ta chambre</h1>
        <p className="text-sm text-slate-500">
          Paiement sécurisé pour l’hôtel. Ton vol se réserve à part, sur le site de
          la compagnie.
        </p>

        {done ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="font-bold text-emerald-900">Chambre confirmée</p>
            <p className="text-sm text-emerald-800 mt-1">Tu peux fermer cet écran.</p>
          </div>
        ) : (
          <>
            <div
              ref={payRef}
              className="rounded-2xl border border-slate-200 bg-white p-3 min-h-[180px]"
            />
            {pending ? (
              <p className="text-sm text-slate-500 text-center">On confirme ta chambre…</p>
            ) : null}
            {isSandbox ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void finalizeBook({ sandboxSimulate: true })}
                className="w-full min-h-[48px] rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800 disabled:opacity-50"
              >
                Simuler un paiement réussi (sandbox)
              </button>
            ) : null}
          </>
        )}

        {error ? (
          <p className="text-sm font-medium text-red-600 text-center">{error}</p>
        ) : null}
      </div>
    </div>
  )
}
