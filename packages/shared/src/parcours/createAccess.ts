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

export function canCreateParcours(opts: {
  email?: string | null
  role?: ParcoursCreateRole | null
}): boolean {
  const email = normEmail(opts.email)
  // V1: single admin email only. Later: role admin|agent | featureFlag.
  if (email && PARCOURS_CREATE_ADMIN_EMAILS.some((e) => e === email)) {
    return true
  }
  void opts.role
  return false
}
