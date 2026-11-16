#!/usr/bin/env node
/**
 * Deferred live auth smoke — Next / Vite / Expo.
 * Default: print checklist, exit 0 (no provider calls).
 * Later: AUTH_LIVE=1 (still manual until e2e driver lands).
 *
 * Contract source of truth: packages/shared/src/auth/authContract.ts
 * Unit lock: npm test -w @waypop/shared -- authContract
 */

const LIVE = process.env.AUTH_LIVE === '1'

const SURFACES = [
  { platform: 'next', sheet: 'AuthLightbox', callback: '/auth/callback' },
  { platform: 'vite', sheet: 'AuthSheet', callback: '/auth/callback' },
  { platform: 'expo', sheet: 'AuthSheet', callback: 'auth/callback deep link' },
]

const CHECKS = [
  'next-google — Pop like → Google → callback → keep',
  'next-email-login — password login',
  'next-email-signup — OTP / magic link (Resend SMTP)',
  'vite-google — SPA favorite → Google',
  'vite-email-login — password login',
  'vite-email-signup — magic link',
  'expo-google — native Google session',
  'expo-apple — Apple (iOS)',
  'expo-email-login — password login',
  'expo-email-signup — magic link deep link',
]

console.log('Auth surfaces (Google → Apple → Email | login=password, signup=OTP):')
for (const s of SURFACES) {
  console.log(`  - ${s.platform}: ${s.sheet} → ${s.callback}`)
}

console.log('\nLive smoke checklist:')
for (const c of CHECKS) {
  console.log(`  [ ] ${c}`)
}

if (!LIVE) {
  console.log(
    '\nDeferred — not executing. When ready: AUTH_LIVE=1 node scripts/auth-live-smoke.mjs',
  )
  process.exit(0)
}

console.log(
  '\nAUTH_LIVE=1: tick checklist manually (auto driver not wired yet).',
)
process.exit(0)
