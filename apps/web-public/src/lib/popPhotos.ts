/** Pop photo helpers — unique URLs per page, place-bound metadata. */

export type PopPhotoMeta = {
  src: string
  place_id?: string | null
  source?: string | null
  license?: string | null
  author?: string | null
}

/** Canonical URL without query noise for dedupe. */
export function photoIdentity(src: string | null | undefined): string | null {
  const s = String(src || '').trim()
  if (!s) return null
  try {
    const u = new URL(s, 'https://waypop.co')
    // Unsplash: identity by path id
    if (u.hostname.includes('unsplash.com')) {
      const m = u.pathname.match(/photo-[\w-]+/)
      return m ? `unsplash:${m[0]}` : u.href.split('?')[0]!
    }
    return `${u.origin}${u.pathname}`
  } catch {
    return s.split('?')[0] || s
  }
}

/** True if every non-empty photo URL is unique on the page. */
export function assertUniquePagePhotos(
  urls: Array<string | null | undefined>,
): { ok: boolean; duplicates: string[] } {
  const seen = new Map<string, number>()
  const duplicates: string[] = []
  for (const u of urls) {
    const id = photoIdentity(u)
    if (!id) continue
    const n = (seen.get(id) || 0) + 1
    seen.set(id, n)
    if (n === 2) duplicates.push(id)
  }
  return { ok: duplicates.length === 0, duplicates }
}

/** Assign photos without colliding with already used identities (cover first). */
export function pickExclusivePhoto(
  candidate: string | null | undefined,
  used: Set<string>,
): string | null {
  const id = photoIdentity(candidate)
  if (!id || !candidate) return null
  if (used.has(id)) return null
  used.add(id)
  return String(candidate)
}
