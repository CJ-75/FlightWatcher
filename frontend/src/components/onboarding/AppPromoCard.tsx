import React, { useEffect } from 'react'
import {
  loadOnboardingPrefs,
  saveOnboardingPrefs,
} from '@waypop/shared'
import { getApiClient } from '../../utils/apiClient'
import {
  detectMobileStore,
  isMobileWebBrowser,
  storeCtaLabel,
  storeShortLabel,
  storeUrlFor,
  type MobileStoreKind,
} from '../../utils/mobileStore'
import './AppPromoCard.css'

type Variant = 'invite' | 'onboarding'

type Props = {
  /** Deep link path without scheme (invite). Ignored for onboarding store-only. */
  deepLinkPath?: string
  /** Compact variant under invite CTA */
  compact?: boolean
  /**
   * `invite` — try open app then store fallback (existing).
   * `onboarding` — store download card for mobile browser only.
   */
  variant?: Variant
  /** Force store (tests); default = detect from UA */
  store?: MobileStoreKind
  /** When false, show even on desktop (default: mobile-only for onboarding) */
  mobileOnly?: boolean
  surface?: string
}

export function AppPromoCard({
  deepLinkPath = '',
  compact,
  variant = 'invite',
  store: storeProp,
  mobileOnly,
  surface,
}: Props) {
  const [hidden, setHidden] = React.useState(true)
  const store = storeProp ?? detectMobileStore()
  const onlyMobile = mobileOnly ?? variant === 'onboarding'
  const trackSurface =
    surface || (variant === 'onboarding' ? 'onboarding' : 'invite_landing')

  useEffect(() => {
    if (onlyMobile && !isMobileWebBrowser()) {
      setHidden(true)
      return
    }
    if (variant === 'onboarding' && !store) {
      setHidden(true)
      return
    }
    void loadOnboardingPrefs().then((p) => {
      setHidden(p.appPromoDismissed)
      if (!p.appPromoDismissed) {
        void getApiClient()
          .trackActivityEvent({
            domain: variant === 'onboarding' ? 'onboarding' : 'invite',
            event: 'app_promo_shown',
            surface: trackSurface,
            platform: 'web',
            meta: { variant, store: store || 'unknown' },
          })
          .catch(() => {})
      }
    })
  }, [onlyMobile, store, trackSurface, variant])

  if (hidden) return null
  if (onlyMobile && !isMobileWebBrowser()) return null
  if (variant === 'onboarding' && !store) return null

  const storeUrl = storeUrlFor(store)
  const appUrl = deepLinkPath
    ? `waypop://${deepLinkPath.replace(/^\//, '')}`
    : null

  const dismiss = () => {
    void saveOnboardingPrefs({ appPromoDismissed: true })
    setHidden(true)
    void getApiClient()
      .trackActivityEvent({
        domain: variant === 'onboarding' ? 'onboarding' : 'invite',
        event: 'app_promo_dismissed',
        surface: trackSurface,
        platform: 'web',
        meta: { variant, store: store || 'unknown' },
      })
      .catch(() => {})
  }

  const openStore = () => {
    void getApiClient()
      .trackActivityEvent({
        domain: variant === 'onboarding' ? 'onboarding' : 'invite',
        event: 'app_promo_clicked',
        surface: trackSurface,
        platform: 'web',
        meta: { variant, store: store || 'unknown', action: 'store' },
      })
      .catch(() => {})
    window.open(storeUrl, '_blank', 'noopener,noreferrer')
  }

  const openInvite = () => {
    void getApiClient()
      .trackActivityEvent({
        domain: 'invite',
        event: 'app_promo_clicked',
        surface: trackSurface,
        platform: 'web',
        meta: { variant, store: store || 'unknown', action: 'deeplink' },
      })
      .catch(() => {})
    if (appUrl) {
      window.location.href = appUrl
      setTimeout(() => {
        window.open(storeUrl, '_blank', 'noopener,noreferrer')
      }, 800)
    } else {
      openStore()
    }
  }

  if (variant === 'onboarding') {
    return (
      <div
        className={`fw-app-promo fw-app-promo--onboarding${
          compact ? ' fw-app-promo--compact' : ''
        }`}
        data-store={store || undefined}
      >
        <div className="fw-app-promo-badge" aria-hidden>
          {store === 'ios' ? 'iOS' : 'GP'}
        </div>
        <div className="fw-app-promo-copy">
          <strong>L’app WayPop, c’est mieux</strong>
          <span>
            Sur mobile, télécharge l’app sur {storeShortLabel(store)} pour
            notifications, parcours et voyages.
          </span>
        </div>
        <div className="fw-app-promo-actions">
          <button type="button" className="fw-app-promo-cta" onClick={openStore}>
            {storeCtaLabel(store)}
          </button>
          <button
            type="button"
            className="fw-app-promo-x"
            onClick={dismiss}
            aria-label="Masquer"
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`fw-app-promo${compact ? ' fw-app-promo--compact' : ''}`}>
      <div className="fw-app-promo-copy">
        <strong>Ouvre dans l’app</strong>
        <span>Plus simple pour rejoindre et suivre le voyage.</span>
      </div>
      <div className="fw-app-promo-actions">
        <button type="button" className="fw-app-promo-cta" onClick={openInvite}>
          Ouvrir
        </button>
        <button
          type="button"
          className="fw-app-promo-x"
          onClick={dismiss}
          aria-label="Masquer"
        >
          ×
        </button>
      </div>
    </div>
  )
}
