/**
 * Background Viator city_search warm — no Activities tab click required.
 * Kick after Parcours catalogue is ready so home stays first.
 * Resolves the active planner city (arrival), then force-fetches Viator
 * through the same singleflight as ActivitiesScreen.
 */
import {
  cityDisplayNameFr,
  filterActivitySwitcherWorkspaces,
  parseAirportCodes,
  resolveActivityCitySlug,
  type TravelWorkspace,
} from '@flightwatcher/shared'
import {
  getCityActivitiesCached,
  setLastCitySlug,
} from './activitiesCache'
import { fetchCityActivitiesPublic } from './activitiesCatalogFetch'
import { getApi } from './client'
import {
  hydrateTravelWorkspacesCache,
  listTravelWorkspacesCached,
  peekTravelWorkspacesCache,
} from './workspacesCache'

const ADULTS = 2
const SAFE_WARM = 'paris'

let warmedSessionKey: string | null = null
let cancelScheduled: (() => void) | null = null
/** City we warmed (or are warming) — ActivitiesScreen can lock early. */
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

function slugFromWorkspace(ws: TravelWorkspace): string {
  const cityLabel = String(ws.city || '').trim() || null
  const destIata = parseAirportCodes(ws.dest_iata)[0] || null
  return resolveActivityCitySlug({
    citySlug: cityLabel,
    cityLabel,
    destIata,
  })
}

/** Same arrival-city logic as ActivitiesScreen lockCity (free open). */
async function resolveActiveActivityCitySlug(): Promise<string> {
  try {
    let rows =
      peekTravelWorkspacesCache() ||
      (await hydrateTravelWorkspacesCache()) ||
      []
    if (!rows.length) {
      rows = await listTravelWorkspacesCached().catch(() => [])
    }
    const top = filterActivitySwitcherWorkspaces(rows)[0]
    if (!top) return SAFE_WARM

    const plannedTripId = top.planned_trip_id
      ? String(top.planned_trip_id)
      : ''
    if (plannedTripId && !plannedTripId.startsWith('dev-trip-')) {
      const trip = await getApi()
        .getPlannedTrip(plannedTripId)
        .catch(() => null)
      if (trip) {
        const arrival = parseAirportCodes(trip.arrival_airport)[0] || ''
        const cityLabel = arrival
          ? cityDisplayNameFr(arrival)
          : String(trip.name || '').replace(/^Weekend\s+/i, '').trim() || null
        return resolveActivityCitySlug({
          citySlug: cityLabel,
          cityLabel,
          destIata: arrival || null,
        })
      }
    }

    if (top.draft_token) {
      const row = await getApi()
        .getMyTrip(String(top.draft_token))
        .catch(() => null)
      if (row) {
        const pl = (row.payload || {}) as Record<string, unknown>
        const fl = (pl.flight || {}) as Record<string, unknown>
        const cityLabel =
          String(row.city_name || pl.city || top.city || '').trim() || null
        const citySlugHint =
          typeof pl.city_slug === 'string' ? pl.city_slug : cityLabel
        const destIata =
          String(
            fl.destination_iata ||
              pl.destination ||
              pl.dest_iata ||
              row.dest_iata ||
              '',
          ).trim() || null
        return resolveActivityCitySlug({
          citySlug: citySlugHint || cityLabel,
          cityLabel,
          destIata,
        })
      }
    }

    return slugFromWorkspace(top) || SAFE_WARM
  } catch {
    return SAFE_WARM
  }
}

async function warmCity(slug: string): Promise<void> {
  const city = String(slug || '').trim().toLowerCase() || SAFE_WARM
  warmedCitySlug = city
  setLastCitySlug(city)
  // force:true → always hit Viator path (server mem/provider_cache), joinable
  // by ActivitiesScreen via the same inflight key.
  await getCityActivitiesCached(
    city,
    ADULTS,
    () => fetchCityActivitiesPublic(city, ADULTS),
    { force: true },
  )
}

/**
 * Once per session. Safe to call from MainTabs + Parcours (idempotent).
 * Resolves trip city then force-fetches Viator — no tab click needed.
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

  const fallback =
    String(preferredCity || '').trim().toLowerCase() || SAFE_WARM

  const timer = setTimeout(() => {
    warmInflight = (async () => {
      const city = (await resolveActiveActivityCitySlug()) || fallback
      if (__DEV__) {
        console.log('[activities] warm Viator city=', city)
      }
      await warmCity(city)
    })().catch((e) => {
      if (__DEV__) console.warn('[activities] warm failed', e)
    })
  }, 80)

  cancelScheduled = () => clearTimeout(timer)
}
