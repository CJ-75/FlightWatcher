/**
 * Séjour detail — seed instantané (liste / favoris) + singleflight getDeal.
 */
import type { TravelDeal } from '@flightwatcher/shared'
import { getApi } from './client'

const memory = new Map<string, TravelDeal>()
const inflight = new Map<string, Promise<TravelDeal>>()

function dealKeys(deal: TravelDeal): string[] {
  const keys = new Set<string>()
  const id = String(deal.id || '').trim()
  const key = String(deal.deal_key || '').trim()
  if (id) keys.add(id)
  if (key) keys.add(key)
  return [...keys]
}

export function rememberDealPreview(deal: TravelDeal | null | undefined) {
  if (!deal?.id && !deal?.deal_key) return
  for (const k of dealKeys(deal)) memory.set(k, deal)
}

export function rememberDealPreviews(deals: TravelDeal[] | null | undefined) {
  if (!deals?.length) return
  for (const d of deals) rememberDealPreview(d)
}

export function peekDealPreview(dealId: string): TravelDeal | null {
  const id = String(dealId || '').trim()
  if (!id) return null
  return memory.get(id) || null
}

/** Shared HTTP — pressIn prefetch + detail screen share one request. */
export function getDealCached(dealId: string): Promise<TravelDeal> {
  const id = String(dealId || '').trim()
  const pending = inflight.get(id)
  if (pending) return pending
  const req = getApi()
    .getDeal(id)
    .then((d) => {
      rememberDealPreview(d)
      return d
    })
    .finally(() => {
      inflight.delete(id)
    })
  inflight.set(id, req)
  return req
}

export function prefetchDealDetail(
  dealId: string,
  seed?: TravelDeal | null,
) {
  const id = String(dealId || seed?.deal_key || seed?.id || '').trim()
  if (seed) rememberDealPreview(seed)
  if (!id) return
  void getDealCached(id).catch(() => undefined)
}
