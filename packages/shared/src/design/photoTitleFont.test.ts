import { describe, expect, it } from 'vitest'
import {
  PHOTO_TITLE_FONT,
  assertPhotoTitleFont,
  isPhotoTitleFamily,
} from './photoTitleFont'

describe('photoTitleFont', () => {
  it('accepts Sora (web + expo)', () => {
    expect(isPhotoTitleFamily('Sora')).toBe(true)
    expect(isPhotoTitleFamily('Sora_800ExtraBold')).toBe(true)
    expect(() => assertPhotoTitleFont('Sora')).not.toThrow()
    expect(() =>
      assertPhotoTitleFont(PHOTO_TITLE_FONT.expoFamily),
    ).not.toThrow()
  })

  it('fails on Instrument Serif / system fallback', () => {
    expect(() =>
      assertPhotoTitleFont('InstrumentSerif_400Regular_Italic'),
    ).toThrow(/forbidden|Sora/)
    expect(() => assertPhotoTitleFont('system-ui')).toThrow(/Sora/)
    expect(() => assertPhotoTitleFont(null)).toThrow(/Sora/)
  })

  it('exports roman Sora, not italic', () => {
    expect(PHOTO_TITLE_FONT.expoFamily).toBe('Sora_800ExtraBold')
    expect(PHOTO_TITLE_FONT.style).toBe('normal')
  })
})
