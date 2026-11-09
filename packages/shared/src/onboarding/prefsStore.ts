import {
  DEFAULT_ONBOARDING_PREFS,
  type OnboardingPrefs,
  type PendingAction,
  type TravelPreference,
} from './types'

export type KvAdapter = {
  getItem: (key: string) => string | null | Promise<string | null>
  setItem: (key: string, value: string) => void | Promise<void>
  removeItem: (key: string) => void | Promise<void>
}

const PREFS_KEY = 'fw_onboarding_prefs_v1'
const PENDING_KEY = 'fw_pending_action_v1'

function memoryKv(): KvAdapter {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v)
    },
    removeItem: (k) => {
      m.delete(k)
    },
  }
}

let adapter: KvAdapter = memoryKv()

export function configureOnboardingKv(next: KvAdapter) {
  adapter = next
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await adapter.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await adapter.setItem(key, JSON.stringify(value))
  } catch {
    /* quota */
  }
}

export async function loadOnboardingPrefs(): Promise<OnboardingPrefs> {
  const parsed = await readJson<Partial<OnboardingPrefs>>(PREFS_KEY)
  return { ...DEFAULT_ONBOARDING_PREFS, ...(parsed || {}) }
}

export async function saveOnboardingPrefs(
  patch: Partial<OnboardingPrefs>,
): Promise<OnboardingPrefs> {
  const cur = await loadOnboardingPrefs()
  const next = { ...cur, ...patch }
  await writeJson(PREFS_KEY, next)
  return next
}

export async function setDepartureCity(input: {
  slug: string
  label: string
  airportCodes?: string | null
}): Promise<OnboardingPrefs> {
  return saveOnboardingPrefs({
    departureCitySlug: input.slug,
    departureCityLabel: input.label,
    departureAirportCodes: input.airportCodes ?? null,
  })
}

export async function setTravelPreference(
  preference: TravelPreference | null,
): Promise<OnboardingPrefs> {
  return saveOnboardingPrefs({ travelPreference: preference })
}

export async function markOnboardingCompleted(): Promise<OnboardingPrefs> {
  return saveOnboardingPrefs({
    onboardingCompletedAt: new Date().toISOString(),
  })
}

export async function setPendingAction(
  action: PendingAction | null,
): Promise<void> {
  if (!action) {
    try {
      await adapter.removeItem(PENDING_KEY)
    } catch {
      /* ignore */
    }
    return
  }
  await writeJson(PENDING_KEY, action)
}

export async function getPendingAction(): Promise<PendingAction | null> {
  const parsed = await readJson<PendingAction>(PENDING_KEY)
  if (!parsed?.type || parsed.type === 'none') return null
  // Drop stale (>2h)
  if (Date.now() - (parsed.createdAt || 0) > 2 * 60 * 60 * 1000) {
    await setPendingAction(null)
    return null
  }
  return parsed
}

export async function clearPendingAction(): Promise<void> {
  await setPendingAction(null)
}

/** Suggest a city slug from locale / timezone — no OS geolocation. */
export function suggestCityFromLocale(
  locale?: string | null,
  timeZone?: string | null,
): { slug: string; label: string } {
  const loc = String(locale || '').toLowerCase()
  const tz = String(timeZone || '').toLowerCase()
  if (tz.includes('lisbon') || loc.includes('pt-pt'))
    return { slug: 'lisbon', label: 'Lisbonne' }
  if (tz.includes('madrid') || loc.startsWith('es'))
    return { slug: 'madrid', label: 'Madrid' }
  if (tz.includes('rome') || loc.startsWith('it'))
    return { slug: 'rome', label: 'Rome' }
  if (tz.includes('berlin') || loc.startsWith('de'))
    return { slug: 'berlin', label: 'Berlin' }
  if (tz.includes('brussels') || loc.includes('nl-be') || loc.includes('fr-be'))
    return { slug: 'brussels', label: 'Bruxelles' }
  if (tz.includes('london') || loc.startsWith('en-gb'))
    return { slug: 'london', label: 'Londres' }
  // Default FR / Europe-Paris
  return { slug: 'paris', label: 'Paris' }
}
