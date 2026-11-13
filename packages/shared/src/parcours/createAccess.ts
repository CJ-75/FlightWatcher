/**
 * Who can create / edit parcours drafts in the product UI.
 * V1: single admin email. Later: role agent | user | feature flag.
 */
export type ParcoursCreateRole = 'admin' | 'agent' | 'user'

/** V1 allowlist — keep in sync with backend ADMIN_EMAILS. */
export const PARCOURS_CREATE_ADMIN_EMAILS = ['crisdu28@gmail.com'] as const

function normEmail(email?: string | null): string {
  return String(email || '')
    .trim()
    .toLowerCase()
}

/** Compte autorisé à voir le lien Admin (console /admin). */
export function isAdminAccountEmail(email?: string | null): boolean {
  const e = normEmail(email)
  return Boolean(e && PARCOURS_CREATE_ADMIN_EMAILS.some((x) => x === e))
}

export function canCreateParcours(opts: {
  email?: string | null
  role?: ParcoursCreateRole | null
  /**
   * Expo Go / __DEV__ only — UI bypass for local testing.
   * Backend must also accept X-FW-Client: expo (ALLOW_EXPO_ADMIN_BYPASS).
   */
  expoDevBypass?: boolean
}): boolean {
  if (opts.expoDevBypass) return true
  // V1: single admin email only. Later: role admin|agent | featureFlag.
  if (isAdminAccountEmail(opts.email)) {
    return true
  }
  void opts.role
  return false
}
