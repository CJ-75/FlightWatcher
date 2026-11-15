/** Mobile browser detection + App Store / Play Store URLs for web→app promo. */

export type MobileStoreKind = 'ios' | 'android' | null

export function isStandaloneWebApp(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    const nav = window.navigator as Navigator & { standalone?: boolean }
    if (nav.standalone === true) return true
  } catch {
    /* ignore */
  }
  return false
}

/** Phone/tablet browser — not desktop, not installed PWA. */
export function isMobileWebBrowser(ua = navigator.userAgent): boolean {
  if (typeof window === 'undefined') return false
  if (isStandaloneWebApp()) return false
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true
  }
  // iPadOS 13+ may report as Mac with touch
  try {
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

export function detectMobileStore(ua = navigator.userAgent): MobileStoreKind {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  try {
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
      return 'ios'
    }
  } catch {
    /* ignore */
  }
  if (/Android/i.test(ua)) return 'android'
  // Other mobile (rare) → Play as generic Android-ish fallback
  if (isMobileWebBrowser(ua)) return 'android'
  return null
}

function envUrl(key: string): string | undefined {
  try {
    const v = (import.meta.env as Record<string, string | undefined>)[key]
    return v?.trim() || undefined
  } catch {
    return undefined
  }
}

/** Prefer env when apps are live; generic store roots until then. */
export function storeUrlFor(kind: MobileStoreKind): string {
  if (kind === 'ios') {
    return (
      envUrl('VITE_IOS_APP_STORE_URL') ||
      'https://apps.apple.com/app/waypop'
    )
  }
  if (kind === 'android') {
    return (
      envUrl('VITE_ANDROID_PLAY_STORE_URL') ||
      'https://play.google.com/store/apps/details?id=com.waypop.app'
    )
  }
  return 'https://waypop.co'
}

export function storeCtaLabel(kind: MobileStoreKind): string {
  if (kind === 'ios') return 'Télécharger sur l’App Store'
  if (kind === 'android') return 'Télécharger sur Google Play'
  return 'Télécharger l’app'
}

export function storeShortLabel(kind: MobileStoreKind): string {
  if (kind === 'ios') return 'App Store'
  if (kind === 'android') return 'Google Play'
  return 'l’app'
}
