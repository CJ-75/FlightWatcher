/**
 * Prefetch JS d’une route au survol nav uniquement — pas de warm API.
 */

/** Prefetch a single route module on nav hover/focus. */
export function prefetchAdminRoute(path: string) {
  const map: Record<string, () => Promise<unknown>> = {
    '/admin/users': () => import('../pages/UsersCsmPage'),
    '/admin/onboarding': () => import('../pages/OnboardingPage'),
    '/admin/activite': () => import('../pages/ActivitePage'),
    '/admin/parcours': () => import('../pages/ParcoursAdminPage'),
    '/admin/activities': () => import('../pages/ActivitiesAdminPage'),
    '/admin/occasions': () => import('../pages/OccasionsPage'),
    '/admin/digests': () => import('../pages/DigestsPage'),
    '/admin/status': () => import('../pages/StatusPage'),
    '/admin/audit': () => import('../pages/AuditPage'),
  }
  const load = map[path]
  if (load) void load().catch(() => {})
}
