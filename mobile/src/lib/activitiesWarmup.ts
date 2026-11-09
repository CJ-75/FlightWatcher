/**
 * Post-login only — warm Viator city lists once Main is up.
 * Pre-login stays light (no catalogue / Viator). We load what the session
 * is likely to need next (remembered city + Paris), in the background.
 */
import { resolveActivityCitySlug } from '@flightwatcher/shared'
import {
  getCityActivitiesCached,
  peekCityActivities,
} from './activitiesCache'
import { getApi } from './client'
import { listRememberedTrips } from './tripRecovery'
import {
  hydrateTravelWorkspacesCache,
  peekTravelWorkspacesCache,
} from './workspacesCache'

const ADULTS = 2
const MAX_CITIES = 2

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
  try {
    const remembered = await listRememberedTrips()
    for (const t of remembered.slice(0, 4)) {
      push(t.city)
      if (out.length >= MAX_CITIES) break
    }
  } catch {
    /* ignore */
  }
  try {
    let ws = peekTravelWorkspacesCache()
    if (!ws?.length) ws = (await hydrateTravelWorkspacesCache()) || null
    for (const row of ws || []) {
      push(row.city)
      if (out.length >= MAX_CITIES) break
    }
  } catch {
    /* ignore */
  }
  // Paris only when no trip city known — avoid warming Paris then loading planner city.
  if (!out.length) push('paris')
  return out.slice(0, MAX_CITIES)
}

async function warmCity(slug: string): Promise<void> {
  if (peekCityActivities(slug, ADULTS)?.ok) return
  await getCityActivitiesCached(slug, ADULTS, () =>
    getApi().listCityActivities(slug, ADULTS),
  )
}

/**
 * Fire-and-forget after Main is up. One run per auth session key.
 */
export function scheduleActivitiesWarmup(sessionKey: string) {
  const key = String(sessionKey || '').trim()
  if (!key || warmedSessionKey === key) return
  warmedSessionKey = key
  cancelScheduled?.()

  const timer = setTimeout(() => {
    void (async () => {
      try {
        const cities = await resolveWarmCities()
        // Sequential — avoid hammering Viator on cold boot.
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
  }, 900)

  cancelScheduled = () => clearTimeout(timer)
}
