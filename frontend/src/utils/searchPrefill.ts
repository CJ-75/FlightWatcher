/** Lot E — open Search tab with origin / destination / pax / dates from Deals. */

export type SearchPrefill = {
  origin?: string
  destination?: string
  city?: string
  adults?: number
  /** YYYY-MM-DD — aller */
  outbound?: string
  /** YYYY-MM-DD — retour */
  inbound?: string
  /** If true with outbound+inbound+origin → run inspire immediately */
  autoSearch?: boolean
}

export const SEARCH_PREFILL_KEY = 'fw_search_prefill'
export const OPEN_SEARCH_EVENT = 'fw:open-search'

export function stashSearchPrefill(prefill: SearchPrefill): void {
  try {
    sessionStorage.setItem(SEARCH_PREFILL_KEY, JSON.stringify(prefill))
    sessionStorage.setItem('fw_active_tab', 'search')
  } catch {
    /* ignore */
  }
}

export function consumeSearchPrefill(): SearchPrefill | null {
  try {
    const raw = sessionStorage.getItem(SEARCH_PREFILL_KEY)
    if (!raw) return null
    sessionStorage.removeItem(SEARCH_PREFILL_KEY)
    const parsed = JSON.parse(raw) as SearchPrefill
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function openSearchFromDeals(prefill: SearchPrefill): void {
  stashSearchPrefill(prefill)
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT, { detail: prefill }))
}
