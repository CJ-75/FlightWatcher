/**
 * Brouillon de création Parcours — mémoire seule.
 * Rien n’est écrit en base tant que l’utilisateur n’a pas validé (publier).
 */
import type { DraftStep } from '../components/parcours/AddParcoursStepSheet'

export type ParcoursCreateSession = {
  title: string
  city_slug: string
  cover_image: string | null
  steps: DraftStep[]
}

let session: ParcoursCreateSession | null = null

export function getParcoursCreateSession(): ParcoursCreateSession | null {
  return session
}

export function startParcoursCreateSession(input: {
  title: string
  city_slug: string
  cover_image?: string | null
  steps?: DraftStep[]
}): ParcoursCreateSession {
  session = {
    title: input.title,
    city_slug: input.city_slug,
    cover_image: input.cover_image ?? null,
    steps: input.steps ? [...input.steps] : session?.steps || [],
  }
  return session
}

export function patchParcoursCreateSession(
  patch: Partial<ParcoursCreateSession>,
): ParcoursCreateSession | null {
  if (!session) return null
  session = {
    ...session,
    ...patch,
    steps: patch.steps ? [...patch.steps] : session.steps,
  }
  return session
}

export function clearParcoursCreateSession(): void {
  session = null
}
