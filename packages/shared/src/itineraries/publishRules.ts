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
  if (steps.length < 3) {
    blockers.push({
      code: 'steps_min',
      message: `Au moins 3 étapes (actuellement ${steps.length}).`,
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

export function canPublish(
  itinerary: Partial<Itinerary> | null | undefined,
  items?: ItineraryItem[] | null,
): boolean {
  return getPublishBlockers(itinerary, items).length === 0
}
