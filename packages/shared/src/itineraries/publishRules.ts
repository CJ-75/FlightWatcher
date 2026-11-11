import type { Itinerary, ItineraryItem } from './types'

export type PublishBlocker = {
  code: string
  message: string
}

export type PublishWarning = {
  code: string
  message: string
}

function stepMeta(step: Partial<ItineraryItem> | null | undefined): Record<string, unknown> {
  const m = step?.meta
  return m && typeof m === 'object' ? (m as Record<string, unknown>) : {}
}

/** Étape utilisable pour publier (lieu / Viator / étape libre avec titre). */
export function isAnchoredStep(step: Partial<ItineraryItem> | null | undefined): boolean {
  if (!step) return false
  if (step.kind === 'place' && step.place_id) return true
  if (step.kind === 'activity' && String(step.viator_product_code || '').trim()) {
    return true
  }
  // Étapes libres (create mobile) : titre suffit — notes non requises
  if ((step.kind === 'free' || !step.kind) && String(step.title || '').trim()) {
    return true
  }
  return false
}

/** §4.3 — blocages avant publication (assoupli : pas de lieux vérifiés obligatoires). */
export function getPublishBlockers(
  itinerary: Partial<Itinerary> | null | undefined,
  items?: ItineraryItem[] | null,
): PublishBlocker[] {
  const steps = items ?? itinerary?.itinerary_items ?? []
  const blockers: PublishBlocker[] = []

  if (!String(itinerary?.intro || '').trim()) {
    blockers.push({ code: 'intro', message: 'Introduction requise.' })
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

  const ready = steps.filter((step) => isAnchoredStep(step))
  if (ready.length < 1) {
    blockers.push({
      code: 'steps_min',
      message: 'Ajoute au moins une étape.',
    })
  }

  for (const [i, step] of steps.entries()) {
    const n = i + 1
    if (step.kind === 'place' && !step.place_id) {
      blockers.push({
        code: `place_${n}`,
        message: `Étape ${n} (lieu) : rattacher un lieu ou la passer en étape libre.`,
      })
    }
    if (step.kind === 'activity' && !String(step.viator_product_code || '').trim()) {
      blockers.push({
        code: `activity_${n}`,
        message: `Étape ${n} (activité) : code Viator requis.`,
      })
    }
    if ((step.kind === 'free' || !step.kind) && !String(step.title || '').trim()) {
      blockers.push({
        code: `free_${n}`,
        message: `Étape ${n} : titre requis.`,
      })
    }
  }

  return blockers
}

/** Avertissements non bloquants. */
export function getPublishWarnings(
  itinerary: Partial<Itinerary> | null | undefined,
  items?: ItineraryItem[] | null,
): PublishWarning[] {
  const steps = items ?? itinerary?.itinerary_items ?? []
  const warnings: PublishWarning[] = []
  for (const [i, step] of steps.entries()) {
    if (step.kind !== 'free' && step.kind) continue
    const meta = stepMeta(step)
    const maps = String(meta.maps_url || '').trim()
    if (!maps) {
      warnings.push({
        code: `free_no_maps_${i + 1}`,
        message: `Étape ${i + 1} : lien Maps manquant (conseillé).`,
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
