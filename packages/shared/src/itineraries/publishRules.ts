import type { Itinerary, ItineraryItem } from './types'

export type PublishBlocker = {
  code: string
  message: string
}

export type PublishWarning = {
  code: string
  message: string
}

/** §4.3 — blocages avant publication. */
export function getPublishBlockers(
  itinerary: Partial<Itinerary> | null | undefined,
  items?: ItineraryItem[] | null,
): PublishBlocker[] {
  const steps = items ?? itinerary?.itinerary_items ?? []
  const blockers: PublishBlocker[] = []

  if (!String(itinerary?.intro || '').trim()) {
    blockers.push({ code: 'intro', message: 'Introduction requise (3–4 phrases).' })
  }
  if (!String(itinerary?.cover_image || '').trim()) {
    blockers.push({
      code: 'cover',
      message: 'Photo de couverture requise (ville ou upload).',
    })
  }
  if (!String(itinerary?.title || '').trim()) {
    blockers.push({ code: 'title', message: 'Titre requis.' })
  }
  if (!String(itinerary?.city_slug || '').trim()) {
    blockers.push({ code: 'city', message: 'Ville requise.' })
  }
  if (!String(itinerary?.slug || '').trim()) {
    blockers.push({ code: 'slug', message: 'Slug URL requis.' })
  }
  const anchored = steps.filter((step) => isAnchoredStep(step))
  if (anchored.length < 3) {
    blockers.push({
      code: 'steps_anchored_min',
      message: `Au moins 3 étapes lieu vérifié ou activité Viator (actuellement ${anchored.length}). Les étapes libres ne comptent pas.`,
    })
  }

  for (const [i, step] of steps.entries()) {
    const n = i + 1
    if (step.kind === 'place' && !step.place_id) {
      blockers.push({
        code: `place_${n}`,
        message: `Étape ${n} (lieu) : rattacher un lieu vérifié.`,
      })
    }
    if (step.kind === 'activity' && !String(step.viator_product_code || '').trim()) {
      blockers.push({
        code: `activity_${n}`,
        message: `Étape ${n} (activité) : code Viator requis.`,
      })
    }
    if (step.kind === 'free' && !String(step.title || '').trim()) {
      blockers.push({
        code: `free_${n}`,
        message: `Étape ${n} (libre) : titre requis.`,
      })
    }
  }

  return blockers
}

/** Lieu vérifié ou activité Viator — compte pour le seuil de publication. */
export function isAnchoredStep(step: Partial<ItineraryItem> | null | undefined): boolean {
  if (!step) return false
  if (step.kind === 'place' && step.place_id) return true
  if (step.kind === 'activity' && String(step.viator_product_code || '').trim()) {
    return true
  }
  return false
}

/** Avertissements non bloquants (étapes libres, etc.). */
export function getPublishWarnings(
  itinerary: Partial<Itinerary> | null | undefined,
  items?: ItineraryItem[] | null,
): PublishWarning[] {
  const steps = items ?? itinerary?.itinerary_items ?? []
  const warnings: PublishWarning[] = []
  for (const [i, step] of steps.entries()) {
    if (step.kind === 'free') {
      warnings.push({
        code: `free_no_place_${i + 1}`,
        message:
          'Étape sans lieu : elle n’apparaîtra pas dans l’itinéraire.',
      })
    }
  }
  return warnings
}

export function canPublish(
  itinerary: Partial<Itinerary> | null | undefined,
  items?: ItineraryItem[] | null,
): boolean {
  return getPublishBlockers(itinerary, items).length === 0
}
