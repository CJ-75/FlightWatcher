/**
 * Titres photo Parcours — Sora extrabold (police app), pas d’italique.
 * Conservé pour les tests de non-régression (pas de fallback système).
 */
export const PHOTO_TITLE_FONT = {
  expoFamily: 'Sora_800ExtraBold',
  webFamily: 'Sora',
  style: 'normal' as const,
  forbiddenFamilies: [
    'Instrument Serif',
    'InstrumentSerif_400Regular',
    'InstrumentSerif_400Regular_Italic',
    'Inter',
    'Roboto',
    'system-ui',
    'Arial',
    'Georgia',
  ],
} as const

export function isPhotoTitleFamily(family: string | null | undefined): boolean {
  if (!family) return false
  const n = family.replace(/['"]/g, '').toLowerCase()
  return (
    n.includes('sora') ||
    n === PHOTO_TITLE_FONT.expoFamily.toLowerCase()
  )
}

/** @deprecated alias */
export const isInstrumentSerifFamily = isPhotoTitleFamily

export function assertPhotoTitleFont(family: string | null | undefined): void {
  if (!isPhotoTitleFamily(family)) {
    throw new Error(
      `Photo title must use Sora (not italic serif), got: ${JSON.stringify(family)}`,
    )
  }
  for (const bad of PHOTO_TITLE_FONT.forbiddenFamilies) {
    if (
      family &&
      family.replace(/['"]/g, '').toLowerCase().includes(bad.toLowerCase())
    ) {
      throw new Error(`Photo title fell back to forbidden family: ${bad}`)
    }
  }
}
