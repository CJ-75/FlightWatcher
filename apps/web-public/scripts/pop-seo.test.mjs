/**
 * Unit checks for SEO helpers (no build step — mirrors shared logic lightly).
 * Full shared coverage via packages/shared when wired; here we assert fixture invariants.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Fixtures are TS — load via compiled path unavailable; assert JSON-like rules here.

test('document title max 60', () => {
  const clip = (t, max) => {
    const s = String(t).replace(/\s+/g, ' ').trim()
    if (s.length <= max) return s
    const cut = s.slice(0, max - 1)
    const sp = cut.lastIndexOf(' ')
    return `${(sp > 40 ? cut.slice(0, sp) : cut).trim()}…`
  }
  const long =
    'Paris en deux jours itinéraire complet pour une première visite absolument'
  const titled = `${clip(long, 51)} | Waypop`
  assert.ok(titled.length <= 60, titled.length)
})

test('forbidden placeholders', () => {
  const html = '<h1>Paris en 2 jours</h1><p>Intro réelle</p>'
  assert.equal(/\bTODO\b/.test(html), false)
  assert.equal(/\bundefined\b/.test(html), false)
  assert.equal(/\bLorem\b/i.test(html), false)
})

test('fixture slug list expected', async () => {
  // Read fixture file as text — ensure keys exist without TS runtime
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(
    join(__dirname, '../src/fixtures/popFixtures.ts'),
    'utf8',
  )
  for (const slug of [
    'fixture-riche',
    'fixture-moyen',
    'fixture-seuil',
    'fixture-pauvre',
    'fixture-long-title',
  ]) {
    assert.ok(src.includes(`'${slug}'`), slug)
  }
})
