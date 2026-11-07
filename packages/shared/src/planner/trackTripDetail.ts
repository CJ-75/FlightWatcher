/**
 * Fire-and-forget trip detail analytics (CADRE §4).
 * Uses activities events endpoint + domain=planner.
 */

import { detectEventPlatform } from '../activities/platform'
import {
  TRIP_DETAIL_EVENTS,
  type TripDetailTabId,
  type TripDetailVariant,
} from './tripDetailView'

export type TripDetailTrackFn = (body: Record<string, unknown>) => Promise<unknown>

export function tripDetailEventPayload(opts: {
  event: string
  tripId: string
  variant: TripDetailVariant
  role?: 'organizer' | 'member'
  phase?: string
  tab?: TripDetailTabId
  action?: string
  kind?: 'flight' | 'hotel' | 'activity'
  itemType?: string
  dayOffset?: number
  moment?: string
  platform?: 'web' | 'ios' | 'android'
  meta?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    domain: 'planner',
    event: opts.event,
    surface: 'trip_detail',
    platform: detectEventPlatform(opts.platform),
    planned_trip_id: opts.tripId,
    meta: {
      variant: opts.variant,
      role: opts.role,
      phase: opts.phase,
      tab: opts.tab,
      action: opts.action,
      kind: opts.kind,
      item_type: opts.itemType,
      day_offset: opts.dayOffset,
      moment: opts.moment,
      ...(opts.meta || {}),
    },
  }
}

export async function trackTripDetailViewed(
  track: TripDetailTrackFn,
  opts: {
    tripId: string
    variant: TripDetailVariant
    role: 'organizer' | 'member'
    phase: string
    platform?: 'web' | 'ios' | 'android'
  },
): Promise<void> {
  await track(
    tripDetailEventPayload({
      event: TRIP_DETAIL_EVENTS.viewed,
      tripId: opts.tripId,
      variant: opts.variant,
      role: opts.role,
      phase: opts.phase,
      platform: opts.platform,
    }),
  ).catch(() => undefined)
}

export async function trackTripTabViewed(
  track: TripDetailTrackFn,
  opts: {
    tripId: string
    variant: TripDetailVariant
    tab: TripDetailTabId
    platform?: 'web' | 'ios' | 'android'
  },
): Promise<void> {
  await track(
    tripDetailEventPayload({
      event: TRIP_DETAIL_EVENTS.tabViewed,
      tripId: opts.tripId,
      variant: opts.variant,
      tab: opts.tab,
      platform: opts.platform,
    }),
  ).catch(() => undefined)
}

export { TRIP_DETAIL_EVENTS }
