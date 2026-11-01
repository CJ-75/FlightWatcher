import type { EventPlatform } from './labels'

/** Detect client platform for events.platform. */
export function detectEventPlatform(
  hint?: 'web' | 'ios' | 'android' | string | null,
): EventPlatform {
  if (hint === 'web' || hint === 'ios' || hint === 'android') return hint
  if (typeof navigator === 'undefined') return 'web'
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  return 'web'
}
