/**
 * Fiche activité (lightbox) — compacte sur web, galerie + infos + CTAs.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  activityDetailFromCard,
  toActivityDetailModel,
  type ActivityCardModel,
  type ActivityDetailModel,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { HotelPhotoGallery } from './HotelPhotoGallery'
import { RatingStars } from './RatingStars'

type Props = {
  card: ActivityCardModel
  adults?: number
  liked?: boolean
  addBusy?: boolean
  /** Hide “Au planner” when already in the trip. */
  alreadyAdded?: boolean
  addLabel: string
  onToggleLike?: () => void
  onBook: () => void
  onAdd: () => void
  onClose: () => void
}

function HeartSvg({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function CloseSvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  )
}

export function ActivityDetailSheet({
  card,
  adults = 2,
  liked = false,
  addBusy = false,
  alreadyAdded = false,
  addLabel,
  onToggleLike,
  onBook,
  onAdd,
  onClose,
}: Props) {
  const [detail, setDetail] = useState<ActivityDetailModel>(() =>
    activityDetailFromCard(card),
  )
  const [loading, setLoading] = useState(true)
  const [descExpanded, setDescExpanded] = useState(false)
  const [listsExpanded, setListsExpanded] = useState(false)

  useEffect(() => {
    setDetail(activityDetailFromCard(card))
    setDescExpanded(false)
    setListsExpanded(false)
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const res = await getApiClient().getActivityProduct(card.productCode)
        if (cancelled || !res?.product) return
        setDetail(
          toActivityDetailModel(
            res.product as Record<string, unknown>,
            adults,
            card,
          ),
        )
      } catch {
        /* keep seed card */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [card, adults])

  const seedPhotos = useMemo(
    () => detail.photos.map((p) => p.url).filter(Boolean),
    [detail.photos],
  )

  const chips = [
    detail.freeCancellation ? 'Annulation gratuite' : null,
    detail.instantConfirmation ? 'Confirmation instantanée' : null,
    detail.durationLabel,
  ].filter(Boolean) as string[]

  const placeBits = [
    detail.destinationLabel ? `À ${detail.destinationLabel}` : null,
    detail.distanceLabel,
  ].filter(Boolean) as string[]
  const reviewLabel =
    detail.reviewCount != null && detail.reviewCount > 0
      ? `${detail.reviewCount.toLocaleString('fr-FR')} avis`
      : null

  const inclusionLimit = listsExpanded ? 12 : 4
  const exclusionLimit = listsExpanded ? 8 : 3
  const showMoreLists =
    detail.inclusions.length > 4 || detail.exclusions.length > 3

  return (
    <div className="app-dialog-root z-[70]">
      <button
        type="button"
        className="app-dialog-backdrop"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className="app-dialog-panel app-dialog-lg max-h-[88vh] sm:max-h-[84vh] overflow-hidden flex flex-col p-0"
        role="dialog"
        aria-modal="true"
        aria-label={detail.title}
      >
        <div className="shrink-0 relative">
          <HotelPhotoGallery
            seedPhoto={detail.photoUrl}
            seedPhotos={seedPhotos}
            alt={detail.title}
            hotelName={detail.title}
            cityLabel={detail.destinationLabel || undefined}
            embedded
            compact
            topRight={
              <>
                {onToggleLike ? (
                  <button
                    type="button"
                    onClick={onToggleLike}
                    aria-label={liked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    className={`w-8 h-8 rounded-full shadow flex items-center justify-center ${
                      liked ? 'bg-white text-primary-500' : 'bg-white/95 text-slate-600'
                    }`}
                  >
                    <HeartSvg filled={liked} />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fermer"
                  className="w-8 h-8 rounded-full bg-white/95 text-slate-700 shadow flex items-center justify-center"
                >
                  <CloseSvg />
                </button>
              </>
            }
          />
        </div>

        <div className="px-4 sm:px-5 pt-3 pb-2 space-y-3 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-extrabold text-ink tracking-tight leading-snug">
                {detail.title}
              </h2>
              {detail.rating != null || placeBits.length ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {detail.rating != null ? (
                    <span className="inline-flex items-center gap-1.5">
                      <RatingStars rating={detail.rating} size={14} />
                      {reviewLabel ? (
                        <span className="text-[11px] sm:text-xs font-semibold text-muted leading-none">
                          {reviewLabel}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {placeBits.length ? (
                    <span className="text-[11px] sm:text-xs text-muted leading-none">
                      {detail.rating != null ? '· ' : ''}
                      {placeBits.join(' · ')}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {detail.priceLabel ? (
              <div className="shrink-0 text-right pt-0.5">
                <p className="text-sm sm:text-base font-extrabold text-ink whitespace-nowrap leading-none">
                  {detail.priceLabel}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted leading-none">
                  Indicatif
                </p>
              </div>
            ) : null}
          </div>

          {chips.length ? (
            <div className="flex flex-wrap gap-1">
              {chips.map((c) => (
                <span
                  key={c}
                  className="rounded-md bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-0.5 text-[10px] font-bold"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null}

          {loading ? (
            <p className="text-xs text-muted">Chargement du détail…</p>
          ) : null}

          {detail.description ? (
            <section>
              <h3 className="text-xs font-extrabold text-ink mb-1 uppercase tracking-wide">
                À propos
              </h3>
              <p
                className={`text-sm text-ink-soft whitespace-pre-line leading-relaxed ${
                  descExpanded ? '' : 'line-clamp-3'
                }`}
              >
                {detail.description}
              </p>
              {detail.description.length > 140 ? (
                <button
                  type="button"
                  className="mt-0.5 text-xs font-bold text-primary-700"
                  onClick={() => setDescExpanded((v) => !v)}
                >
                  {descExpanded ? 'Réduire' : 'Lire la suite'}
                </button>
              ) : null}
            </section>
          ) : null}

          {detail.meetingPoint ? (
            <section>
              <h3 className="text-xs font-extrabold text-ink mb-1 uppercase tracking-wide">
                Point de rendez-vous
              </h3>
              <p className="text-sm text-ink-soft whitespace-pre-line line-clamp-2">
                {detail.meetingPoint}
              </p>
            </section>
          ) : null}

          {detail.inclusions.length ? (
            <section>
              <h3 className="text-xs font-extrabold text-ink mb-1 uppercase tracking-wide">
                Inclus
              </h3>
              <ul className="space-y-0.5">
                {detail.inclusions.slice(0, inclusionLimit).map((item) => (
                  <li key={item} className="text-sm text-ink-soft flex gap-1.5">
                    <span className="text-emerald-600 font-bold shrink-0">✓</span>
                    <span className="line-clamp-1">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {detail.exclusions.length ? (
            <section>
              <h3 className="text-xs font-extrabold text-ink mb-1 uppercase tracking-wide">
                Non inclus
              </h3>
              <ul className="space-y-0.5">
                {detail.exclusions.slice(0, exclusionLimit).map((item) => (
                  <li key={item} className="text-sm text-ink-soft flex gap-1.5">
                    <span className="text-slate-400 font-bold shrink-0">–</span>
                    <span className="line-clamp-1">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {showMoreLists ? (
            <button
              type="button"
              className="text-xs font-bold text-primary-700"
              onClick={() => setListsExpanded((v) => !v)}
            >
              {listsExpanded ? 'Réduire' : 'Voir plus de détails'}
            </button>
          ) : null}

          {detail.languages.length ? (
            <p className="text-xs text-muted">
              <span className="font-bold text-ink">Langues · </span>
              {detail.languages.join(' · ')}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-line bg-white px-4 sm:px-5 py-2.5 sm:py-3 flex flex-col sm:flex-row gap-2 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="flex-1 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-bold py-2.5 min-h-[44px] text-sm"
            onClick={onBook}
          >
            Réserver sur Viator
          </button>
          {!alreadyAdded ? (
            <button
              type="button"
              disabled={addBusy}
              className="flex-1 rounded-xl border border-line font-bold py-2.5 min-h-[44px] text-sm disabled:opacity-50"
              onClick={onAdd}
            >
              {addLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
