/** Pure helpers for Pop pages — re-export shared parsers + local city tint. */

export {
  parseFaq,
  parseTips,
  parseStay,
  PACE_LABEL,
  type FaqItem,
  type StayInfo,
} from '@waypop/shared'

/** Soft city tint when no cover — never a grey box. */
export function cityFallbackStyle(colorKey?: string | null, city?: string): {
  background: string
} {
  const key = (colorKey || city || 'default').toLowerCase()
  const map: Record<string, string> = {
    paris:
      'linear-gradient(155deg, #161311 0%, #3a1810 42%, #ff5a1f 120%)',
    lyon: 'linear-gradient(155deg, #161311 0%, #4a2210 50%, #ff5a1f 120%)',
    marseille:
      'linear-gradient(155deg, #0c1a24 0%, #1a3a4a 45%, #ff5a1f 120%)',
    nice: 'linear-gradient(155deg, #0e1c2e 0%, #1e3a5f 45%, #ff5a1f 120%)',
    bordeaux:
      'linear-gradient(155deg, #1a0a0a 0%, #4a1515 45%, #ff5a1f 120%)',
    default:
      'linear-gradient(155deg, #161311 0%, #2a1810 40%, #ff5a1f 120%)',
  }
  return { background: map[key] || map.default! }
}
