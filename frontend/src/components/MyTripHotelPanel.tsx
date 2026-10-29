import { useEffect, useMemo, useState } from 'react'
import { boardLabelFr, type HotelGuestReview } from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { HotelPhotoGallery } from './HotelPhotoGallery'
import { PaymentCardMarks } from './PaymentCardMarks'

type HotelLike = Record<string, unknown>

type Props = {
  hotel: HotelLike
  hotelId: string | null
  cityLabel: string
  nights: number
  adults: number
  hotelTotal: number
  outLabel: string
  retLabel: string
  cancelLabel: string | null
  booked: boolean
  checkoutLoading?: boolean
  onBook: () => void
  onChangeHotel?: () => void
}

function htmlToPlainText(raw: string): string {
  let s = String(raw || '').trim()
  if (!s) return ''
  s = s.replace(/<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|section|article)[^>]*>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea')
    el.innerHTML = s
    s = el.value
  }
  return s
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

function ratingLabel(rating?: number | null) {
  if (rating == null || Number.isNaN(Number(rating))) return null
  const r = Number(rating)
  if (r >= 9) return 'Exceptionnel'
  if (r >= 8.5) return 'Excellent'
  if (r >= 8) return 'Très bien'
  if (r >= 7) return 'Bien'
  return 'Correct'
}

function scoreToHalfStars5(scoreOutOf10?: number | null): number | null {
  if (scoreOutOf10 == null || Number.isNaN(Number(scoreOutOf10))) return null
  const n = Math.min(10, Math.max(0, Number(scoreOutOf10)))
  return Math.round((n / 10) * 5 * 2) / 2
}

function ReviewStars({ score }: { score?: number | null }) {
  const stars = scoreToHalfStars5(score)
  if (stars == null) return null
  const full = Math.floor(stars)
  const half = stars - full >= 0.5
  const empty = 5 - full - (half ? 1 : 0)
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${stars}/5`}>
      {Array.from({ length: full }, (_, i) => (
        <span key={`f${i}`} className="text-[13px] leading-none" aria-hidden>
          ★
        </span>
      ))}
      {half ? (
        <span className="relative inline-block w-[13px] h-[13px] text-[13px] leading-none" aria-hidden>
          <span className="absolute inset-0 text-slate-300">★</span>
          <span className="absolute inset-0 overflow-hidden w-[50%] text-amber-500">★</span>
        </span>
      ) : null}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e${i}`} className="text-[13px] leading-none text-slate-300" aria-hidden>
          ★
        </span>
      ))}
    </span>
  )
}

function formatReviewDate(raw?: string | null) {
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatReviewCountry(raw?: string | null) {
  if (!raw) return null
  const s = String(raw).trim()
  if (/^[a-z]{2}$/i.test(s)) {
    try {
      return new Intl.DisplayNames(['fr'], { type: 'region' }).of(s.toUpperCase()) || s.toUpperCase()
    } catch {
      return s.toUpperCase()
    }
  }
  return s
}

function formatReviewType(raw?: string | null) {
  if (!raw) return null
  const t = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_')
  const map: Record<string, string> = {
    couple: 'En couple',
    family: 'En famille',
    family_with_children: 'En famille',
    solo: 'Solo',
    solo_traveller: 'Solo',
    business: 'Affaires',
    group: 'Entre amis',
    friends: 'Entre amis',
  }
  return map[t] || t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ')
}

function reviewMeta(r: HotelGuestReview) {
  return [
    r.name?.trim(),
    formatReviewCountry(r.country),
    formatReviewType(r.type),
    formatReviewDate(r.date),
  ]
    .filter(Boolean)
    .join(' · ')
}

function StationIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4" y="3" width="16" height="14" rx="2" />
      <path d="M4 11h16M12 3v8M8 21h8" />
      <circle cx="8" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function PinIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10z" />
      <circle cx="12" cy="11" r="2" />
    </svg>
  )
}

function StarRow({ stars }: { stars?: number | null }) {
  const n = Math.min(5, Math.max(0, Math.round(Number(stars) || 0)))
  if (!n) return null
  return (
    <span className="text-amber-500 tracking-tight" aria-label={`${n} étoiles`}>
      {'★'.repeat(n)}
    </span>
  )
}

function offerChips(hotel: HotelLike, facilities: string[]) {
  const out: { key: string; label: string; tone: 'in' | 'opt' | 'neu' }[] = []
  const board = boardLabelFr(
    hotel.board != null ? String(hotel.board) : null,
  )
  const code = String(hotel.board || '').toUpperCase()
  const hasBf = facilities.some((f) => /petit|breakfast/i.test(f))

  if (
    board === 'Petit-déjeuner inclus' ||
    ['BI', 'BB', 'BDI', 'BLI'].includes(code)
  ) {
    out.push({ key: 'bf', label: 'Petit-déjeuner inclus', tone: 'in' })
  } else if (board === 'Demi-pension' || code === 'HB') {
    out.push({ key: 'hb', label: 'Demi-pension', tone: 'in' })
  } else if (board === 'Pension complète' || code === 'FB') {
    out.push({ key: 'fb', label: 'Pension complète', tone: 'in' })
  } else if (board === 'All inclusive' || code === 'AI') {
    out.push({ key: 'ai', label: 'All inclusive', tone: 'in' })
  } else if (board === 'Chambre seule' || code === 'RO') {
    out.push({ key: 'ro', label: 'Chambre seule', tone: 'neu' })
    if (hasBf) out.push({ key: 'bf-opt', label: 'Petit-déj. en option', tone: 'opt' })
  } else if (board) {
    out.push({ key: 'board', label: board, tone: 'in' })
  } else if (hasBf) {
    out.push({ key: 'bf-h', label: 'Petit-déj. à l’hôtel', tone: 'opt' })
  }

  if (hotel.refundable === true) {
    out.push({ key: 'flex', label: 'Annulation flexible', tone: 'in' })
  }
  return out
}

export function MyTripHotelPanel({
  hotel,
  hotelId,
  cityLabel,
  nights,
  adults,
  hotelTotal,
  outLabel,
  retLabel,
  cancelLabel,
  booked,
  checkoutLoading,
  onBook,
  onChangeHotel,
}: Props) {
  const name = String(hotel.name || 'Hôtel')
  const seedPhoto = String(hotel.photo || hotel.thumbnail || '')
  const rating = hotel.rating != null ? Number(hotel.rating) : null
  const reviewCount =
    hotel.review_count != null ? Number(hotel.review_count) : null
  const stars = hotel.stars != null ? Number(hotel.stars) : null
  const distanceM = hotel.distance_m != null ? Number(hotel.distance_m) : null
  const stationName =
    typeof hotel.station_name === 'string' ? hotel.station_name : null
  const stationDist =
    hotel.station_distance_m != null ? Number(hotel.station_distance_m) : null
  const stations = Array.isArray(hotel.stations)
    ? (hotel.stations as { name: string; distance_m: number }[])
    : []

  const [description, setDescription] = useState<string | null>(null)
  const [facilities, setFacilities] = useState<string[]>([])
  const [address, setAddress] = useState<string | null>(null)
  const [checkinTime, setCheckinTime] = useState<string | null>(null)
  const [checkoutTime, setCheckoutTime] = useState<string | null>(null)
  const [reviews, setReviews] = useState<HotelGuestReview[]>([])
  const [reviewsExpanded, setReviewsExpanded] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)

  useEffect(() => {
    const id = (hotelId || '').trim()
    if (!id) return
    let cancelled = false
    setReviewsExpanded(false)
    setDescExpanded(false)
    const api = getApiClient()
    void api
      .getHotelGallery(id, { language: 'fr', fallback: seedPhoto || undefined })
      .then((g) => {
        if (cancelled) return
        const d =
          typeof g.description === 'string' ? htmlToPlainText(g.description) : ''
        setDescription(d || null)
        setFacilities(
          Array.isArray(g.facilities)
            ? g.facilities.filter((x): x is string => Boolean(x && String(x).trim()))
            : [],
        )
        setAddress(
          typeof g.address === 'string' && g.address.trim() ? g.address.trim() : null,
        )
        setCheckinTime(
          typeof g.checkin_time === 'string' && g.checkin_time.trim()
            ? g.checkin_time.trim()
            : null,
        )
        setCheckoutTime(
          typeof g.checkout_time === 'string' && g.checkout_time.trim()
            ? g.checkout_time.trim()
            : null,
        )
      })
      .catch(() => undefined)
    void api
      .getHotelReviews(id, { language: 'fr', limit: 10 })
      .then((r) => {
        if (cancelled) return
        setReviews(Array.isArray(r.reviews) ? r.reviews.slice(0, 10) : [])
      })
      .catch(() => {
        if (!cancelled) setReviews([])
      })
    return () => {
      cancelled = true
    }
  }, [hotelId, seedPhoto])

  const chips = useMemo(() => offerChips(hotel, facilities), [hotel, facilities])
  const amenityExtra = useMemo(() => {
    const skip = new Set(chips.map((c) => c.label))
    const out: string[] = []
    for (const f of facilities) {
      if (skip.has(f) || /petit|breakfast|annulation|pension|inclusive/i.test(f))
        continue
      out.push(f)
      if (out.length >= 6) break
    }
    return out
  }, [chips, facilities])

  const visibleReviews = reviewsExpanded ? reviews : reviews.slice(0, 5)
  const rLabel = ratingLabel(rating)
  const distLabel =
    distanceM != null && !Number.isNaN(distanceM)
      ? distanceM < 1000
        ? `${Math.round(distanceM)} m du centre`
        : `${(distanceM / 1000).toFixed(1)} km du centre`
      : null
  const stationLabel =
    stationName && stationDist != null && !Number.isNaN(stationDist)
      ? `${stationDist < 1000 ? `${Math.round(stationDist)} m` : `${(stationDist / 1000).toFixed(1)} km`} · ${stationName}`
      : null

  return (
    <div className="space-y-4">
      {/* Gallery */}
      {hotelId || seedPhoto ? (
        <HotelPhotoGallery
          embedded
          hotelId={hotelId}
          seedPhoto={seedPhoto || null}
          alt={name}
          hotelName={name}
          cityLabel={cityLabel || undefined}
        />
      ) : null}

      {/* Identity + price (conversion) */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-snug">
            {name}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
            <StarRow stars={stars} />
            {rating != null ? (
              <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                <span className="rounded-md bg-slate-900 text-white text-[10px] font-black tabular-nums px-1.5 py-0.5">
                  {rating.toFixed(1)}
                </span>
                {rLabel || 'Note'}
                {reviewCount != null && reviewCount > 0
                  ? ` · ${reviewCount.toLocaleString('fr-FR')} avis`
                  : ''}
              </span>
            ) : null}
          </div>
          {(distLabel || stationLabel || cityLabel) && (
            <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-slate-500">
              {distLabel ? (
                <span className="inline-flex items-center gap-1">
                  <PinIcon className="w-3 h-3 text-slate-400" />
                  {distLabel}
                </span>
              ) : cityLabel ? (
                <span className="inline-flex items-center gap-1">
                  <PinIcon className="w-3 h-3 text-slate-400" />
                  {cityLabel}
                </span>
              ) : null}
              {stationLabel ? (
                <span className="inline-flex items-center gap-1 min-w-0">
                  <StationIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">{stationLabel}</span>
                </span>
              ) : null}
            </div>
          )}
        </div>
        {hotelTotal > 0 ? (
          <div className="text-right shrink-0 pt-0.5">
            <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">
              {Math.round(hotelTotal)}€
            </p>
            <p className="text-[10px] font-semibold text-slate-400 mt-1">
              séjour
              {nights > 0 ? ` · ${nights} nuit${nights > 1 ? 's' : ''}` : ''}
            </p>
            {adults > 1 ? (
              <p className="text-[10px] font-bold text-slate-600 mt-0.5 tabular-nums">
                {Math.round(hotelTotal / adults)} € / pers.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Stay + formule */}
      <div className="rounded-2xl bg-slate-50 px-3 py-2.5 space-y-2.5">
        <p className="text-[12px] font-semibold text-slate-800">
          {[outLabel, retLabel].filter(Boolean).join(' → ')}
          {nights > 0 ? ` · ${nights} nuit${nights > 1 ? 's' : ''}` : ''}
          {adults > 0 ? ` · ${adults} voy.` : ''}
        </p>
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c.key}
                className={`inline-flex items-center rounded-lg px-2 py-1.5 text-[11px] font-bold border ${
                  c.tone === 'in'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                    : c.tone === 'opt'
                      ? 'bg-amber-50 text-amber-900 border-amber-100'
                      : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                {c.label}
              </span>
            ))}
          </div>
        ) : null}
        {cancelLabel ? (
          <p
            className={`text-[11px] font-semibold ${
              hotel.refundable === false ? 'text-slate-700' : 'text-emerald-700'
            }`}
          >
            {cancelLabel}
          </p>
        ) : null}
        {(checkinTime || checkoutTime) && (
          <p className="text-[11px] text-slate-500">
            {[
              checkinTime ? `Arrivée ${checkinTime}` : null,
              checkoutTime ? `Départ ${checkoutTime}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>

      {amenityExtra.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {amenityExtra.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
            >
              <span className="text-[#FF385C]" aria-hidden>
                ✓
              </span>
              {a}
            </span>
          ))}
        </div>
      ) : null}

      {description ? (
        <div>
          <p className="text-xs font-extrabold text-slate-900 tracking-wide uppercase mb-1.5">
            À propos
          </p>
          <p
            className={`text-[12px] text-slate-600 leading-relaxed whitespace-pre-line ${
              descExpanded ? '' : 'line-clamp-3'
            }`}
          >
            {description}
          </p>
          {description.length > 160 ? (
            <button
              type="button"
              onClick={() => setDescExpanded((v) => !v)}
              className="mt-1 text-[11px] font-bold text-primary-700 hover:underline underline-offset-2 min-h-[36px]"
            >
              {descExpanded ? 'Réduire' : 'Lire la suite'}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Location */}
      {(address || stations.length > 0 || stationLabel) && (
        <div>
          <p className="text-xs font-extrabold text-slate-900 tracking-wide uppercase mb-1.5">
            Emplacement
          </p>
          {address ? (
            <p className="text-[11px] text-slate-600 mb-1.5">
              {address}
              {cityLabel ? `, ${cityLabel}` : ''}
            </p>
          ) : null}
          {(stations.length > 0 ? stations.slice(0, 2) : stationLabel
            ? [{ name: stationName || '', distance_m: stationDist || 0 }]
            : []
          ).map((s, idx) => {
            const n = Number(s.distance_m)
            const dist =
              n < 1000 ? `${Math.round(n)} m` : `${(n / 1000).toFixed(1)} km`
            return (
              <p
                key={`${s.name}-${idx}`}
                className="flex items-center gap-2 text-[11px] text-slate-600 mb-1"
              >
                <span className="inline-flex w-6 h-6 items-center justify-center rounded-md bg-slate-900 text-white">
                  <StationIcon className="w-3 h-3" />
                </span>
                <span>
                  <span className="font-bold text-slate-900">{dist}</span>
                  {' · '}
                  {s.name}
                  {idx === 0 ? (
                    <span className="text-slate-400"> · gare principale</span>
                  ) : null}
                </span>
              </p>
            )
          })}
        </div>
      )}

      {/* Reviews */}
      {reviews.length > 0 ? (
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-baseline justify-between gap-2 mb-2.5">
            <p className="text-xs font-extrabold text-slate-900 tracking-wide uppercase">
              Avis
            </p>
            {reviewCount != null && reviewCount > 0 ? (
              <p className="text-[10px] font-semibold text-slate-400 tabular-nums">
                {reviewCount.toLocaleString('fr-FR')} avis
              </p>
            ) : null}
          </div>
          <ul className="space-y-2">
            {visibleReviews.map((r, i) => {
              const meta = reviewMeta(r)
              const excerpt = r.pros || r.text || r.headline || r.cons || ''
              return (
                <li
                  key={`${r.name || 'avis'}-${r.date || i}`}
                  className="rounded-2xl bg-slate-50 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <ReviewStars score={r.score} />
                    {meta ? (
                      <p className="text-[10px] text-slate-400 truncate min-w-0">{meta}</p>
                    ) : null}
                  </div>
                  {excerpt ? (
                    <p
                      className={`text-[11px] text-slate-700 leading-relaxed mt-1.5 ${
                        reviewsExpanded ? '' : 'line-clamp-2'
                      }`}
                    >
                      {excerpt}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {reviews.length > 5 ? (
            <button
              type="button"
              onClick={() => setReviewsExpanded((v) => !v)}
              className="mt-2.5 w-full rounded-xl border border-slate-200 bg-white py-2.5 min-h-[44px] text-[12px] font-bold text-slate-800"
            >
              {reviewsExpanded
                ? 'Voir moins'
                : `Voir plus · ${reviews.length - 5} avis`}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Payment conversion block */}
      {!booked ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-sm">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Total hôtel
              </p>
              <p className="text-2xl font-black text-slate-900 tabular-nums leading-none mt-1">
                {hotelTotal > 0 ? `${Math.round(hotelTotal)} €` : '—'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {nights > 0 ? `${nights} nuit${nights > 1 ? 's' : ''}` : 'Séjour'}
                {adults > 1 ? ` · ${adults} voyageurs` : ''}
                {adults > 1 && hotelTotal > 0
                  ? ` · ${Math.round(hotelTotal / adults)} €/pers.`
                  : ''}
              </p>
            </div>
            {cancelLabel && hotel.refundable !== false ? (
              <p className="text-[10px] font-bold text-emerald-700 text-right max-w-[40%] leading-snug">
                {cancelLabel}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={checkoutLoading}
            onClick={onBook}
            className="w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl min-h-[52px] disabled:opacity-60 text-[15px]"
          >
            {checkoutLoading
              ? '…'
              : hotelTotal > 0
                ? `Payer l’hôtel · ${Math.round(hotelTotal)} €`
                : 'Payer l’hôtel'}
          </button>
          <PaymentCardMarks />
          <p className="text-[10px] text-center text-slate-400 leading-snug">
            Paiement sécurisé · confirmation immédiate
          </p>
          {onChangeHotel ? (
            <button
              type="button"
              onClick={onChangeHotel}
              className="w-full text-center text-sm font-semibold text-slate-600 underline-offset-2 hover:underline py-1.5 min-h-[40px]"
            >
              Changer d’hôtel
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
