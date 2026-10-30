import type { EnrichedTripResponse } from '@flightwatcher/shared'

type Listener = (trips: EnrichedTripResponse[]) => void

let liveTrips: EnrichedTripResponse[] = []
let liveToken = 0
const listeners = new Set<Listener>()

/** Bump token when a new search starts — Results ignores stale updates. */
export function beginInspireLive(): number {
  liveToken += 1
  liveTrips = []
  notify()
  return liveToken
}

export function publishInspireLive(token: number, trips: EnrichedTripResponse[]) {
  if (token !== liveToken) return
  liveTrips = trips
  notify()
}

export function peekInspireLive(): { token: number; trips: EnrichedTripResponse[] } {
  return { token: liveToken, trips: liveTrips }
}

export function subscribeInspireLive(fn: Listener): () => void {
  listeners.add(fn)
  fn(liveTrips)
  return () => {
    listeners.delete(fn)
  }
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn(liveTrips)
    } catch {
      /* ignore */
    }
  })
}
