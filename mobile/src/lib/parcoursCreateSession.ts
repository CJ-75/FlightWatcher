/**
 * Brouillon de création Parcours — 1 seul, en cache (mémoire + AsyncStorage).
 * Rien en base tant que non publié. Un nouveau parcours exige publier ou abandonner.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ItineraryOccasion } from '@flightwatcher/shared'
import type { DraftStep } from '../components/parcours/AddParcoursStepSheet'

const DISK_KEY = 'fw_parcours_create_draft_v1'

export type ParcoursCreateSession = {
  title: string
  city_slug: string
  cover_image: string | null
  /** Tag court → badge carte (1er occasions[]) */
  occasions: ItineraryOccasion[]
  steps: DraftStep[]
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
