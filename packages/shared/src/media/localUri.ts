/** Device / draft URIs that are not usable on other clients. */
const LOCAL_SCHEME =
  /^(file:|content:|ph:|assets-library:|blob:|data:)/i

export function isLocalMediaUri(url?: string | null): boolean {
  const t = String(url || '').trim()
  if (!t) return false
  if (LOCAL_SCHEME.test(t)) return true
  // Expo ImagePicker sometimes returns bare absolute paths on Android
  if (t.startsWith('/') && !t.startsWith('//')) return true
  return false
}

export function isRemoteHttpMediaUrl(url?: string | null): boolean {
  return /^https?:\/\//i.test(String(url || '').trim())
}

export function guessImageContentType(
  fileNameOrUri?: string | null,
  fallback = 'image/jpeg',
): string {
  const s = String(fileNameOrUri || '').toLowerCase()
  if (s.includes('.png')) return 'image/png'
  if (s.includes('.webp')) return 'image/webp'
  if (s.includes('.heic') || s.includes('.heif')) return 'image/heic'
  if (s.includes('.gif')) return 'image/gif'
  if (s.includes('.jpg') || s.includes('.jpeg')) return 'image/jpeg'
  return fallback
}

export function guessImageFileName(
  uriOrName?: string | null,
  fallback = 'photo.jpg',
): string {
  const raw = String(uriOrName || '').trim()
  if (!raw) return fallback
  const base = raw.split(/[\\/]/).pop() || fallback
  const clean = base.split('?')[0].split('#')[0]
  if (/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(clean)) return clean
  return fallback
}
