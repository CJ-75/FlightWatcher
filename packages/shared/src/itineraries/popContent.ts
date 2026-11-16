/** Shared Pop editorial parsers / labels — used by Next, Vite, Expo, admin. */

export type FaqItem = { q: string; a: string }

export type StayInfo = {
  area?: string
  note?: string
  vibe?: string
}

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

export function paceLabelFr(raw: string | null | undefined): string {
  const k = String(raw || '').trim()
  if (!k) return ''
  return PACE_LABEL[k] || k
}

export const MOMENT_LABEL_FR: Record<string, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  evening: 'Soir',
}

export function momentLabelFr(raw: string | null | undefined): string {
  const k = String(raw || '').trim()
  if (!k) return ''
  return MOMENT_LABEL_FR[k] || k
}

/** Read travel minutes from itinerary_items.meta soft keys. */
export function travelMinutesFromMeta(
  meta: Record<string, unknown> | null | undefined,
): number | null {
  if (!meta || typeof meta !== 'object') return null
  const t =
    meta.travel_minutes ??
    meta.travel_time_min ??
    meta.walk_minutes ??
    meta.transit_minutes
  if (t == null) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

export function buildStayPayload(stay: {
  area?: string
  vibe?: string
  note?: string
}): StayInfo | null {
  const area = String(stay.area || '').trim()
  const vibe = String(stay.vibe || '').trim()
  const note = String(stay.note || '').trim()
  if (!area && !vibe && !note) return null
  return {
    area: area || undefined,
    vibe: vibe || undefined,
    note: note || undefined,
  }
}
