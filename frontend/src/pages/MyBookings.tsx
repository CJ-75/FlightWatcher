import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  boardLabelFr,
  cityImageUrl,
  formatCancelDeadlineLocal,
  type HotelBooking,
  type HotelBookingStatus,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { getCurrentSession } from '../lib/supabase'
import {
  readBookingsCache,
  writeBookingsCache,
} from '../utils/bookingsCache'
import {
  latestTripDraft,
  listRememberedTrips,
  rememberTrip,
} from '../utils/tripRecovery'
import { SiteFooter } from '../components/SiteFooter'

type FilterTab = 'upcoming' | 'past' | 'all'

function isFailedStatus(status: HotelBookingStatus | string) {
  return status === 'failed'
}

function formatDate(dateStr?: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...opts,
  })
}

function nightsLabel(n?: number | null) {
  if (n == null || n <= 0) return null
  return n === 1 ? '1 nuit' : `${n} nuits`
}

function adultsLabel(n?: number | null) {
  if (n == null || n <= 0) return null
  return n === 1 ? '1 voyageur' : `${n} voyageurs`
}

type StatusMeta = {
  label: string
  hint: string
  chip: string
  tone: 'ok' | 'warn' | 'bad' | 'muted'
}

function statusMeta(status: HotelBookingStatus | string): StatusMeta {
  switch (status) {
    case 'confirmed':
      return {
        label: 'Confirmée',
        hint: 'Ta chambre est réservée chez le fournisseur hôtel.',
        chip: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
        tone: 'ok',
      }
    case 'booking_pending':
    case 'payment_succeeded':
      return {
        label: 'Confirmation en cours',
        hint: 'Paiement reçu — le fournisseur finalise la réservation.',
        chip: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200',
        tone: 'warn',
      }
    case 'payment_pending':
    case 'prebooked':
      return {
        label: 'Paiement à finaliser',
        hint: 'La chambre n’est pas encore garantie.',
        chip: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200',
        tone: 'warn',
      }
    case 'failed':
      return {
        label: 'Échouée',
        hint: 'Aucune réservation active — aucun débit hôtel confirmé.',
        chip: 'bg-red-50 text-red-800 ring-1 ring-red-200',
        tone: 'bad',
      }
    case 'cancelled':
      return {
        label: 'Annulée',
        hint: 'Cette réservation n’est plus active.',
        chip: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
        tone: 'muted',
      }
    default:
      return {
        label: String(status || 'Brouillon'),
        hint: 'Réservation incomplète.',
        chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
        tone: 'muted',
      }
  }
}

function isUpcoming(b: HotelBooking, today: string) {
  if (isFailedStatus(b.status) || b.status === 'cancelled') return false
  const out = b.dates?.outbound
  if (!out) return b.status === 'confirmed' || b.status === 'booking_pending'
  return out >= today
}

function isPast(b: HotelBooking, today: string) {
  if (isFailedStatus(b.status)) return false
  const inn = b.dates?.inbound || b.dates?.outbound
  if (!inn) return false
  return inn < today
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function BookingCard({
  booking,
  expanded,
  onToggle,
}: {
  booking: HotelBooking
  expanded: boolean
  onToggle: () => void
}) {
  const meta = statusMeta(booking.status)
  const board = boardLabelFr(booking.board)
  const cancelLocal = formatCancelDeadlineLocal(booking.cancel_deadline, 'fr-FR')
  const photo =
    booking.hotel_photo ||
    cityImageUrl(booking.city || null) ||
    null
  const [copied, setCopied] = useState<'code' | 'id' | 'summary' | null>(null)

  const nights = nightsLabel(booking.nights)
  const pax = adultsLabel(booking.adults)
  const price =
    booking.charged_price != null
      ? Math.round(Number(booking.charged_price))
      : booking.displayed_price != null
        ? Math.round(Number(booking.displayed_price))
        : null

  const holderName = [booking.holder?.firstName, booking.holder?.lastName]
    .filter(Boolean)
    .join(' ')

  const onCopy = async (kind: 'code' | 'id' | 'summary', value: string) => {
    const ok = await copyText(value)
    if (ok) {
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1800)
    }
  }

  const summaryText = [
    `FlightWatcher — réservation hôtel`,
    meta.label,
    booking.hotel_name || 'Hôtel',
    booking.city ? `à ${booking.city}` : '',
    booking.dates
      ? `${formatDate(booking.dates.outbound)} → ${formatDate(booking.dates.inbound)}`
      : '',
    booking.confirmation_code
      ? `Confirmation hôtel : ${booking.confirmation_code}`
      : '',
    booking.liteapi_booking_id
      ? `Réf. FlightWatcher : ${booking.liteapi_booking_id}`
      : `Réf. interne : ${booking.id}`,
    price != null ? `Montant hôtel : ${price} €` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <li className="bg-white rounded-3xl border border-line shadow-soft overflow-hidden">
      <div className="sm:flex">
        <div className="relative sm:w-44 sm:shrink-0 h-36 sm:h-auto min-h-[9rem] bg-slate-100">
          {photo ? (
            <img
              src={photo}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary-100 to-slate-200" />
          )}
          <span
            className={`absolute top-3 left-3 rounded-full text-[11px] font-bold px-2.5 py-1 ${meta.chip}`}
          >
            {meta.label}
          </span>
        </div>

        <div className="flex-1 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {booking.city || 'Séjour'}
                {booking.hotel_stars ? ` · ${booking.hotel_stars}★` : ''}
                {booking.hotel_rating != null
                  ? ` · ${Number(booking.hotel_rating).toFixed(1)}/10`
                  : ''}
              </p>
              <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight mt-0.5">
                {booking.hotel_name || 'Hôtel'}
              </h2>
              <p className="text-sm text-ink-soft mt-1">
                {formatDate(booking.dates?.outbound)} →{' '}
                {formatDate(booking.dates?.inbound)}
                {nights ? ` · ${nights}` : ''}
                {pax ? ` · ${pax}` : ''}
              </p>
              <p className="text-xs text-muted mt-1.5">{meta.hint}</p>
            </div>
            {price != null ? (
              <div className="text-right shrink-0">
                <p className="text-2xl font-extrabold text-ink tracking-tight">
                  {price}&nbsp;€
                </p>
                <p className="text-[11px] text-muted font-medium">Hôtel payé</p>
              </div>
            ) : null}
          </div>

          {(booking.confirmation_code || booking.liteapi_booking_id) &&
          meta.tone === 'ok' ? (
            <div className="mt-4 rounded-2xl bg-emerald-50/80 border border-emerald-100 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800/80">
                À présenter à l’hôtel
              </p>
              {booking.confirmation_code ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="font-mono text-lg sm:text-xl font-extrabold text-emerald-950 tracking-wide">
                    {booking.confirmation_code}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void onCopy('code', booking.confirmation_code || '')
                    }
                    className="text-xs font-bold text-emerald-800 underline-offset-2 hover:underline"
                  >
                    {copied === 'code' ? 'Copié ✓' : 'Copier'}
                  </button>
                </div>
              ) : null}
              {booking.liteapi_booking_id ? (
                <p className="text-xs text-emerald-900/70 mt-1">
                  Réf. partenaire :{' '}
                  <span className="font-mono font-semibold">
                    {booking.liteapi_booking_id}
                  </span>{' '}
                  <button
                    type="button"
                    onClick={() =>
                      void onCopy('id', booking.liteapi_booking_id || '')
                    }
                    className="font-bold underline-offset-2 hover:underline"
                  >
                    {copied === 'id' ? 'Copié ✓' : 'Copier'}
                  </button>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center rounded-xl border border-line px-3.5 py-2 text-sm font-bold text-ink hover:bg-slate-50 min-h-[40px]"
              aria-expanded={expanded}
            >
              {expanded ? 'Masquer les détails' : 'Voir les détails'}
            </button>
            {booking.draft_token ? (
              <Link
                to={`/trip/${booking.draft_token}`}
                className="inline-flex items-center rounded-xl bg-primary-500 text-white px-3.5 py-2 text-sm font-bold hover:bg-primary-600 min-h-[40px]"
              >
                Mon voyage
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void onCopy('summary', summaryText)}
              className="inline-flex items-center rounded-xl border border-line px-3.5 py-2 text-sm font-semibold text-ink-soft hover:bg-slate-50 min-h-[40px]"
            >
              {copied === 'summary' ? 'Récap copié ✓' : 'Copier le récap'}
            </button>
          </div>

          {expanded ? (
            <div className="mt-5 pt-5 border-t border-line space-y-5">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                  Séjour
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-muted">Arrivée</dt>
                    <dd className="font-semibold text-ink">
                      {formatDate(booking.dates?.outbound, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Départ</dt>
                    <dd className="font-semibold text-ink">
                      {formatDate(booking.dates?.inbound, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </dd>
                  </div>
                  {board ? (
                    <div>
                      <dt className="text-muted">Formule</dt>
                      <dd className="font-semibold text-ink">{board}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted">Annulation</dt>
                    <dd className="font-semibold text-ink">
                      {booking.refundable === true
                        ? cancelLocal
                          ? `Remboursable jusqu’au ${cancelLocal}`
                          : 'Remboursable (voir conditions)'
                        : booking.refundable === false
                          ? 'Non remboursable'
                          : 'Selon conditions du tarif'}
                    </dd>
                  </div>
                  {holderName || booking.holder?.email ? (
                    <div className="sm:col-span-2">
                      <dt className="text-muted">Titulaire</dt>
                      <dd className="font-semibold text-ink">
                        {holderName || '—'}
                        {booking.holder?.email
                          ? ` · ${booking.holder.email}`
                          : ''}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              {(booking.origin || booking.destination || booking.flight_airline) && (
                <section className="rounded-2xl bg-slate-50 border border-line px-4 py-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-1">
                    Vol (séparé)
                  </h3>
                  <p className="text-sm text-ink-soft">
                    {booking.origin && booking.destination
                      ? `${booking.origin} → ${booking.destination}`
                      : 'Itinéraire lié à ce deal'}
                    {booking.flight_airline ? ` · ${booking.flight_airline}` : ''}
                  </p>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">
                    Vol et hôtel sont deux réservations distinctes. Le code ci-dessus
                    concerne uniquement l’hôtel. Présente ta confirmation compagnie
                    séparément à l’aéroport.
                  </p>
                </section>
              )}

              {meta.tone === 'ok' ? (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                    Avant le check-in
                  </h3>
                  <ul className="space-y-2 text-sm text-ink-soft">
                    <li className="flex gap-2">
                      <span className="text-emerald-600 font-bold" aria-hidden>
                        ✓
                      </span>
                      <span>
                        Garde le code{' '}
                        <strong className="text-ink">
                          {booking.confirmation_code || 'de confirmation'}
                        </strong>{' '}
                        (écran ou e-mail) pour la réception.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-600 font-bold" aria-hidden>
                        ✓
                      </span>
                      <span>
                        Pièce d’identité du titulaire{' '}
                        {holderName ? (
                          <>
                            (<strong className="text-ink">{holderName}</strong>)
                          </>
                        ) : null}{' '}
                        à présenter.
                      </span>
                    </li>
                    {booking.excluded_fees != null &&
                    Number(booking.excluded_fees) > 0 ? (
                      <li className="flex gap-2">
                        <span className="text-amber-600 font-bold" aria-hidden>
                          !
                        </span>
                        <span>
                          Taxe de séjour estimée ~{' '}
                          {Math.round(Number(booking.excluded_fees))}&nbsp;€ à régler
                          sur place (hors montant payé ici).
                        </span>
                      </li>
                    ) : (
                      <li className="flex gap-2">
                        <span className="text-muted font-bold" aria-hidden>
                          ·
                        </span>
                        <span>
                          Une taxe de séjour locale peut être demandée à l’hôtel.
                        </span>
                      </li>
                    )}
                  </ul>
                </section>
              ) : null}

              {meta.tone === 'warn' ? (
                <section className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-950">
                  <p className="font-bold">Pas encore garantie</p>
                  <p className="mt-1 text-amber-900/80">
                    Recharge cette page dans quelques minutes. Si le statut ne passe
                    pas à « Confirmée », contacte-nous avec la référence interne
                    ci-dessous — on vérifiera côté fournisseur.
                  </p>
                </section>
              ) : null}

              {meta.tone === 'bad' ? (
                <section className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-950">
                  <p className="font-bold">Réservation non aboutie</p>
                  <p className="mt-1 text-red-900/80">
                    Aucune chambre n’a été confirmée. Tu peux relancer depuis ton
                    voyage ou un deal. En cas de débit inattendu, écris-nous avec
                    la référence interne.
                  </p>
                </section>
              ) : null}

              <section className="text-xs text-muted space-y-1">
                <p>
                  Réf. interne :{' '}
                  <span className="font-mono text-ink-soft">{booking.id}</span>
                </p>
                {booking.created_at ? (
                  <p>
                    Créée le{' '}
                    {new Date(booking.created_at).toLocaleString('fr-FR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                ) : null}
                <p>
                  Besoin d’aide ?{' '}
                  <a
                    href={`mailto:hello@flightwatcher.app?subject=${encodeURIComponent(
                      `Réservation ${booking.confirmation_code || booking.id}`,
                    )}`}
                    className="font-semibold text-primary-600 hover:underline"
                  >
                    hello@flightwatcher.app
                  </a>
                </p>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export default function MyBookings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('id')
  const draftFromUrl = searchParams.get('draft')
  const guestDraft = useMemo(
    () => draftFromUrl || latestTripDraft(),
    [draftFromUrl],
  )
  const remembered = useMemo(() => listRememberedTrips(), [])
  const cached = useMemo(() => readBookingsCache(), [])
  const [bookings, setBookings] = useState<HotelBooking[]>(() => cached || [])
  const [loading, setLoading] = useState(() => !cached)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authed, setAuthed] = useState(true)
  const [guestMode, setGuestMode] = useState(
    () => Boolean(draftFromUrl || latestTripDraft()),
  )
  const [tab, setTab] = useState<FilterTab>('upcoming')
  const [expandedId, setExpandedId] = useState<string | null>(focusId)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const load = useCallback(async (opts?: { background?: boolean }) => {
    const background = Boolean(opts?.background)
    if (background) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const session = await getCurrentSession()
      const draft = draftFromUrl || latestTripDraft()

      if (session?.user) {
        setAuthed(true)
        setGuestMode(false)
        if (draft) {
          try {
            await getApiClient().claimMyTrip(draft)
          } catch {
            /* already claimed / expired */
          }
        }
        const list = await getApiClient().listHotelBookings(
          draft ? { draft_token: draft } : undefined,
        )
        const next = Array.isArray(list) ? list : []
        setBookings(next)
        writeBookingsCache(next)
        return
      }

      setAuthed(false)
      if (!draft) {
        setGuestMode(false)
        setBookings([])
        writeBookingsCache([])
        return
      }

      setGuestMode(true)
      const list = await getApiClient().listHotelBookings({ draft_token: draft })
      const next = Array.isArray(list) ? list : []
      setBookings(next)
      for (const b of next) {
        if (b.draft_token) {
          rememberTrip({
            draft_token: b.draft_token,
            booking_id: b.id,
            city: b.city,
          })
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      if (!background) setBookings([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [draftFromUrl])

  useEffect(() => {
    // Cache → paint now; always revalidate in background
    void load({ background: Boolean(cached?.length) })
  }, [load, cached])

  useEffect(() => {
    if (focusId) setExpandedId(focusId)
  }, [focusId])

  const counts = useMemo(() => {
    const upcoming = bookings.filter((b) => isUpcoming(b, today)).length
    const past = bookings.filter((b) => isPast(b, today)).length
    return { upcoming, past, all: bookings.length }
  }, [bookings, today])

  const filtered = useMemo(() => {
    if (tab === 'all') return bookings
    if (tab === 'past') return bookings.filter((b) => isPast(b, today))
    return bookings.filter((b) => isUpcoming(b, today))
  }, [bookings, tab, today])

  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <p className="app-kicker mb-1">Compte</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              Mes réservations
            </h1>
            <p className="text-sm text-muted mt-1 max-w-md">
              Preuves d’hôtel, codes de confirmation et prochaines étapes — pour
              arriver serein à la réception.
            </p>
            {refreshing ? (
              <p className="text-xs text-muted mt-1.5" aria-live="polite">
                Mise à jour…
              </p>
            ) : null}
          </div>
          <Link
            to="/vols"
            className="text-sm font-bold text-primary-600 hover:underline shrink-0 pt-1"
          >
            ← Accueil
          </Link>
        </div>

        {!authed && !guestMode ? (
          <div className="bg-white rounded-3xl border border-line shadow-soft p-8 text-center space-y-4">
            <div>
              <p className="font-bold text-ink mb-2">Connexion requise</p>
              <p className="text-sm text-muted mb-4">
                Connecte-toi pour retrouver tes confirmations hôtel sur tous tes
                appareils — ou ouvre le lien Mon voyage reçu après réservation.
              </p>
              <Link
                to={`/login?redirect=${encodeURIComponent(
                  guestDraft ? `/bookings?draft=${guestDraft}` : '/bookings',
                )}`}
                className="inline-flex app-btn-primary rounded-2xl px-5 py-2.5 text-sm"
              >
                Se connecter
              </Link>
            </div>
            {remembered.length ? (
              <div className="text-left border-t border-line pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                  Voyages récents sur cet appareil
                </p>
                <ul className="space-y-2">
                  {remembered.slice(0, 5).map((t) => (
                    <li key={t.draft_token}>
                      <Link
                        to={`/bookings?draft=${encodeURIComponent(t.draft_token)}`}
                        className="block rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50"
                      >
                        {t.city ? `Voyage à ${t.city}` : 'Mon voyage'}
                        <span className="block text-xs font-medium text-muted mt-0.5">
                          Ouvrir les réservations
                        </span>
                      </Link>
                      <Link
                        to={`/trip/${t.draft_token}`}
                        className="inline-block mt-1 text-xs font-bold text-primary-600 hover:underline"
                      >
                        Voir le trip →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Chargement">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-40 rounded-3xl bg-white border border-line animate-pulse"
              />
            ))}
          </div>
        ) : error && bookings.length === 0 ? (
          <div className="bg-white rounded-3xl border border-line p-6">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="text-sm font-bold text-primary-600"
            >
              Réessayer
            </button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-3xl border border-line shadow-soft p-8 text-center space-y-4">
            <p className="font-extrabold text-ink text-lg">Aucune réservation encore</p>
            <p className="text-sm text-muted max-w-sm mx-auto leading-relaxed">
              Quand tu réserves un hôtel depuis un deal ou Mon voyage, la
              confirmation et le code apparaissent ici.
            </p>
            {guestMode && guestDraft ? (
              <Link
                to={`/trip/${guestDraft}`}
                className="inline-flex justify-center app-btn-primary rounded-2xl px-5 py-2.5 text-sm"
              >
                Retour à mon voyage
              </Link>
            ) : null}
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
              <Link
                to="/sejours"
                className="inline-flex justify-center app-btn-primary rounded-2xl px-5 py-2.5 text-sm"
              >
                Voir les deals
              </Link>
              <Link
                to="/vols"
                className="inline-flex justify-center rounded-2xl border border-line px-5 py-2.5 text-sm font-bold text-ink hover:bg-slate-50"
              >
                Rechercher un vol
              </Link>
            </div>
          </div>
        ) : (
          <>
            {guestMode && guestDraft ? (
              <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p>
                  Affichage via ton voyage (sans compte).{' '}
                  <Link
                    to={`/trip/${guestDraft}`}
                    className="font-bold underline-offset-2 hover:underline"
                  >
                    Ouvrir Mon voyage
                  </Link>
                </p>
                <Link
                  to={`/login?redirect=${encodeURIComponent(
                    `/bookings?draft=${guestDraft}`,
                  )}`}
                  className="shrink-0 font-bold text-amber-900 underline-offset-2 hover:underline"
                >
                  Sauver sur mon compte →
                </Link>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div
                className="inline-flex rounded-2xl border border-line bg-white p-1 text-sm font-bold"
                role="tablist"
                aria-label="Filtrer les réservations"
              >
                {(
                  [
                    ['upcoming', 'À venir', counts.upcoming],
                    ['past', 'Passées', counts.past],
                    ['all', 'Toutes', counts.all],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={`rounded-xl px-3 py-1.5 min-h-[36px] transition ${
                      tab === key
                        ? 'bg-primary-500 text-white'
                        : 'text-ink-soft hover:bg-slate-50'
                    }`}
                  >
                    {label}
                    <span className="ml-1 opacity-80 font-semibold">{count}</span>
                  </button>
                ))}
              </div>
              {confirmedCount > 0 ? (
                <p className="text-xs text-muted">
                  {confirmedCount} confirmée{confirmedCount > 1 ? 's' : ''}
                </p>
              ) : null}
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-3xl border border-line p-6 text-center">
                <p className="text-sm text-muted">
                  Aucune réservation dans cet onglet.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('all')}
                  className="mt-2 text-sm font-bold text-primary-600"
                >
                  Voir toutes
                </button>
              </div>
            ) : (
              <ul className="space-y-4">
                {filtered.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    expanded={expandedId === b.id}
                    onToggle={() => {
                      const next = expandedId === b.id ? null : b.id
                      setExpandedId(next)
                      if (next) {
                        setSearchParams({ id: next }, { replace: true })
                      } else {
                        setSearchParams({}, { replace: true })
                      }
                    }}
                  />
                ))}
              </ul>
            )}

          </>
        )}

        <SiteFooter />
      </div>
    </div>
  )
}
