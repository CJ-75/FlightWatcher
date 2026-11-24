/** In-memory push prefs — paint Notifications instantly, sync in background. */

export type PushPrefs = {
  notif_group: boolean
  notif_pops: boolean
}

let cache: PushPrefs = { notif_group: true, notif_pops: true }
let inflight: Promise<PushPrefs> | null = null

export function peekPushPrefs(): PushPrefs {
  return cache
}

export function writePushPrefs(partial: Partial<PushPrefs>): void {
  cache = {
    notif_group: partial.notif_group ?? cache.notif_group,
    notif_pops: partial.notif_pops ?? cache.notif_pops,
  }
}

export async function loadPushPrefs(
  fetch: () => Promise<{ notif_group?: boolean; notif_pops?: boolean }>,
): Promise<PushPrefs> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch()
      cache = {
        notif_group: r.notif_group !== false,
        notif_pops: r.notif_pops !== false,
      }
      return cache
    } finally {
      inflight = null
    }
  })()
  return inflight
}
