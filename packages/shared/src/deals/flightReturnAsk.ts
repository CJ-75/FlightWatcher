/**
 * Persist « Ton vol est réservé ? » across tab focus / remounts / page close.
 * Storage is platform-specific (localStorage / AsyncStorage); this module
 * only defines the payload contract + timing rules.
 */

export const FLIGHT_RETURN_ASK_KEY = 'fw_flight_return_ask'

export type FlightReturnAsk = {
  /** May be empty until the exécution draft exists — then plannedTripId carries the ask. */
  draftToken: string
  plannedTripId?: string
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
    const plannedTripId = String(parsed.plannedTripId || '').trim() || undefined
    const at = Number(parsed.at)
    if ((!draftToken && !plannedTripId) || !Number.isFinite(at) || at <= 0) {
      return null
    }
    return {
      draftToken,
      plannedTripId,
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
    plannedTripId?: string | null
    alreadyBooked?: boolean
  },
): boolean {
  if (!ask || opts?.alreadyBooked) return false
  if (!ask.promptOnReturn) return false
  const wantDraft = (opts?.draftToken || '').trim()
  const wantPlanned = (opts?.plannedTripId || '').trim()
  if (wantDraft || wantPlanned) {
    const draftOk = Boolean(wantDraft && ask.draftToken && ask.draftToken === wantDraft)
    const plannedOk = Boolean(
      wantPlanned && ask.plannedTripId && ask.plannedTripId === wantPlanned,
    )
    if (!draftOk && !plannedOk) return false
  }
  const now = opts?.now ?? Date.now()
  const elapsed = now - ask.at
  if (elapsed < (opts?.minElapsedMs ?? DEFAULT_MIN_ELAPSED_MS)) return false
  if (elapsed > (opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS)) return false
  return true
}

/** True when `clear` / `consume` may drop this ask for the given owner keys. */
export function flightReturnAskMatchesOwner(
  ask: FlightReturnAsk | null,
  opts?: { draftToken?: string | null; plannedTripId?: string | null },
): boolean {
  if (!ask) return false
  const wantDraft = (opts?.draftToken || '').trim()
  const wantPlanned = (opts?.plannedTripId || '').trim()
  if (!wantDraft && !wantPlanned) return true
  if (wantDraft && ask.draftToken && ask.draftToken === wantDraft) return true
  if (wantPlanned && ask.plannedTripId && ask.plannedTripId === wantPlanned) {
    return true
  }
  return false
}
