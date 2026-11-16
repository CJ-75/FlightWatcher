import { mediaDisplayUrl } from '../displayUrl'
import {
  guessImageContentType,
  guessImageFileName,
} from '../localUri'
import type {
  MediaDisplayOpts,
  MediaStorage,
  MediaUploadInput,
  MediaUploadResult,
} from '../types'

export type ApiMediaStorageOptions = {
  /** Absolute or empty (same-origin). */
  baseUrl?: string
  /** Path default `/api/media/upload`. */
  uploadPath?: string
  getToken?: () => Promise<string | null>
  /** Include cookies (admin session). */
  credentials?: RequestCredentials
  fetchImpl?: typeof fetch
  /**
   * Underlying storage id returned by the API today (`supabase`).
   * Used only for displayUrl transforms.
   */
  displayProvider?: 'supabase' | 'api'
}

function joinUrl(base: string, path: string): string {
  const b = (base || '').replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

/**
 * Upload via WayPop API — single switch point for future S3/Cloudinary.
 * Backend currently writes to Supabase Storage.
 */
export function createApiMediaStorage(
  options: ApiMediaStorageOptions = {},
): MediaStorage {
  const fetchFn = options.fetchImpl ?? fetch.bind(globalThis)
  const uploadPath = options.uploadPath || '/api/media/upload'
  const displayProvider = options.displayProvider || 'supabase'

  return {
    provider: 'api',

    isConfigured() {
      return true
    },

    async upload(input: MediaUploadInput): Promise<MediaUploadResult> {
      const form = new FormData()
      form.append('kind', input.kind || 'generic')
      if (input.ownerId) form.append('owner_id', input.ownerId)

      const src = input.source
      if (src.kind === 'blob') {
        const name = guessImageFileName(src.fileName, 'photo.jpg')
        const type =
          src.contentType ||
          src.blob.type ||
          guessImageContentType(name)
        form.append('file', src.blob, name)
        // Some servers prefer explicit type via filename only
        void type
      } else {
        const name = guessImageFileName(src.fileName || src.uri, 'photo.jpg')
        const type = src.contentType || guessImageContentType(name)
        // RN legacy FormData shape — Expo SDK 54+ global fetch may reject this.
        // Mobile should upload via expo-file-system File.upload instead.
        form.append('file', {
          uri: src.uri,
          name,
          type,
        } as unknown as Blob)
      }

      const headers = new Headers()
      if (options.getToken) {
        const token = await options.getToken()
        if (token) headers.set('Authorization', `Bearer ${token}`)
      }
      // Do NOT set Content-Type — boundary is set by fetch/FormData

      const res = await fetchFn(joinUrl(options.baseUrl || '', uploadPath), {
        method: 'POST',
        headers,
        body: form,
        credentials: options.credentials || 'include',
      })

      const text = await res.text().catch(() => '')
      let data: Record<string, unknown> = {}
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
      } catch {
        data = { detail: text }
      }

      if (!res.ok) {
        const detail =
          typeof data.detail === 'string'
            ? data.detail
            : typeof data.error === 'string'
              ? data.error
              : `Upload échoué (${res.status})`
        throw new Error(detail)
      }

      const url = String(data.url || '').trim()
      const path = String(data.path || '').trim()
      const bucket = String(data.bucket || 'media').trim()
      if (!url) throw new Error('Réponse upload sans URL')

      return {
        url,
        path,
        bucket,
        provider: 'api',
      }
    },

    displayUrl(url: string, opts?: MediaDisplayOpts) {
      return mediaDisplayUrl(url, opts, displayProvider)
    },
  }
}
