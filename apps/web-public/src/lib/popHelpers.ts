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
    paris: 'linear-gradient(145deg, #1D1B19 0%, #C2410C 55%, #FF6B35 100%)',
    lyon: 'linear-gradient(145deg, #1D1B19 0%, #7C2D12 50%, #FF6B35 100%)',
    marseille: 'linear-gradient(145deg, #0C4A6E 0%, #0369A1 50%, #FF6B35 100%)',
    nice: 'linear-gradient(145deg, #1E3A5F 0%, #2563EB 45%, #FF6B35 100%)',
    bordeaux: 'linear-gradient(145deg, #3B0A0A 0%, #7F1D1D 50%, #FF6B35 100%)',
    default: 'linear-gradient(145deg, #1D1B19 0%, #8B2E0E 45%, #FF6B35 100%)',
  }
  return { background: map[key] || map.default! }
}
