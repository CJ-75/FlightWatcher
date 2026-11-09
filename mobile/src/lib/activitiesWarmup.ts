/**
 * Post-login — prefetch catalogue public immédiatement (last / remembered city).
 */
import { resolveActivityCitySlug } from '@flightwatcher/shared'
import {
  getCityActivitiesCached,
  hydrateCityActivities,
  hydrateLastCitySlug,
  peekCityActivities,
  peekLastCitySlug,
  setLastCitySlug,
} from './activitiesCache'
import { fetchCityActivitiesPublic } from './activitiesCatalogFetch'
import { listRememberedTrips } from './tripRecovery'
import {
  hydrateTravelWorkspacesCache,
  peekTravelWorkspacesCache,
} from './workspacesCache'

const ADULTS = 2

let warmedSessionKey: string | null = null
let cancelScheduled: (() => void) | null = null

export function resetActivitiesWarmup() {
  warmedSessionKey = null
  cancelScheduled?.()
  cancelScheduled = null
}

async function resolveWarmCities(): Promise<string[]> {
  const out: string[] = []
  const push = (raw: string | null | undefined) => {
    const slug = resolveActivityCitySlug({ cityLabel: raw, citySlug: raw })
    if (slug && !out.includes(slug)) out.push(slug)
  }

  // Remembered trip city first — avoid warming Paris then loading planner city.
  try {
    const remembered = await listRememberedTrips()
    for (const t of remembered.slice(0, 3)) push(t.city)
  } catch {
    /* ignore */
  }

  await hydrateLastCitySlug()
  push(peekLastCitySlug())

  try {
    let ws = peekTravelWorkspacesCache()
    if (!ws?.length) ws = (await hydrateTravelWorkspacesCache()) || null
    for (const row of (ws || []).slice(0, 3)) push(row.city)
  } catch {
    /* ignore */
  }

  if (!out.length) push('paris')
  return out.slice(0, 2)
}

async function warmCity(slug: string): Promise<void> {
  setLastCitySlug(slug)
  if (peekCityActivities(slug, ADULTS)?.ok) return
  await hydrateCityActivities(slug, ADULTS)
  if (peekCityActivities(slug, ADULTS)?.ok) {
    void getCityActivitiesCached(slug, ADULTS, () =>
      fetchCityActivitiesPublic(slug, ADULTS),
    ).catch(() => {})
    return
  }
  await getCityActivitiesCached(slug, ADULTS, () =>
    fetchCityActivitiesPublic(slug, ADULTS),
  )
}

export function scheduleActivitiesWarmup(sessionKey: string) {
  const key = String(sessionKey || '').trim()
  if (!key || warmedSessionKey === key) return
  warmedSessionKey = key
  cancelScheduled?.()

  // Fire ASAP — no idle delay (tab may open before +350ms).
  const timer = setTimeout(() => {
    void (async () => {
      try {
        const cities = await resolveWarmCities()
        for (const slug of cities) {
          try {
            await warmCity(slug)
          } catch {
            /* best-effort */
          }
        }
      } catch {
        /* best-effort */
      }
    })()
  }, 0)

  cancelScheduled = () => clearTimeout(timer)
}
