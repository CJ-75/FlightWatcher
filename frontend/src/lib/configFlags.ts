/** Sync peek of product flags from last /api/config (SPA only). */

const flags: Record<string, boolean> = {
  pop_page_v2_enabled: false,
  landing_v2_enabled: false,
  trip_detail_v2_enabled: false,
}

export function hydrateConfigFlags(cfg: Record<string, unknown> | null | undefined): void {
  if (!cfg) return
  for (const key of Object.keys(flags)) {
    if (key in cfg) flags[key] = cfg[key] === true
  }
}

export function peekConfigFlag(key: keyof typeof flags | string): boolean {
  return Boolean(flags[key])
}
