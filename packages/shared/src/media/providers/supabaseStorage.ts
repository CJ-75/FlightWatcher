import type { SupabaseClient } from '@supabase/supabase-js'
import { mediaDisplayUrl } from '../displayUrl'
import {
  guessImageContentType,
  guessImageFileName,
} from '../localUri'
import type {
  MediaDisplayOpts,
  MediaKind,
  MediaStorage,
  MediaUploadInput,
  MediaUploadResult,
} from '../types'

const DEFAULT_BUCKET = 'media'

export type SupabaseMediaStorageOptions = {
  getClient: () => Promise<SupabaseClient | null>
  bucket?: string
  /** Resolve current user id for path prefix (required for RLS). */
  getUserId?: () => Promise<string | null>
}

function folderForKind(kind: MediaKind | undefined): string {
  switch (kind) {
    case 'parcours-cover':
      return 'parcours/covers'
    case 'parcours-step':
      return 'parcours/steps'
    default:
      return 'uploads'
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function sourceToBlob(
  input: MediaUploadInput,
): Promise<{ blob: Blob; fileName: string; contentType: string }> {
  const src = input.source
  if (src.kind === 'blob') {
    const fileName = guessImageFileName(src.fileName, 'photo.jpg')
    const contentType =
      src.contentType ||
      src.blob.type ||
      guessImageContentType(fileName)
    return { blob: src.blob, fileName, contentType }
  }

  const fileName = guessImageFileName(src.fileName || src.uri, 'photo.jpg')
  const contentType =
    src.contentType || guessImageContentType(fileName)
  const res = await fetch(src.uri)
  if (!res.ok) {
    throw new Error(`Impossible de lire la photo (${res.status})`)
  }
  const blob = await res.blob()
  return { blob, fileName, contentType }
}

export function createSupabaseMediaStorage(
  options: SupabaseMediaStorageOptions,
): MediaStorage {
  const bucket = (options.bucket || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET

  return {
    provider: 'supabase',

    async isConfigured() {
      const client = await options.getClient()
      return Boolean(client)
    },

    async upload(input: MediaUploadInput): Promise<MediaUploadResult> {
      const client = await options.getClient()
      if (!client) {
        throw new Error('Supabase Storage non configuré')
      }

      const userId =
        (options.getUserId ? await options.getUserId() : null) || 'anon'
      const { blob, fileName, contentType } = await sourceToBlob(input)
      const ext = fileName.includes('.')
        ? fileName.split('.').pop()!.toLowerCase()
        : 'jpg'
      const path = `${folderForKind(input.kind)}/${userId}/${randomId()}.${ext}`

      const { error } = await client.storage.from(bucket).upload(path, blob, {
        contentType,
        upsert: false,
        cacheControl: '31536000',
      })
      if (error) {
        throw new Error(error.message || 'Upload Supabase échoué')
      }

      const { data } = client.storage.from(bucket).getPublicUrl(path)
      const url = data?.publicUrl
      if (!url) {
        throw new Error('URL publique Storage introuvable')
      }

      return { url, path, provider: 'supabase', bucket }
    },

    displayUrl(url: string, opts?: MediaDisplayOpts) {
      return mediaDisplayUrl(url, opts, 'supabase')
    },
  }
}
