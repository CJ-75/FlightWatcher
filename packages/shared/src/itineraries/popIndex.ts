/**
 * Pop public page — indexation threshold (provisional, recalibrate at 30–50 pops).
 * Override via POP_INDEX_* env on Next / API — do not hardcode in UI.
 */

export type PopIndexThreshold = {
  minIntroChars: number
  minAnchoredStops: number
  minNoteRatio: number
  minImages: number
  requireCoverLicense: boolean
  requireVerifiedAt: boolean
  requireTipsPerDay: boolean
  requireTravelTimes: boolean
  requireLivePrice: boolean
}

/** Provisional defaults — Paris pilot fails intro + licence + value-add today. */
export const POP_INDEX_THRESHOLD_DEFAULT: PopIndexThreshold = {
  minIntroChars: 80,
  minAnchoredStops: 4,
  minNoteRatio: 0.5,
  minImages: 3,
  requireCoverLicense: true,
  /** Value-add gates — keep true for mass-content protection; soft-fail in config for pilot */
  requireVerifiedAt: true,
  requireTipsPerDay: true,
  requireTravelTimes: true,
  requireLivePrice: true,
}

export type PopIndexInput = {
  status?: string | null
  is_demo?: boolean | null
  author_kind?: string | null
  intro?: string | null
  cover_image?: string | null
  photo_license?: string | null
  verified_at?: string | null
  tips?: unknown
  faq?: unknown
  city_indexable?: boolean
  indexable_override?: boolean | null
  canonical_itinerary_id?: string | null
  stopCount: number
  stopsWithNote: number
  imageCount: number
  hasTravelTimes?: boolean
  tipsPerDayOk?: boolean
  hasLivePrice?: boolean
}

export type PopIndexResult = {
  indexable: boolean
  reasons: string[]
}

export function evaluatePopIndexability(
  input: PopIndexInput,
  threshold: PopIndexThreshold = POP_INDEX_THRESHOLD_DEFAULT,
): PopIndexResult {
  const reasons: string[] = []

  if (input.indexable_override === false) {
    return { indexable: false, reasons: ['indexable_override=false'] }
  }
  if (input.indexable_override === true) {
    return { indexable: true, reasons: ['indexable_override=true'] }
  }

  if (String(input.status || '') !== 'published') reasons.push('not_published')
  if (input.is_demo) reasons.push('is_demo')
  if (input.canonical_itinerary_id) reasons.push('canonical_to_other')
  if (input.city_indexable === false) reasons.push('city_not_opened')

  const introLen = String(input.intro || '').trim().length
  if (introLen < threshold.minIntroChars) {
    reasons.push(`intro_lt_${threshold.minIntroChars}`)
  }
  if (threshold.requireCoverLicense) {
    if (!String(input.cover_image || '').trim()) reasons.push('no_cover')
    if (!String(input.photo_license || '').trim()) reasons.push('no_cover_license')
  }
  if (input.stopCount < threshold.minAnchoredStops) {
    reasons.push(`stops_lt_${threshold.minAnchoredStops}`)
  }
  const noteRatio =
    input.stopCount > 0 ? input.stopsWithNote / input.stopCount : 0
  if (noteRatio < threshold.minNoteRatio) {
    reasons.push(`notes_lt_${Math.round(threshold.minNoteRatio * 100)}pct`)
  }
  if (input.imageCount < threshold.minImages) {
    reasons.push(`images_lt_${threshold.minImages}`)
  }
  if (threshold.requireVerifiedAt && !input.verified_at) {
    reasons.push('no_verified_at')
  }
  if (threshold.requireTravelTimes && !input.hasTravelTimes) {
    reasons.push('no_travel_times')
  }
  if (threshold.requireTipsPerDay && !input.tipsPerDayOk) {
    reasons.push('no_tips_per_day')
  }
  if (threshold.requireLivePrice && !input.hasLivePrice) {
    reasons.push('no_live_price')
  }

  return { indexable: reasons.length === 0, reasons }
}

/** Human checklist for the Paris pilot (from Lot 0 stats). */
export const PARIS_PILOT_GAP_CHECKLIST = [
  { field: 'intro', need: '≥ 80 caractères', status: 'fail' as const },
  { field: 'photo_license (cover)', need: 'renseigné', status: 'fail' as const },
  { field: 'photo_source / photo_author', need: 'renseignés', status: 'fail' as const },
  { field: 'notes sur stops', need: '≥ 50 % (actuel ~44 %)', status: 'fail' as const },
  { field: 'stops', need: '≥ 4 (actuel 9)', status: 'ok' as const },
  { field: 'photos stops', need: 'comptent vers ≥ 3 images', status: 'ok' as const },
  { field: 'verified_at', need: 'date de vérification', status: 'fail' as const },
  { field: 'tips / conseil par jour', need: 'tips jsonb', status: 'fail' as const },
  { field: 'temps de trajet inter-stops', need: 'meta ou calcul stocké', status: 'fail' as const },
  { field: 'prix live (deal_assemble)', need: 'au moins 1 origin', status: 'unknown' as const },
  { field: 'target_query', need: 'mot-clé unique ville', status: 'fail' as const },
  { field: 'pop_index_cities.paris', need: 'indexable=true', status: 'fail' as const },
] as const
