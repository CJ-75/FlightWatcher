/**
 * Typed admin API client — cookie session (ADMIN_PASSWORD) + optional Bearer.
 */
import { getAccessToken } from '../../lib/supabase'
import { apiUrl } from '../../utils/apiBase'

export class AdminApiError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

type FetchOpts = {
  method?: string
  body?: unknown
  signal?: AbortSignal
  query?: Record<string, string | number | boolean | undefined | null>
}

function withQuery(path: string, query?: FetchOpts['query']): string {
  if (!query) return path
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `${path}?${s}` : path
}

export async function adminFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  let token: string | null = null
  try {
    token = await getAccessToken()
  } catch {
    token = null
  }

  const controller = opts.signal ? null : new AbortController()
  const signal = opts.signal || controller!.signal
  const timeout = setTimeout(() => controller?.abort(), 60000)

  try {
    const res = await fetch(apiUrl(withQuery(path, opts.query)), {
      method: opts.method || 'GET',
      credentials: 'include',
      signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    if (!res.ok) {
      const detail =
        typeof data === 'object' && data && 'detail' in data
          ? String((data as { detail: unknown }).detail)
          : res.statusText
      throw new AdminApiError(detail || 'Request failed', res.status, data)
    }
    return data as T
  } finally {
    clearTimeout(timeout)
  }
}

export const adminApi = {
  overview: (force = false) =>
    adminFetch<Record<string, unknown>>('/api/admin/overview', { query: { force } }),

  inscritsStats: (force = false) =>
    adminFetch<{
      ok: boolean
      total: number
      onboarded: number
      pending: number
      onboarded_pct: number
      cached?: boolean
    }>('/api/admin/inscrits/stats', { query: { force } }),

  inscrits: (opts: {
    page?: number
    page_size?: number
    q?: string
    onboarding?: 'all' | 'done' | 'pending'
  } = {}) =>
    adminFetch<{
      ok: boolean
      users: Array<{
        id: string
        email?: string
        nom?: string
        inscrit_le?: string
        onboarding_fait?: boolean
        onboarding_le?: string
        ville?: string
        aeroport?: string
      }>
      total: number
      page: number
      page_size: number
      inscrits_total: number
      onboarded: number
      pending: number
      onboarded_pct: number
    }>('/api/admin/inscrits', {
      query: {
        page: opts.page ?? 1,
        page_size: opts.page_size ?? 50,
        q: opts.q,
        onboarding: opts.onboarding ?? 'all',
      },
    }),
  productFunnel: (days = 14) =>
    adminFetch('/api/admin/product-funnel', { query: { days } }),
  parcoursQuality: () => adminFetch('/api/admin/parcours-quality'),
  userTimeline: (userId: string) =>
    adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/timeline`),
  addUserNote: (userId: string, note: string) =>
    adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/notes`, {
      method: 'POST',
      body: { note },
    }),

  opsJobs: () => adminFetch<{ ok: boolean; jobs: Array<Record<string, unknown>> }>('/api/admin/ops/jobs'),
  runOps: (jobId: string, params?: Record<string, unknown>, confirm = false) =>
    adminFetch(`/api/admin/ops/deals/${encodeURIComponent(jobId)}`, {
      method: 'POST',
      body: { params: params || {}, confirm },
    }),
  stepUp: (password: string) =>
    adminFetch('/api/admin/security/step-up', { method: 'POST', body: { password } }),

  growthKpis: () => adminFetch('/api/admin/growth/kpis'),
  growthCohorts: (days = 28) =>
    adminFetch('/api/admin/growth/cohorts', { query: { days } }),
  digests: () => adminFetch('/api/admin/growth/digests'),
  calendar: () => adminFetch('/api/admin/growth/calendar'),

  sejoursInventory: () => adminFetch('/api/admin/sejours/inventory'),
  partnersHealth: () => adminFetch('/api/admin/partners/health'),
  bookingFails: () => adminFetch('/api/admin/bookings/fails'),

  status: () => adminFetch('/api/admin/status'),
  storeConfig: () => adminFetch('/api/admin/store/config'),
  storeReadiness: () => adminFetch('/api/admin/store/readiness'),
  updateStoreConfig: (body: Record<string, unknown>) =>
    adminFetch('/api/admin/store/config', { method: 'PUT', body }),

  audit: (limit = 100) => adminFetch('/api/admin/audit', { query: { limit } }),

  agents: () => adminFetch<{ ok: boolean; agents: AgentRow[] }>('/api/admin/agents'),
  updateAgent: (id: string, body: { enabled?: boolean; prompt?: string }) =>
    adminFetch(`/api/admin/agents/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  runAgent: (id: string) =>
    adminFetch(`/api/admin/agents/${encodeURIComponent(id)}/run`, { method: 'POST' }),
  agentRuns: () => adminFetch('/api/admin/agents/runs'),
  agentProposals: (status = 'pending') =>
    adminFetch('/api/admin/agents/proposals', { query: { status } }),
  decideProposal: (id: string, approve: boolean) =>
    adminFetch(`/api/admin/agents/proposals/${encodeURIComponent(id)}/decide`, {
      method: 'POST',
      body: { approve },
    }),

  // legacy admin endpoints still used
  users: (page = 1, pageSize = 50) =>
    adminFetch('/api/admin/users', { query: { page, page_size: pageSize } }),
  plans: () => adminFetch('/api/admin/plans'),
  settings: () => adminFetch('/api/admin/settings'),
  dealsMetrics: () => adminFetch('/api/admin/deals-metrics'),
}

export type AgentRow = {
  id: string
  name?: string
  description?: string
  enabled: boolean
  prompt: string
  default_prompt?: string
  updated_at?: string | null
  updated_by?: string | null
}
