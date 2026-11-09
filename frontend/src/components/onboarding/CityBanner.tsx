/**
 * Bandeau ville web — change departure city without airport codes in UI.
 */
import React, { useEffect, useState } from 'react'
import {
  loadOnboardingPrefs,
  setDepartureCity,
  suggestCityFromLocale,
} from '@flightwatcher/shared'
import { getApiClient } from '../../utils/apiClient'
import './CityBanner.css'

const CITIES = [
  { slug: 'paris', label: 'Paris', codes: 'CDG,ORY' },
  { slug: 'lyon', label: 'Lyon', codes: 'LYS' },
  { slug: 'marseille', label: 'Marseille', codes: 'MRS' },
  { slug: 'bordeaux', label: 'Bordeaux', codes: 'BOD' },
  { slug: 'toulouse', label: 'Toulouse', codes: 'TLS' },
  { slug: 'nantes', label: 'Nantes', codes: 'NTE' },
  { slug: 'nice', label: 'Nice', codes: 'NCE' },
  { slug: 'lille', label: 'Lille', codes: 'LIL' },
]

type Props = {
  onCityChange?: (codes: string, label: string) => void
}

export function CityBanner({ onCityChange }: Props) {
  const [label, setLabel] = useState('Paris')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void loadOnboardingPrefs().then((p) => {
      if (p.departureCityLabel) {
        setLabel(p.departureCityLabel)
        return
      }
      const s = suggestCityFromLocale(
        navigator.language,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      )
      setLabel(s.label)
      const match = CITIES.find((c) => c.slug === s.slug) || CITIES[0]
      void setDepartureCity({
        slug: match.slug,
        label: match.label,
        airportCodes: match.codes,
      })
      onCityChange?.(match.codes, match.label)
    })
  }, [onCityChange])

  const pick = (c: (typeof CITIES)[0]) => {
    setLabel(c.label)
    setOpen(false)
    void setDepartureCity({
      slug: c.slug,
      label: c.label,
      airportCodes: c.codes,
    })
    void getApiClient()
      .trackActivityEvent({
        domain: 'onboarding',
        event: 'onboarding_city_set',
        surface: 'onboarding',
        platform: 'web',
        meta: { slug: c.slug },
      })
      .catch(() => {})
    onCityChange?.(c.codes, c.label)
  }

  return (
    <div className="fw-city-banner">
      <button
        type="button"
        className="fw-city-banner-btn"
        onClick={() => setOpen((v) => !v)}
      >
        Départ <strong>{label}</strong>
        <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div className="fw-city-banner-menu" role="listbox">
          {CITIES.map((c) => (
            <button
              key={c.slug}
              type="button"
              role="option"
              className="fw-city-banner-option"
              onClick={() => pick(c)}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
