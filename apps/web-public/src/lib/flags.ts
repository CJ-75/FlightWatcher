/**
 * Product flags from Render /api/config — short TTL, no redeploy to flip.
 */

export type PublicFlags = {
  pop_page_v2_enabled: boolean
  landing_v2_enabled: boolean
}

const TTL_MS = 15_000
let cache: { at: number; flags: PublicFlags } | null = null

function apiBase(): string {
  return (
    process.env.WAYPOP_API_URL ||
    process.env.NEXT_PUBLIC_WAYPOP_API_URL ||
    'https://api.waypop.co'
  ).replace(/\/$/, '')
}

export async function getPublicFlags(): Promise<PublicFlags> {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return cache.flags
  try {
    const res = await fetch(`${apiBase()}/api/config`, {
      next: { revalidate: 15 },
    })
    if (!res.ok) throw new Error(String(res.status))
    const cfg = (await res.json()) as Record<string, unknown>
    const flags: PublicFlags = {
      pop_page_v2_enabled: cfg.pop_page_v2_enabled === true,
      landing_v2_enabled: cfg.landing_v2_enabled === true,
    }
    cache = { at: now, flags }
    return flags
  } catch {
    const flags: PublicFlags = {
      pop_page_v2_enabled: false,
      landing_v2_enabled: false,
    }
    cache = { at: now, flags }
    return flags
  }
}
