import {
  createMediaStorage,
  parseMediaProviderId,
  type MediaStorage,
} from '@waypop/shared'
import { getAccessToken, getSupabaseClient } from './supabase'
import { getApiBaseUrl } from '../utils/apiBase'

let cached: MediaStorage | null = null

function envProvider(): string | undefined {
  return import.meta.env.VITE_MEDIA_PROVIDER as string | undefined
}

/**
 * Web media — default `api` (admin cookie + optional Bearer).
 * Set VITE_MEDIA_PROVIDER=supabase for direct Storage client.
 */
export function getMediaStorage(): MediaStorage {
  if (cached) return cached

  const provider = parseMediaProviderId(envProvider(), 'api')

  cached = createMediaStorage({
    provider,
    api: {
      baseUrl: getApiBaseUrl(),
      uploadPath: '/api/media/upload',
      getToken: () => getAccessToken(),
      credentials: 'include',
    },
    supabase: {
      getClient: () => getSupabaseClient(),
      getUserId: async () => {
        const c = await getSupabaseClient()
        if (!c) return null
        const { data } = await c.auth.getUser()
        return data.user?.id ?? null
      },
    },
  })
  return cached
}

export async function uploadImageFile(
  file: File,
  kind: 'parcours-cover' | 'parcours-step' | 'generic' = 'generic',
): Promise<string> {
  const result = await getMediaStorage().upload({
    kind,
    source: {
      kind: 'blob',
      blob: file,
      fileName: file.name,
      contentType: file.type || undefined,
    },
  })
  return result.url
}
