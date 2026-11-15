/** Pure helpers for Pop pages — no invented editorial content. */

export type FaqItem = { q: string; a: string }

export function parseFaq(raw: unknown): FaqItem[] {
  if (!raw) return []
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : []
  const out: FaqItem[] = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const q = String(
      (row as { q?: unknown; question?: unknown }).q ||
        (row as { question?: unknown }).question ||
        '',
    ).trim()
    const a = String(
      (row as { a?: unknown; answer?: unknown }).a ||
        (row as { answer?: unknown }).answer ||
        '',
    ).trim()
    if (q && a) out.push({ q, a })
  }
  return out
}

export function parseTips(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean)
  }
  if (typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)) {
    return (raw as { items: unknown[] }).items
      .map((t) => String(t).trim())
      .filter(Boolean)
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()]
  return []
}

export type StayInfo = {
  area?: string
  note?: string
  vibe?: string
}

export function parseStay(raw: unknown): StayInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const area = String(o.area || o.quartier || o.neighborhood || '').trim()
  const note = String(o.note || o.text || o.description || '').trim()
  const vibe = String(o.vibe || o.style || '').trim()
  if (!area && !note && !vibe) return null
  return {
    area: area || undefined,
    note: note || undefined,
    vibe: vibe || undefined,
  }
}

export const PACE_LABEL: Record<string, string> = {
  slow: 'Rythme doux',
  moderate: 'Rythme modéré',
  packed: 'Rythme soutenu',
}

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
