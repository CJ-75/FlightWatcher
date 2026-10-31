import type { HotelUpsellOption, TravelDealHotel } from '@flightwatcher/shared'

/** Normalize deal / my-trip hotel payloads for HotelComposeDetailSheet. */
export function toUpsellHotel(
  h: TravelDealHotel | HotelUpsellOption | Record<string, unknown> | null | undefined,
): HotelUpsellOption | null {
  if (!h || typeof h !== 'object') return null
  const r = h as Record<string, unknown>
  const id = String(r.id || r.hotel_id || '').trim()
  if (!id) return null
  return {
    id,
    hotel_id: String(r.hotel_id || r.id || id),
    name: r.name != null ? String(r.name) : undefined,
    stars: r.stars != null ? Number(r.stars) : undefined,
    rating: r.rating != null ? Number(r.rating) : undefined,
    review_count: r.review_count != null ? Number(r.review_count) : undefined,
    photo: r.photo != null ? String(r.photo) : r.thumbnail != null ? String(r.thumbnail) : undefined,
    thumbnail:
      r.thumbnail != null ? String(r.thumbnail) : r.photo != null ? String(r.photo) : undefined,
    board: r.board != null ? String(r.board) : undefined,
    hotel_pp: r.hotel_pp != null ? Number(r.hotel_pp) : undefined,
    public_hotel_price:
      r.public_hotel_price != null ? Number(r.public_hotel_price) : undefined,
    distance_m: r.distance_m != null ? Number(r.distance_m) : undefined,
    refundable: typeof r.refundable === 'boolean' ? r.refundable : undefined,
    cancel_deadline:
      r.cancel_deadline != null ? String(r.cancel_deadline) : null,
  }
}
