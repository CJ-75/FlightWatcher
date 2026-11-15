import { createApiMediaStorage, type ApiMediaStorageOptions } from './providers/apiStorage'
import {
  createSupabaseMediaStorage,
  type SupabaseMediaStorageOptions,
} from './providers/supabaseStorage'
import type { MediaProviderId, MediaStorage } from './types'

export type CreateMediaStorageOptions = {
  /**
   * `api` — POST /api/media/upload (recommended: admin cookie + mobile, easy to swap backend).
   * `supabase` — direct Storage client (needs auth.uid RLS).
   * `none` — throws on upload.
   */
  provider?: MediaProviderId
  api?: ApiMediaStorageOptions
  supabase?: SupabaseMediaStorageOptions
}

const noneStorage: MediaStorage = {
  provider: 'none',
  isConfigured: () => false,
  async upload() {
    throw new Error('Media storage désactivé (MEDIA_PROVIDER=none)')
  },
  displayUrl(url) {
    return url
  },
}

/**
 * Factory — change `provider` (or env) to swap implementations later.
 */
export function createMediaStorage(
  options: CreateMediaStorageOptions = {},
): MediaStorage {
  const provider = options.provider || 'api'

  if (provider === 'none') return noneStorage

  if (provider === 'supabase') {
    if (!options.supabase?.getClient) {
      throw new Error('createMediaStorage(supabase) requires supabase.getClient')
    }
    return createSupabaseMediaStorage(options.supabase)
  }

  // default + explicit `api`
  return createApiMediaStorage(options.api || {})
}

/** Resolve provider id from env-like string. */
export function parseMediaProviderId(
  raw?: string | null,
  fallback: MediaProviderId = 'api',
): MediaProviderId {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  if (v === 'supabase' || v === 'api' || v === 'none') return v
  return fallback
}
