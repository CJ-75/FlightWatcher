/**
 * Persist « Ton vol est réservé ? » across tab focus / remounts.
 * Storage is platform-specific (sessionStorage / AsyncStorage); this module
 * only defines the payload contract + timing rules.
 */

export const FLIGHT_RETURN_ASK_KEY = 'fw_flight_return_ask'

export type FlightReturnAsk = {
  draftToken: string
  at: number
  /** false for Travelpayouts (webhook / auto follow-up) */
  promptOnReturn: boolean
}

const DEFAULT_MIN_ELAPSED_MS = 1200
const DEFAULT_MAX_AGE_MS = 2 * 60 * 60 * 1000

export function parseFlightReturnAsk(raw: string | null | undefined): FlightReturnAsk | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<FlightReturnAsk>
    const draftToken = String(parsed.draftToken || '').trim()
    const at = Number(parsed.at)
    if (!draftToken || !Number.isFinite(at) || at <= 0) return null
    return {
      draftToken,
      at,
      promptOnReturn: parsed.promptOnReturn !== false,
    }
  } catch {
    return null
  }
}

export function serializeFlightReturnAsk(ask: FlightReturnAsk): string {
  return JSON.stringify(ask)
}

export function shouldShowFlightReturnAsk(
  ask: FlightReturnAsk | null,
  opts?: {
    now?: number
    minElapsedMs?: number
    maxAgeMs?: number
    draftToken?: string | null
    alreadyBooked?: boolean
  },
): boolean {
  if (!ask || opts?.alreadyBooked) return false
  if (!ask.promptOnReturn) return false
  const want = (opts?.draftToken || '').trim()
  if (want && ask.draftToken !== want) return false
  const now = opts?.now ?? Date.now()
  const elapsed = now - ask.at
  if (elapsed < (opts?.minElapsedMs ?? DEFAULT_MIN_ELAPSED_MS)) return false
  if (elapsed > (opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS)) return false
  return true
}
