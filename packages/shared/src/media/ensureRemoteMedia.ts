import { isLocalMediaUri, isRemoteHttpMediaUrl } from './localUri'
import type { MediaKind, MediaStorage } from './types'

/**
 * If `url` is a local device URI, upload it and return the public https URL.
 * Remote http(s) URLs are returned unchanged.
 */
export async function ensureRemoteMediaUrl(
  storage: MediaStorage,
  url: string | null | undefined,
  kind: MediaKind = 'generic',
): Promise<string | null> {
  const t = String(url || '').trim()
  if (!t) return null
  if (isRemoteHttpMediaUrl(t) && !isLocalMediaUri(t)) return t
  if (!isLocalMediaUri(t)) {
    // relative / unknown — reject for publish safety
    throw new Error('URL média invalide (http(s) ou fichier local attendu)')
  }

  const result = await storage.upload({
    kind,
    source: { kind: 'uri', uri: t },
  })
  return result.url
}

/** Map a list of photo URIs; preserves order; drops empties. */
export async function ensureRemoteMediaUrls(
  storage: MediaStorage,
  urls: Array<string | null | undefined>,
  kind: MediaKind = 'generic',
): Promise<string[]> {
  const out: string[] = []
  for (const raw of urls) {
    const next = await ensureRemoteMediaUrl(storage, raw, kind)
    if (next && !out.includes(next)) out.push(next)
  }
  return out
}
