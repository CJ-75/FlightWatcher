/**
 * Brouillon de création / édition Parcours — 1 seul slot cache.
 * Rien en base tant que non publié (create) ou non enregistré (edit).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Itinerary, ItineraryItem, ItineraryOccasion } from '@flightwatcher/shared'
import type { DraftStep } from '../components/parcours/AddParcoursStepSheet'

const DISK_KEY = 'fw_parcours_create_draft_v1'

export type ParcoursCreateSession = {
  title: string
  city_slug: string
  cover_image: string | null
  /** Tag court → badge carte (1er occasions[]) */
  occasions: ItineraryOccasion[]
  steps: DraftStep[]
  /** Si défini : édition d’un parcours existant (admin). */
  editing_id: string | null
  /** Status courant en base (published/draft/retired) — évite un GET au save. */
  editing_status: string | null
  updated_at: number
}

let session: ParcoursCreateSession | null = null
let hydrated = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

function persistDisk() {
  if (session) {
    void AsyncStorage.setItem(DISK_KEY, JSON.stringify(session)).catch(
      () => undefined,
    )
  } else {
    void AsyncStorage.removeItem(DISK_KEY).catch(() => undefined)
  }
  notify()
}

export function subscribeParcoursCreateSession(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function getParcoursCreateSession(): ParcoursCreateSession | null {
  return session
}

export function hasParcoursCreateDraft(): boolean {
  return session != null
}

export function isEditingParcours(): boolean {
  return !!session?.editing_id
}

/** Charge le brouillon disque une fois (boot / hub). */
export async function hydrateParcoursCreateSession(): Promise<ParcoursCreateSession | null> {
  if (hydrated) return session
  hydrated = true
  try {
    const raw = await AsyncStorage.getItem(DISK_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ParcoursCreateSession
      if (parsed && typeof parsed.title === 'string' && parsed.city_slug) {
        session = {
          title: parsed.title,
          city_slug: parsed.city_slug,
          cover_image: parsed.cover_image ?? null,
          occasions: Array.isArray(parsed.occasions)
            ? (parsed.occasions as ItineraryOccasion[])
            : [],
          steps: Array.isArray(parsed.steps) ? parsed.steps : [],
          editing_id: parsed.editing_id ? String(parsed.editing_id) : null,
          editing_status: parsed.editing_status
            ? String(parsed.editing_status)
            : null,
          updated_at: parsed.updated_at || Date.now(),
        }
      }
    }
  } catch {
    session = null
  }
  notify()
  return session
}

export function itemToDraftStep(it: ItineraryItem, index: number): DraftStep {
  const meta = (it.meta || {}) as Record<string, unknown>
  const photosRaw = meta.photos
  const photos = Array.isArray(photosRaw)
    ? photosRaw.map(String).filter(Boolean).slice(0, 5)
    : it.photo
      ? [String(it.photo)]
      : []
  const budgetRaw = meta.budget_eur
  const budget_eur =
    typeof budgetRaw === 'number' && Number.isFinite(budgetRaw)
      ? budgetRaw
      : null
  const moment = it.moment
  return {
    localId: it.id || `edit-${index}`,
    kind: it.kind === 'place' ? 'place' : 'free',
    title: String(it.title || ''),
    note: String(it.note || ''),
    day_offset: Number.isFinite(Number(it.day_offset))
      ? Number(it.day_offset)
      : 0,
    moment:
      moment === 'morning' || moment === 'afternoon' || moment === 'evening'
        ? moment
        : null,
    photo: it.photo || photos[0] || null,
    photos,
    maps_url: String(meta.maps_url || ''),
    lat: typeof meta.lat === 'number' ? meta.lat : null,
    lng: typeof meta.lng === 'number' ? meta.lng : null,
    budget_eur,
    description: String(meta.description || ''),
  }
}

/** Remplit le slot unique pour éditer un parcours admin. */
export function beginEditParcoursSession(it: Itinerary): ParcoursCreateSession {
  const items = (it.itinerary_items || []) as ItineraryItem[]
  const occasions = (it.occasions || []).map(String).filter(Boolean) as ItineraryOccasion[]
  session = {
    title: String(it.title || 'Parcours'),
    city_slug: String(it.city_slug || 'paris'),
    cover_image: it.cover_image || null,
    occasions,
    steps: items.map((itItem, i) => itemToDraftStep(itItem, i)),
    editing_id: String(it.id),
    editing_status: String(
      (it as Itinerary & { status?: string }).status || 'published',
    ),
    updated_at: Date.now(),
  }
  persistDisk()
  return session
}

/**
 * Crée ou met à jour le brouillon unique.
 * Pas de 2e brouillon — on écrase / complète le slot unique.
 */
export function startParcoursCreateSession(input: {
  title: string
  city_slug: string
  cover_image?: string | null
  occasions?: ItineraryOccasion[]
  steps?: DraftStep[]
  editing_id?: string | null
  editing_status?: string | null
}): ParcoursCreateSession {
  session = {
    title: input.title,
    city_slug: input.city_slug,
    cover_image: input.cover_image ?? null,
    occasions: input.occasions
      ? [...input.occasions]
      : session?.occasions
        ? [...session.occasions]
        : [],
    steps: input.steps
      ? [...input.steps]
      : session?.steps
        ? [...session.steps]
        : [],
    editing_id:
      input.editing_id !== undefined
        ? input.editing_id
        : session?.editing_id || null,
    editing_status:
      input.editing_status !== undefined
        ? input.editing_status
        : session?.editing_status || null,
    updated_at: Date.now(),
  }
  persistDisk()
  return session
}

export function patchParcoursCreateSession(
  patch: Partial<Omit<ParcoursCreateSession, 'updated_at'>>,
): ParcoursCreateSession | null {
  if (!session) return null
  session = {
    ...session,
    ...patch,
    occasions: patch.occasions ? [...patch.occasions] : session.occasions,
    steps: patch.steps ? [...patch.steps] : session.steps,
    editing_id:
      patch.editing_id !== undefined ? patch.editing_id : session.editing_id,
    editing_status:
      patch.editing_status !== undefined
        ? patch.editing_status
        : session.editing_status,
    updated_at: Date.now(),
  }
  persistDisk()
  return session
}

/** Abandon / après publish — libère le slot pour un nouveau parcours. */
export function clearParcoursCreateSession(): void {
  session = null
  persistDisk()
}

/** Ouvre l’écran adapté pour reprendre le brouillon. */
export function resumeParcoursCreateRoute():
  | 'CreateParcours'
  | 'CreateParcoursSteps' {
  if (!session) return 'CreateParcours'
  if (session.steps.length > 0) return 'CreateParcoursSteps'
  return 'CreateParcours'
}
