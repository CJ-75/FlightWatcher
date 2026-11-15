export type {
  MediaDisplayOpts,
  MediaKind,
  MediaProviderId,
  MediaStorage,
  MediaUploadInput,
  MediaUploadResult,
  MediaUploadSource,
} from './types'

export {
  guessImageContentType,
  guessImageFileName,
  isLocalMediaUri,
  isRemoteHttpMediaUrl,
} from './localUri'

export { mediaDisplayUrl, supabaseTransformUrl } from './displayUrl'

export {
  createMediaStorage,
  parseMediaProviderId,
  type CreateMediaStorageOptions,
} from './createMediaStorage'

export {
  createApiMediaStorage,
  type ApiMediaStorageOptions,
} from './providers/apiStorage'

export {
  createSupabaseMediaStorage,
  type SupabaseMediaStorageOptions,
} from './providers/supabaseStorage'

export {
  ensureRemoteMediaUrl,
  ensureRemoteMediaUrls,
} from './ensureRemoteMedia'
