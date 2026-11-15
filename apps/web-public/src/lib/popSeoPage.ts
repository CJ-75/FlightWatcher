import {
  buildPopDocumentTitle,
  buildPopH1,
  buildPopMetaDescription,
  evaluatePopIndexability,
  hasTravelTimesInItems,
  ITINERARY_DURATION_LABELS,
  tipsPerDayOk,
  type PopIndexResult,
} from '@waypop/shared'
import type { PublicItinerary } from '@/lib/parcoursApi'
import { fetchCityIndexable } from '@/lib/parcoursApi'

export async function assessPopIndex(
  itin: PublicItinerary,
  city: string,
): Promise<PopIndexResult> {
  const items = itin.itinerary_items || []
  const days = new Set(items.map((i) => Number(i.day_offset ?? 0)))
  const cityIndexable = await fetchCityIndexable(city)
  return evaluatePopIndexability({
    status: itin.status,
    is_demo: itin.is_demo,
    intro: itin.intro,
    cover_image: itin.cover_image,
    photo_license: itin.photo_license,
    verified_at: itin.verified_at,
    city_indexable: cityIndexable,
    indexable_override: itin.indexable_override as boolean | null | undefined,
    canonical_itinerary_id: itin.canonical_itinerary_id as string | null | undefined,
    stopCount: items.length,
    stopsWithNote: items.filter((i) => String(i.note || '').trim()).length,
    imageCount:
      (itin.cover_image ? 1 : 0) +
      items.filter((i) => String(i.photo || '').trim()).length,
    hasTravelTimes: hasTravelTimesInItems(items),
    tipsPerDayOk: tipsPerDayOk(itin.tips, Math.max(days.size, 1)),
    // Live price checked client-side island — page stays noindex until deal exists
    // unless override / soft gate. Default: false (honest).
    hasLivePrice: false,
  })
}

export function popSeoCopy(
  itin: PublicItinerary,
  cityLabel: string,
): { documentTitle: string; h1: string; description: string; durationLabel?: string } {
  const durationLabel =
    itin.duration_kind &&
    (ITINERARY_DURATION_LABELS[
      itin.duration_kind as keyof typeof ITINERARY_DURATION_LABELS
    ] ||
      String(itin.duration_kind))
  const title = String(itin.title || '')
  return {
    documentTitle: buildPopDocumentTitle({
      title,
      target_query: itin.target_query as string | undefined,
      cityLabel,
    }),
    h1: buildPopH1({
      title,
      target_query: itin.target_query as string | undefined,
    }),
    description: buildPopMetaDescription({
      intro: itin.intro,
      title,
      cityLabel,
      durationLabel: durationLabel || undefined,
      stopCount: (itin.itinerary_items || []).length,
    }),
    durationLabel: durationLabel || undefined,
  }
}
