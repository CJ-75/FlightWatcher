'use client'

import { useEffect, useState } from 'react'
import { androidStoreUrl, iosStoreUrl } from '@/lib/appStores'

type Kind = 'ios' | 'android' | 'both'

type Props = {
  variant?: 'solid' | 'nav' | 'ghost' | 'badges'
  className?: string
  label?: string
}

function detect(): Kind {
  if (typeof navigator === 'undefined') return 'both'
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  try {
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
      return 'ios'
    }
  } catch {
    /* ignore */
  }
  if (/Android/i.test(ua)) return 'android'
  return 'both'
}

const storeBtn =
  'inline-flex items-center gap-2.5 rounded-2xl bg-ink px-4 py-2.5 text-cream no-underline shadow-lift transition-transform hover:scale-[1.02]'

export function LandingStoreCtas({
  variant = 'solid',
  className = '',
  label,
}: Props) {
  const [kind, setKind] = useState<Kind>('both')
  useEffect(() => {
    setKind(detect())
  }, [])

  const href = kind === 'android' ? androidStoreUrl() : iosStoreUrl()

  if (variant === 'badges') {
    const showIos = kind === 'both' || kind === 'ios'
    const showAndroid = kind === 'both' || kind === 'android'
    return (
      <div className={`flex flex-wrap items-center gap-3 ${className}`}>
        {showIos ? (
          <a
            href={iosStoreUrl()}
            className={storeBtn}
            rel="noopener noreferrer"
            target="_blank"
          >
            <AppleIcon />
            <span className="text-left leading-tight">
              <span className="block text-[10px] font-medium opacity-80">
                Télécharger sur
              </span>
              <span className="block text-sm font-bold">App Store</span>
            </span>
          </a>
        ) : null}
        {showAndroid ? (
          <a
            href={androidStoreUrl()}
            className={storeBtn}
            rel="noopener noreferrer"
            target="_blank"
          >
            <PlayIcon />
            <span className="text-left leading-tight">
              <span className="block text-[10px] font-medium opacity-80">
                Dispo sur
              </span>
              <span className="block text-sm font-bold">Google Play</span>
            </span>
          </a>
        ) : null}
      </div>
    )
  }

  if (variant === 'nav' || variant === 'solid') {
    return (
      <a
        href={href}
        className={`wp-cta-ink ${className}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        {label || (variant === 'nav' ? 'Télécharger' : 'Get Started')}
      </a>
    )
  }

  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      <a
        href={iosStoreUrl()}
        className="wp-cta-ink"
        rel="noopener noreferrer"
        target="_blank"
      >
        App Store
      </a>
      <a
        href={androidStoreUrl()}
        className="wp-cta-ghost"
        rel="noopener noreferrer"
        target="_blank"
      >
        Google Play
      </a>
    </div>
  )
}

function AppleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.4 12.6c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.7-2.8-.7-1.4 0-2.8.9-3.5 2.2-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.1 1.1-.1 1.5-.7 2.8-.7s1.7.7 2.8.6c1.2-.1 1.9-1 2.6-2 .8-1.2 1.1-2.3 1.2-2.4-.1 0-2.2-.8-2.2-3.6zM14.5 6.3c.6-.7 1-1.7.9-2.7-1 .1-2.1.6-2.7 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2.1-.5 2.8-1.4z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 3.5v17l15-8.5L4 3.5z" fill="currentColor" />
    </svg>
  )
}
