import { describe, expect, it } from 'vitest'
import { classifyPlaceBucket, parseShareText } from './linkParse'

const TOMAHAWK =
  'https://www.google.fr/maps/place/Tomahawk+Restaurant/@48.8916981,2.2515455,17z/data=!3m1!4b1!4m6!3m5!1s0x47e665b801bd577d:0x357ed25d11e9cbb7!8m2!3d48.8916946!4d2.2541204!16s%2Fg%2F11q_7vmhbk?entry=tts&g_ep=abc&skid=xyz'

describe('parseShareText google maps', () => {
  it('prefers !3d/!4d over @ and strips trackers', () => {
    const [p] = parseShareText(TOMAHAWK)
    expect(p.source).toBe('google_maps')
    expect(p.name).toBe('Tomahawk Restaurant')
    expect(p.lat).toBeCloseTo(48.8916946, 5)
    expect(p.lng).toBeCloseTo(2.2541204, 5)
    expect(p.mapCenterLat).toBeCloseTo(48.8916981, 5)
    expect(p.googleCid).toBe('3854749628250049463')
    expect(p.urlClean).not.toMatch(/entry=|g_ep=|skid=/)
  })

  it('classifies restaurant names', () => {
    expect(classifyPlaceBucket('Tomahawk Restaurant')).toBe('restaurant')
    expect(classifyPlaceBucket('Musée d’Orsay')).toBe('attraction')
    expect(classifyPlaceBucket('Somewhere')).toBe('unknown')
  })
})
