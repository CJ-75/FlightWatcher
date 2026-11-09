/**
 * Background Viator warm — Paris by default, planner city when known locally.
 * Kick after Parcours is ready; no network trip resolve (too slow).
 */
import { resolveActivityCitySlug } from '@flightwatcher/shared'
import {
  getCityActivitiesCached,
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

function slugFromHint(hint: string | null | undefined): string | null {
  const raw = String(hint || '').trim()
  if (!raw) return null
  const slug = resolveActivityCitySlug({
    citySlug: raw,
    cityLabel: raw,
    destIata: null,
  })
  return slug || null
}

/** Local-only: remembered trip / last city / workspaces disk — no API. */
async function resolveWarmCity(
  preferredCity?: string | null,
): Promise<string> {
  const preferred = slugFromHint(preferredCity)
  if (preferred) return preferred

  try {
    const remembered = await listRememberedTrips()
    const fromRemembered = slugFromHint(remembered[0]?.city)
    if (fromRemembered) return fromRemembered
  } catch {
    /* ignore */
  }

  try {
    const disk =
      peekTravelWorkspacesCache() || (await hydrateTravelWorkspacesCache())
    const top = Array.isArray(disk) ? disk[0] : null
    const fromWs = slugFromHint(top?.city || top?.dest_iata || null)
    if (fromWs) return fromWs
  } catch {
    /* ignore */
  }

  const last = peekLastCitySlug()
  if (last) return last

  return SAFE_WARM
}

/**
 * Once per session. Prefers planner city when known locally, else Paris.
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

  const timer = setTimeout(() => {
    warmInflight = resolveWarmCity(preferredCity)
      .then((city) =>
        warmCity(city).then(() => {
          if (__DEV__) console.log('[activities] warm Viator ready city=', city)
        }),
      )
      .catch((e) => {
        if (__DEV__) console.warn('[activities] warm failed', e)
      })
  }, 0)

  cancelScheduled = () => clearTimeout(timer)
}
