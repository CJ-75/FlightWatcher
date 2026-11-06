/** Europe/Paris wall-clock helpers for Séjours client filters. */

type DealLike = {
  dates?: { outbound?: string | null } | null
  flight?: {
    outbound_local?: string | null
    out_dep_local?: string | null
  } | null
  out_date?: string | null
}

function parisNowParts(): { date: string; hm: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hm: `${get('hour')}:${get('minute')}`,
  }
}

/** True if deal outbound start (Paris) is still upcoming. */
export function dealStartStillUpcoming(deal: DealLike): boolean {
  const raw = String(
    deal.flight?.outbound_local || deal.flight?.out_dep_local || '',
  ).trim()
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/)
  const now = parisNowParts()
  if (m) {
    const startKey = `${m[1]}T${m[2]}:${m[3]}`
    const nowKey = `${now.date}T${now.hm}`
    return startKey > nowKey
  }
  const out =
    String(deal.dates?.outbound || deal.out_date || '').slice(0, 10) || ''
  return out.length >= 10 && out >= now.date
}
