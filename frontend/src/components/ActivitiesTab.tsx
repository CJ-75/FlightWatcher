/**
 * Onglet Activités — listing ville + autour de moi (Lot C/D).
 * Métier via API ; affichage via @flightwatcher/shared.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ACTIVITY_CATEGORY_TAGS_FR,
  ACTIVITY_SORT_LABEL_FR,
  activitiesCityPath,
  toActivityCardModel,
  type ActivityCardModel,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'

function platform(): 'web' {
  return 'web'
}

function openViatorSync(url: string) {
  // Must stay synchronous with the click (popup blockers)
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function ActivitiesTab(props?: { citySlug?: string }) {
  const params = useParams<{ city?: string }>()
  const navigate = useNavigate()
  const citySlug = props?.citySlug || params.city || ''
  const [adults] = useState(2)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [header, setHeader] = useState<string | null>(null)
  const [fallbackHint, setFallbackHint] = useState<string | null>(null)
  const [sort, setSort] = useState<'recommended' | 'price' | 'rating'>('recommended')
  const [geoBusy, setGeoBusy] = useState(false)
  const [detail, setDetail] = useState<ActivityCardModel | null>(null)
  const [pendingBook, setPendingBook] = useState<ActivityCardModel | null>(null)
  const [askBooked, setAskBooked] = useState(false)

  const cards = useMemo(() => {
    let list = items.map((r) => toActivityCardModel(r, adults))
    if (sort === 'price') {
      list = [...list].sort((a, b) => {
        const pa = a.priceLabel ? parseInt(a.priceLabel.replace(/\D/g, ''), 10) : 9999
        const pb = b.priceLabel ? parseInt(b.priceLabel.replace(/\D/g, ''), 10) : 9999
        return pa - pb
      })
    } else if (sort === 'rating') {
      list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0))
    }
    return list
  }, [items, adults, sort])

  const loadCity = useCallback(
    async (slug: string) => {
      if (!slug) return
      setLoading(true)
      setError(null)
      setHeader(null)
      try {
        const res = await getApiClient().listCityActivities(slug, adults)
        if (!res.ok) throw new Error(res.error || 'Chargement impossible')
        setItems(Array.isArray(res.items) ? res.items : [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
        setItems([])
      } finally {
        setLoading(false)
      }
    },
    [adults],
  )

  useEffect(() => {
    if (citySlug) void loadCity(citySlug)
  }, [citySlug, loadCity])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && pendingBook) {
        setAskBooked(true)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [pendingBook])

  const onNearby = () => {
    if (!navigator.geolocation) {
      setError('Géolocalisation indisponible')
      return
    }
    setGeoBusy(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await getApiClient().nearbyActivities({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            adults,
          })
          if (!res.ok) throw new Error(res.error || 'Aucune activité')
          setItems(Array.isArray(res.items) ? res.items : [])
          setHeader(res.header || null)
          setFallbackHint(res.fallback_hint || null)
          navigate('/activites')
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Erreur')
        } finally {
          setGeoBusy(false)
        }
      },
      () => {
        setGeoBusy(false)
        setError('Localisation refusée')
      },
      { enableHighAccuracy: false, timeout: 12000 },
    )
  }

  const track = (event: string, card?: ActivityCardModel | null) => {
    void getApiClient()
      .trackActivityEvent({
        domain: 'activity',
        event,
        surface: 'tab',
        platform: platform(),
        meta: card ? { product_code: card.productCode } : undefined,
      })
      .catch(() => undefined)
  }

  const onBook = (card: ActivityCardModel) => {
    if (!card.productUrl) return
    setPendingBook(card)
    track('book_click', card)
    openViatorSync(card.productUrl)
  }

  const bigCities = [
    { slug: 'paris', label: 'Paris' },
    { slug: 'rome', label: 'Rome' },
    { slug: 'barcelone', label: 'Barcelone' },
    { slug: 'lisbonne', label: 'Lisbonne' },
    { slug: 'milan', label: 'Milan' },
    { slug: 'amsterdam', label: 'Amsterdam' },
  ]

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="app-kicker">Activités</p>
        <h2 className="app-title">Que faire sur place</h2>
        <p className="app-subtitle">
          Sélection FlightWatcher · réservation sur Viator · commission transparente
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onNearby}
          disabled={geoBusy}
          className="rounded-full bg-ink text-white text-sm font-bold px-4 py-2 disabled:opacity-60"
        >
          {geoBusy ? 'Localisation…' : 'Autour de moi'}
        </button>
        {bigCities.map((c) => (
          <Link
            key={c.slug}
            to={activitiesCityPath(c.slug)}
            className={`rounded-full border text-sm font-semibold px-3 py-2 ${
              citySlug === c.slug
                ? 'border-primary-500 bg-primary-50 text-primary-800'
                : 'border-slate-200 text-slate-700'
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        {ACTIVITY_CATEGORY_TAGS_FR.map((t) => (
          <span key={t.id} className="rounded-lg bg-slate-100 px-2 py-1">
            {t.label}
          </span>
        ))}
      </div>

      <div className="flex gap-2 text-sm">
        {(Object.keys(ACTIVITY_SORT_LABEL_FR) as Array<keyof typeof ACTIVITY_SORT_LABEL_FR>).map(
          (k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className={`font-semibold px-3 py-1.5 rounded-lg ${
                sort === k ? 'bg-primary-100 text-primary-800' : 'text-slate-500'
              }`}
            >
              {ACTIVITY_SORT_LABEL_FR[k]}
            </button>
          ),
        )}
      </div>

      {header ? <p className="text-sm font-semibold text-slate-800">{header}</p> : null}
      {fallbackHint ? (
        <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2">{fallbackHint}</p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Chargement…</p> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <article
            key={c.productCode || c.title}
            className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col"
          >
            {c.photoUrl ? (
              <button type="button" onClick={() => setDetail(c)} className="block w-full">
                <img src={c.photoUrl} alt="" className="h-40 w-full object-cover" />
              </button>
            ) : (
              <div className="h-40 bg-slate-100" />
            )}
            <div className="p-3 space-y-1.5 flex-1 flex flex-col">
              <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">
                {c.title}
              </h3>
              <p className="text-xs text-slate-500">
                {c.rating != null ? `${c.rating.toFixed(1)} · ${c.reviewCount || 0} avis` : '—'}
                {c.durationLabel ? ` · ${c.durationLabel}` : ''}
              </p>
              {c.distanceLabel ? (
                <p className="text-xs text-slate-400">{c.distanceLabel}</p>
              ) : null}
              <p className="font-extrabold text-slate-900 mt-auto">{c.priceLabel || 'Voir le tarif'}</p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onBook(c)}
                  className="rounded-xl bg-primary-600 text-white text-sm font-bold py-2"
                >
                  Réserver sur Viator
                </button>
                <button
                  type="button"
                  onClick={() => {
                    track('add_intent', c)
                    setDetail(c)
                  }}
                  className="rounded-xl border border-slate-200 text-sm font-semibold py-2"
                >
                  Ajouter à mon voyage
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Classement FlightWatcher (note bayésienne, annulation, durée) — indépendant du tri commercial
        Viator. En cliquant sur « Réserver sur Viator », tu quittes FlightWatcher ; une commission peut
        être versée si tu réserves.
      </p>

      {detail ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-3 shadow-xl">
            <h3 className="font-bold text-lg text-slate-900">{detail.title}</h3>
            <p className="text-sm text-slate-600">
              {detail.priceLabel} · {detail.durationLabel || 'Durée variable'}
            </p>
            <button
              type="button"
              className="w-full rounded-xl bg-primary-600 text-white font-bold py-3"
              onClick={() => onBook(detail)}
            >
              Réserver sur Viator
            </button>
            <button
              type="button"
              className="w-full rounded-xl border font-semibold py-3"
              onClick={() => setDetail(null)}
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {askBooked && pendingBook ? (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3">
            <p className="font-bold text-slate-900">
              Tu as réservé {pendingBook.title} ?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-emerald-600 text-white font-bold py-2"
                onClick={() => {
                  track('booked_yes', pendingBook)
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                Oui
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl border font-semibold py-2"
                onClick={() => {
                  track('booked_no', pendingBook)
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                Pas encore
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ActivitiesTab
