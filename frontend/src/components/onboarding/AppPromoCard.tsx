import React, { useEffect } from 'react'
import {
  loadOnboardingPrefs,
  saveOnboardingPrefs,
} from '@flightwatcher/shared'
import { getApiClient } from '../../utils/apiClient'
import './AppPromoCard.css'

type Props = {
  deepLinkPath: string
  /** Compact variant under invite CTA */
  compact?: boolean
}

export function AppPromoCard({ deepLinkPath, compact }: Props) {
  const [hidden, setHidden] = React.useState(true)

  useEffect(() => {
    void loadOnboardingPrefs().then((p) => {
      setHidden(p.appPromoDismissed)
      if (!p.appPromoDismissed) {
        void getApiClient()
          .trackActivityEvent({
            domain: 'invite',
            event: 'app_promo_shown',
            surface: 'invite_landing',
            platform: 'web',
            meta: {},
          })
          .catch(() => {})
      }
    })
  }, [])

  if (hidden) return null

  const appUrl = `flightwatcher://${deepLinkPath.replace(/^\//, '')}`
  const storeUrl =
    /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? 'https://apps.apple.com'
      : 'https://play.google.com/store'

  const dismiss = () => {
    void saveOnboardingPrefs({ appPromoDismissed: true })
    setHidden(true)
    void getApiClient()
      .trackActivityEvent({
        domain: 'invite',
        event: 'app_promo_dismissed',
        surface: 'invite_landing',
        platform: 'web',
        meta: {},
      })
      .catch(() => {})
  }

  const open = () => {
    void getApiClient()
      .trackActivityEvent({
        domain: 'invite',
        event: 'app_promo_clicked',
        surface: 'invite_landing',
        platform: 'web',
        meta: {},
      })
      .catch(() => {})
    window.location.href = appUrl
    setTimeout(() => {
      window.open(storeUrl, '_blank', 'noopener,noreferrer')
    }, 800)
  }

  return (
    <div className={`fw-app-promo${compact ? ' fw-app-promo--compact' : ''}`}>
      <div className="fw-app-promo-copy">
        <strong>Ouvre dans l’app</strong>
        <span>Plus simple pour rejoindre et suivre le voyage.</span>
      </div>
      <div className="fw-app-promo-actions">
        <button type="button" className="fw-app-promo-cta" onClick={open}>
          Ouvrir
        </button>
        <button type="button" className="fw-app-promo-x" onClick={dismiss} aria-label="Masquer">
          ×
        </button>
      </div>
    </div>
  )
}
