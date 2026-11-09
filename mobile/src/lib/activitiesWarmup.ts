/**
 * Background Viator warm — Paris by default (parcours + catalogue, not only
 * planner arrival). Kick after Parcours is ready; no trip resolve (too slow).
 */
import {
  getCityActivitiesCached,
  setLastCitySlug,
} from './activitiesCache'
import { fetchCityActivitiesPublic } from './activitiesCatalogFetch'

const ADULTS = 2
const SAFE_WARM = 'paris'

let warmedSessionKey: string | null = null
let cancelScheduled: (() => void) | null = null
let warmedCitySlug: string | null = null
let warmInflight: Promise<void> | null = null

export function resetActivitiesWarmup() {
  warmedSessionKey = null
  warmedCitySlug = null
  warmInflight = null
  cancelScheduled?.()
  cancelScheduled = null
}

export function peekWarmedActivityCity(): string | null {
  return warmedCitySlug
}

export function getActivitiesWarmPromise(): Promise<void> | null {
  return warmInflight
}

async function warmCity(slug: string): Promise<void> {
  const city = String(slug || '').trim().toLowerCase() || SAFE_WARM
  warmedCitySlug = city
  setLastCitySlug(city)
  await getCityActivitiesCached(
    city,
    ADULTS,
    () => fetchCityActivitiesPublic(city, ADULTS),
    { force: true },
  )
}

/**
 * Once per session. Always Paris (or explicit preferredCity) — no planner RTT.
 */
export function scheduleActivitiesWarmup(
  sessionKey: string,
  preferredCity?: string | null,
) {
  const key = String(sessionKey || '').trim()
  if (!key) return
  if (warmedSessionKey === key) return

  warmedSessionKey = key
  cancelScheduled?.()

  const city =
    String(preferredCity || '').trim().toLowerCase() || SAFE_WARM

  const timer = setTimeout(() => {
    warmInflight = warmCity(city)
      .then(() => {
        if (__DEV__) console.log('[activities] warm Viator ready city=', city)
      })
      .catch((e) => {
        if (__DEV__) console.warn('[activities] warm failed', e)
      })
  }, 80)

  cancelScheduled = () => clearTimeout(timer)
}
