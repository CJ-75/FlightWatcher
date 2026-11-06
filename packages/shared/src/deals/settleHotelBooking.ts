import type { HotelBooking } from '../types'

const TERMINAL = new Set(['confirmed', 'failed', 'cancelled'])

/**
 * Poll while LiteAPI booking is still `booking_pending`.
 * Does not invent success — returns last status (may still be pending).
 */
export async function settleHotelBooking(
  current: HotelBooking,
  refetch: () => Promise<HotelBooking>,
  opts?: { maxAttempts?: number; delayMs?: number },
): Promise<HotelBooking> {
  if (TERMINAL.has(String(current.status || ''))) return current
  if (current.status !== 'booking_pending') return current

  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 8)
  const delayMs = Math.max(400, opts?.delayMs ?? 1500)
  let last = current
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs))
    last = await refetch()
    if (TERMINAL.has(String(last.status || ''))) return last
    if (last.status !== 'booking_pending') return last
  }
  return last
}

export function hotelBookingIsConfirmed(booking: HotelBooking | null | undefined): boolean {
  return String(booking?.status || '') === 'confirmed'
}

const INVOICE_STATUSES = new Set([
  'confirmed',
  'payment_succeeded',
  'booking_pending',
])

/** True when Nuitee guest invoice can be fetched for this booking. */
export function hotelBookingHasInvoice(
  booking: HotelBooking | null | undefined,
): boolean {
  if (!booking) return false
  if (booking.invoice_available === true) return true
  if (booking.invoice_available === false) return false
  const status = String(booking.status || '')
  if (!INVOICE_STATUSES.has(status)) return false
  return Boolean(String(booking.liteapi_booking_id || '').trim())
}
