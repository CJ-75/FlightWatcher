/**
 * Catalogue activités public — parité web (pas de JWT / getSession).
 */
import { apiBase } from './client'
import type { CityActivitiesResult } from './activitiesCache'

export async function fetchCityActivitiesPublic(
  citySlug: string,
  adults = 2,
): Promise<CityActivitiesResult> {
  const slug = String(citySlug || '').trim().toLowerCase() || 'paris'
  const url = `${apiBase.replace(/\/$/, '')}/api/activities/cities/${encodeURIComponent(slug)}?adults=${adults}`
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 25_000) : null
  try {
    const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
    const data = (await res.json().catch(() => null)) as CityActivitiesResult | null
    if (!res.ok || !data) {
      return {
        ok: false,
        items: [],
        error: data?.error || res.statusText || 'Chargement impossible',
      }
    }
    return data
  } catch (e) {
    const aborted =
      (typeof DOMException !== 'undefined' &&
        e instanceof DOMException &&
        e.name === 'AbortError') ||
      (e instanceof Error && /abort/i.test(e.message))
    return {
      ok: false,
      items: [],
      error: aborted
        ? 'Délai dépassé — réessaie'
        : e instanceof Error
          ? e.message
          : 'Erreur',
    }
  } finally {
    if (timer != null) clearTimeout(timer)
  }
}
