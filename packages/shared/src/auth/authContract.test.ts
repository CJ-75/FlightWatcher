import { describe, expect, it } from 'vitest'
import {
  AUTH_CLIENT_METHODS,
  AUTH_LIVE_SMOKE_CHECKS,
  AUTH_PLATFORM_SURFACES,
  AUTH_PROVIDER_ORDER,
  assertAuthContractIntegrity,
  friendlyAuthError,
} from './authContract'
import { createSupabaseAuth } from './createSupabaseAuth'

describe('auth cross-platform contract', () => {
  it('keeps Next / Vite / Expo surfaces aligned', () => {
    const errors = assertAuthContractIntegrity()
    expect(errors).toEqual([])
    expect(AUTH_PLATFORM_SURFACES.map((s) => s.platform).sort()).toEqual([
      'expo',
      'next',
      'vite',
    ])
    expect([...AUTH_PROVIDER_ORDER]).toEqual(['google', 'apple', 'email'])
  })

  it('exposes required createSupabaseAuth methods', () => {
    const client = createSupabaseAuth({ apiBaseUrl: 'https://example.invalid' })
    for (const method of AUTH_CLIENT_METHODS) {
      expect(typeof client[method], method).toBe('function')
    }
  })

  it('maps common auth errors for UI', () => {
    expect(friendlyAuthError('Invalid login credentials')).toMatch(/incorrect/i)
    expect(friendlyAuthError('too many requests')).toMatch(/tentatives/i)
  })

  it('documents deferred live smoke (not run here)', () => {
    expect(AUTH_LIVE_SMOKE_CHECKS.length).toBeGreaterThanOrEqual(9)
    // Live OAuth / Resend / deep-link — AUTH_LIVE=1 later, not in unit CI.
    expect(process.env.AUTH_LIVE === '1').toBe(false)
  })
})
