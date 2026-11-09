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
  try {
    const res = await fetch(url)
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
    return {
      ok: false,
      items: [],
      error: e instanceof Error ? e.message : 'Erreur',
    }
  }
}
