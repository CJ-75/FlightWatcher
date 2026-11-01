/**
 * Coller des liens Maps / Instagram / TikTok → reconnaissance → ajout voyage.
 */
import { useState } from 'react'
import {
  evaluateOpening,
  RESTAURANT_ADD_LABEL_FR,
  type OpenChip,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'

type ResultRow = {
  status?: string
  bucket?: string
  place_id?: string
  place?: { id?: string; name?: string; city_slug?: string }
  parse?: { name?: string; url_clean?: string; lat?: number; lng?: number }
  attribution?: string
  selectedBucket?: 'restaurant' | 'attraction'
}

export function LinkImportPanel(props: {
  draftToken?: string | null
  plannedTripId?: string | null
  citySlug?: string | null
  dateIso?: string | null
  onAdded?: () => void
  compact?: boolean
  initialText?: string
}) {
  const [text, setText] = useState(props.initialText || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ResultRow[]>([])
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [suggestedCity, setSuggestedCity] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const runImport = async () => {
    setBusy(true)
    setError(null)
    setToast(null)
    try {
      const res = await getApiClient().importRestaurantLinks({
        text,
        draft_token: props.draftToken || undefined,
        planned_trip_id: props.plannedTripId || undefined,
        city_slug: props.citySlug || undefined,
      })
      setResults(
        (res.results || []).map((r) => ({
          ...(r as ResultRow),
          selectedBucket:
            (r.bucket as 'restaurant' | 'attraction' | 'unknown') === 'attraction'
              ? 'attraction'
              : 'restaurant',
        })),
      )
      setCounts(res.counts || null)
      setSuggestedCity(res.suggested_city || null)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Ce lien ne ressemble pas à un lien Google Maps, Instagram ou TikTok',
      )
    } finally {
      setBusy(false)
    }
  }

  const confirmOne = async (row: ResultRow) => {
    if (!row.place_id) return
    try {
      await getApiClient().confirmRestaurantPlace({
        place_id: row.place_id,
        draft_token: props.draftToken || undefined,
        planned_trip_id: props.plannedTripId || undefined,
        item_type: row.selectedBucket === 'attraction' ? 'activity' : 'restaurant',
        save_address: true,
        source_url: row.parse?.url_clean,
        city_slug: props.citySlug || row.place?.city_slug,
      })
      setToast('Ajouté au voyage')
      window.setTimeout(() => setToast(null), 2500)
      props.onAdded?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ajout impossible')
    }
  }

  const openChip = (row: ResultRow): OpenChip | null => {
    if (!props.dateIso) return null
    return evaluateOpening({
      openingHoursRaw: null,
      dateIso: props.dateIso,
      moment: 'evening',
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-ink mb-1.5">
          Tu as déjà repéré des endroits ?
        </label>
        <p className="text-sm text-muted mb-2">
          Colle tes liens Instagram, TikTok ou Google Maps — restaurants, bars, musées…
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={props.compact ? 3 : 5}
          placeholder="https://maps.app.goo.gl/…&#10;https://www.instagram.com/…"
          className="w-full rounded-2xl border border-line bg-white px-3.5 py-3 text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => void runImport()}
            className="app-btn-primary rounded-xl px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {busy ? 'Analyse…' : RESTAURANT_ADD_LABEL_FR}
          </button>
          {typeof navigator !== 'undefined' && navigator.clipboard?.readText ? (
            <button
              type="button"
              className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink-soft hover:bg-primary-50"
              onClick={async () => {
                try {
                  const clip = await navigator.clipboard.readText()
                  if (clip) setText((t) => (t ? `${t}\n${clip}` : clip))
                } catch {
                  setError('Autorise le presse-papiers pour coller en un tap')
                }
              }}
            >
              Coller
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="text-sm font-semibold text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {toast ? (
        <p className="text-sm font-semibold text-emerald-700" role="status">
          {toast}
        </p>
      ) : null}

      {suggestedCity && !props.citySlug ? (
        <p className="text-sm text-ink bg-primary-50 border border-primary-100 rounded-xl px-3 py-2">
          Tes lieux semblent être à <strong>{suggestedCity}</strong>. Créer le voyage
          là-bas ?
        </p>
      ) : null}

      {counts ? (
        <p className="text-xs font-bold text-muted">
          {counts.restaurant || 0} restaurants · {counts.attraction || 0} lieux à
          visiter · {counts.needs_clarify || 0} à préciser
        </p>
      ) : null}

      <ul className="space-y-3">
        {results.map((row, i) => {
          const name = row.place?.name || row.parse?.name || 'Lieu'
          const chip = openChip(row)
          return (
            <li
              key={`${row.place_id || row.parse?.url_clean || i}`}
              className="rounded-2xl border border-line bg-white p-3.5 shadow-soft"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                    row.selectedBucket === 'attraction'
                      ? 'bg-sky-50 text-sky-700'
                      : 'bg-orange-50 text-primary-600'
                  }`}
                  aria-hidden
                >
                  {row.selectedBucket === 'attraction' ? '◎' : '🍽'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-ink text-[15px] leading-snug">
                    {name}
                  </p>
                  {chip ? (
                    <span
                      className={`inline-flex mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        chip.status === 'open'
                          ? 'bg-emerald-50 text-emerald-800'
                          : chip.status === 'closed'
                            ? 'bg-amber-50 text-amber-900'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {chip.label}
                    </span>
                  ) : null}
                  {row.status === 'needs_clarify' || row.bucket === 'unknown' ? (
                    <div className="mt-2 flex gap-2">
                      {(['restaurant', 'attraction'] as const).map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() =>
                            setResults((prev) =>
                              prev.map((r, j) =>
                                j === i ? { ...r, selectedBucket: b } : r,
                              ),
                            )
                          }
                          className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                            row.selectedBucket === b
                              ? 'bg-ink text-white border-ink'
                              : 'bg-white text-muted border-line'
                          }`}
                        >
                          {b === 'restaurant' ? 'Restaurant' : 'À visiter'}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!row.place_id}
                      onClick={() => void confirmOne(row)}
                      className="text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 rounded-xl px-3 py-2 disabled:opacity-40"
                    >
                      Oui, ajouter
                    </button>
                    {row.parse?.url_clean ? (
                      <a
                        href={row.parse.url_clean}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-primary-700 px-2 py-2"
                      >
                        Ouvrir la source
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
