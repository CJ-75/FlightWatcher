/**
 * Pluggable media storage — swap providers without rewriting callers.
 * Default backend: Supabase Storage (+ Image Transforms for display).
 */

export type MediaProviderId = 'supabase' | 'api' | 'none'

/** Logical folders inside the bucket. */
export type MediaKind =
  | 'parcours-cover'
  | 'parcours-step'
  | 'generic'

export type MediaUploadSource =
  | {
      /** Browser File / Blob */
      kind: 'blob'
      blob: Blob
      fileName?: string
      contentType?: string
    }
  | {
      /** React Native local URI (file://, content://, ph://, …) */
      kind: 'uri'
      uri: string
      fileName?: string
      contentType?: string
    }

export type MediaUploadInput = {
  source: MediaUploadSource
  kind?: MediaKind
  /** Optional owner segment (user id). Backend may override. */
  ownerId?: string
}

export type MediaUploadResult = {
  url: string
  path: string
  provider: MediaProviderId
  bucket: string
}

export type MediaDisplayOpts = {
  width?: number
  height?: number
  quality?: number
  /** Prefer transform CDN when provider supports it (Supabase Image Transforms). */
  transform?: boolean
}

export interface MediaStorage {
  readonly provider: MediaProviderId
  isConfigured(): boolean | Promise<boolean>
  upload(input: MediaUploadInput): Promise<MediaUploadResult>
  /** Resize / quality URL when supported; otherwise returns original. */
  displayUrl(url: string, opts?: MediaDisplayOpts): string
}
