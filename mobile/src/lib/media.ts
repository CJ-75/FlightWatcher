import {
  createMediaStorage,
  guessImageContentType,
  guessImageFileName,
  parseMediaProviderId,
  type MediaStorage,
  type MediaUploadInput,
  type MediaUploadResult,
} from '@waypop/shared'
import Constants from 'expo-constants'
import { File, UploadType } from 'expo-file-system'
import { apiBase, auth } from './client'

function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env
  const fromProcess = proc?.[name]?.trim()
  if (fromProcess) return fromProcess
  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined
  return extra?.[name]?.trim()
}

let cached: MediaStorage | null = null

function clientHeader(): string {
  const expoDev =
    Constants.appOwnership === 'expo' ||
    (typeof __DEV__ !== 'undefined' && __DEV__)
  return expoDev ? 'expo' : 'mobile'
}

/**
 * Expo 54+ : FormData + { uri, name, type } ou Response.blob() crashent.
 * Upload natif multipart via expo-file-system File.upload.
 */
async function uploadUriWithExpoFile(
  input: MediaUploadInput & { source: { kind: 'uri'; uri: string; fileName?: string; contentType?: string } },
): Promise<MediaUploadResult> {
  const src = input.source
  const name = guessImageFileName(src.fileName || src.uri, 'photo.jpg')
  const type = src.contentType || guessImageContentType(name)
  const file = new File(src.uri)
  const token = await auth.getAccessToken()
  const headers: Record<string, string> = {
    'X-FW-Client': clientHeader(),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const parameters: Record<string, string> = {
    kind: input.kind || 'generic',
  }
  if (input.ownerId) parameters.owner_id = input.ownerId

  const result = await file.upload(`${apiBase.replace(/\/$/, '')}/api/media/upload`, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType: type,
    parameters,
    headers,
  })

  let data: Record<string, unknown> = {}
  try {
    data = result.body ? (JSON.parse(result.body) as Record<string, unknown>) : {}
  } catch {
    data = { detail: result.body }
  }

  if (result.status < 200 || result.status >= 300) {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : typeof data.error === 'string'
          ? data.error
          : `Upload échoué (${result.status})`
    throw new Error(detail)
  }

  const url = String(data.url || '').trim()
  const path = String(data.path || '').trim()
  const bucket = String(data.bucket || 'media').trim()
  if (!url) throw new Error('Réponse upload sans URL')

  return { url, path, bucket, provider: 'api' }
}

/**
 * Default: API upload → Supabase Storage (switch via EXPO_PUBLIC_MEDIA_PROVIDER).
 * `supabase` = direct client Storage (needs logged-in user + RLS).
 */
export function getMediaStorage(): MediaStorage {
  if (cached) return cached

  const provider = parseMediaProviderId(
    env('EXPO_PUBLIC_MEDIA_PROVIDER'),
    'api',
  )

  const base = createMediaStorage({
    provider,
    api: {
      baseUrl: apiBase,
      getToken: () => auth.getAccessToken(),
      credentials: 'omit',
      fetchImpl: (input, init) => {
        const headers = new Headers(init?.headers)
        if (!headers.has('X-FW-Client')) {
          headers.set('X-FW-Client', clientHeader())
        }
        return fetch(input, { ...init, headers })
      },
    },
    supabase: {
      getClient: () => auth.getClient(),
      getUserId: async () => (await auth.getCurrentUser())?.id ?? null,
    },
  })

  cached = {
    ...base,
    async upload(input: MediaUploadInput): Promise<MediaUploadResult> {
      if (provider === 'api' && input.source.kind === 'uri') {
        return uploadUriWithExpoFile(
          input as MediaUploadInput & {
            source: {
              kind: 'uri'
              uri: string
              fileName?: string
              contentType?: string
            }
          },
        )
      }
      return base.upload(input)
    },
  }
  return cached
}
